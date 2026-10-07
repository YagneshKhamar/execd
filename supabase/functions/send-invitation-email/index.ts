// Execd — invite-time email delivery.
//
// Deploy with `supabase functions deploy send-invitation-email`, then wire it up as a Database
// Webhook (Dashboard → Database → Webhooks) on `invitations`, events INSERT and UPDATE, pointing
// at this function's URL, with the same "Webhook-Secret" header as send-notification-email.
//
// This is separate from send-notification-email because the invitee has no Supabase account yet:
// there is no notifications row / profiles row to join, only invitations.email.
//
// UPDATE fires on every status change (accept/revoke/expire) and on the claim below, so we only
// send when the row is still pending/sent, unexpired, and invitation_email_sent_at is null.
// create_invitation nulls that column on a renewal, which is what makes a re-invite resend.
//
// Sends over SMTP (no verified domain needed if your mail provider lets you send as the account).
// Required secrets: SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM, WEBHOOK_SECRET; optional
// SMTP_PORT (default 587) and APP_URL. For Gmail use an app password, and EMAIL_FROM must be the
// same address as SMTP_USER. See send-notification-email for why the secret check and DB re-read matter.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const smtpHost = Deno.env.get('SMTP_HOST')
  const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587')
  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPass = Deno.env.get('SMTP_PASS')
  const from = Deno.env.get('EMAIL_FROM')
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
  if (!smtpHost || !smtpUser || !smtpPass || !from || !webhookSecret) {
    console.error('SMTP_HOST / SMTP_USER / SMTP_PASS / EMAIL_FROM / WEBHOOK_SECRET not configured')
    return new Response('Not configured', { status: 500 })
  }

  if (req.headers.get('Webhook-Secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = (await req.json()) as { record?: { id?: string } }
  const id = payload.record?.id
  if (!id) return new Response('Skipped', { status: 200 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') as string,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string,
  )

  // Claim the row atomically: only one delivery of the webhook can flip the marker from null,
  // so retries and the claim's own UPDATE event never produce a second email. Everything the
  // recipient sees comes from this DB row, never from the webhook body.
  const { data: claimed, error: claimError } = await supabase
    .from('invitations')
    .update({ invitation_email_sent_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending', 'sent'])
    .gt('expires_at', new Date().toISOString())
    .is('invitation_email_sent_at', null)
    .select('email, role, organization_id, invited_by')
    .maybeSingle()
  if (claimError) {
    console.error('Invitation claim failed', id, claimError.message)
    return new Response('Claim failed (logged)', { status: 200 })
  }
  if (!claimed) return new Response('Skipped', { status: 200 })

  const releaseClaim = () =>
    supabase.from('invitations').update({ invitation_email_sent_at: null }).eq('id', id)

  const [{ data: org }, { data: inviter }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', claimed.organization_id).single(),
    supabase.from('profiles').select('display_name, email').eq('id', claimed.invited_by).single(),
  ])
  const orgName = org?.name ?? 'an organization'
  const inviterName = inviter?.display_name || inviter?.email || 'A manager'

  const appUrl = Deno.env.get('APP_URL')
  const text = [
    `${inviterName} invited you to join ${orgName} on Execd as a ${claimed.role}.`,
    `Sign up or sign in to Execd with this email address (${claimed.email}) and you'll see the invitation waiting for you. It expires in 7 days.`,
    appUrl ? `Execd: ${appUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  // Port 465 is implicit TLS; 587 starts plain and upgrades via STARTTLS.
  const client = new SMTPClient({
    connection: {
      hostname: smtpHost,
      port: smtpPort,
      tls: smtpPort === 465,
      auth: { username: smtpUser, password: smtpPass },
    },
  })

  try {
    await client.send({
      from,
      to: claimed.email,
      subject: `You're invited to ${orgName} on Execd`,
      content: text,
    })
  } catch (err) {
    console.error('SMTP send failed', (err as Error).message)
    // Release so a manual re-invite (or webhook redelivery) can try again. Always 200: the
    // caller is a fire-and-forget webhook, never the manager's invite action.
    await releaseClaim()
    return new Response('Send failed (logged)', { status: 200 })
  } finally {
    try {
      await client.close()
    } catch {
      // connection already torn down by a failed send
    }
  }

  return new Response('Sent', { status: 200 })
})
