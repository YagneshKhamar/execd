// Execd — Phase 9 email delivery.
//
// Deploy with `supabase functions deploy send-notification-email`, then wire it up as a
// Database Webhook (Dashboard → Database → Webhooks) on `notifications`, event INSERT,
// pointing at this function's URL. Only fires for the notification types listed below — the
// event-driven ones (completed/blocked) already have an in-app inbox and a desktop
// notification from Phase 8, so a same-instant email for those would just be noise.
//
// Required secrets (`supabase secrets set NAME=value`):
//   RESEND_API_KEY   — from resend.com
//   EMAIL_FROM       — a sender address on a domain verified in Resend (e.g. "Execd <team@yourdomain.com>")
//   WEBHOOK_SECRET   — a random string; set the same value as a custom header on the Database
//                      Webhook ("Webhook-Secret") so this function can tell a real webhook call
//                      from anyone who has the app's anon key and calls this URL directly.
//                      Supabase Edge Functions accept any valid JWT, and the published anon key
//                      is itself a valid JWT, so without this check ANYONE who installs the app
//                      could POST a forged { record: {...} } body here and make it send an email
//                      "from" this project to any user_id they choose, with arbitrary text.
//   APP_URL          — optional, included in the email body as a plain-text reminder to open Execd
//
// This function never runs inside the Electron app and never sees the app's publishable key;
// it uses the Supabase service-role key, which is safe here because Edge Functions run on
// Supabase's server, not on a user's machine. Because it holds that key, it must never trust
// the request body's `record` fields for anything the recipient sees without first confirming
// the request came from the real webhook (secret check) and the row actually exists (DB check).

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2'

const EMAILED_TYPES = new Set(['task_assigned', 'invitation_accepted'])

interface NotificationRow {
  id: string
  user_id: string
  type: string
  title: string
  body: string
}

function subjectFor(row: NotificationRow): string {
  if (row.type === 'task_assigned') return `New task: ${row.title}`
  if (row.type === 'invitation_accepted') return `${row.body || 'Someone'} joined ${row.title}`
  return row.title
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
  if (!resendKey || !from || !webhookSecret) {
    console.error('RESEND_API_KEY / EMAIL_FROM / WEBHOOK_SECRET not configured')
    return new Response('Not configured', { status: 500 })
  }

  // Reject anything that isn't the real Database Webhook. Without this, the anon key alone
  // (which every install of the app has) is enough to call this URL directly with a forged
  // body, since Edge Functions accept any valid JWT by default.
  if (req.headers.get('Webhook-Secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = (await req.json()) as { record?: NotificationRow }
  const row = payload.record
  if (!row || !EMAILED_TYPES.has(row.type)) {
    return new Response('Skipped', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') as string,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string,
  )

  // Re-read the notification row itself rather than trusting the webhook payload's title/body
  // verbatim — defense in depth in case the webhook secret ever leaks, since this also confirms
  // the row genuinely exists with this id/user_id/type combination.
  const { data: notification, error: notificationError } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body')
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .eq('type', row.type)
    .single()
  if (notificationError || !notification) {
    console.error('Notification row not found', row.id, notificationError?.message)
    return new Response('Not found', { status: 200 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', notification.user_id)
    .single()
  if (error || !profile?.email) {
    console.error('No profile email for notification', notification.id, error?.message)
    return new Response('No recipient', { status: 200 })
  }

  const appUrl = Deno.env.get('APP_URL')
  const bodyText = [
    notification.body,
    notification.type === 'task_assigned' ? 'Open Execd to see the details.' : null,
    appUrl ? `Execd: ${appUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: profile.email,
      subject: subjectFor(notification),
      text: bodyText || subjectFor(notification),
    }),
  })

  if (!send.ok) {
    const detail = await send.text()
    console.error('Resend send failed', send.status, detail)
    // Notification-delivery failures must never surface as a task-creation failure — the
    // caller is a fire-and-forget database webhook, not the app's own task-write path.
    return new Response('Send failed (logged)', { status: 200 })
  }

  return new Response('Sent', { status: 200 })
})
