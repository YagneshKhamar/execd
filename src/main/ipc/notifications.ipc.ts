import { ipcMain } from 'electron'
import { getSupabaseClient } from '../supabase/client'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function registerNotificationHandlers(): void {
  ipcMain.handle('notifications:list', async () => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, task_id, title, body, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return { success: false, error: error.message }

    return { success: true, notifications: data }
  })

  ipcMain.handle('notifications:mark-read', async (_e, ids: string[] | null) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }

    if (ids !== null && (!Array.isArray(ids) || !ids.every((id) => UUID_PATTERN.test(id)))) {
      return { success: false, error: 'Invalid notification ids' }
    }

    const { error } = await supabase.rpc('mark_notifications_read', { notification_ids: ids })
    if (error) return { success: false, error: error.message }
    return { success: true }
  })
}
