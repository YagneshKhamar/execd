import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function storagePath(): string {
  const name = app.isPackaged ? 'supabase-auth.bin' : 'supabase-auth-dev.bin'
  return join(app.getPath('userData'), name)
}

function load(): Record<string, string> {
  const path = storagePath()
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path)
    const text = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString('utf8')
    return JSON.parse(text) as Record<string, string>
  } catch {
    return {}
  }
}

function save(data: Record<string, string>): void {
  const text = JSON.stringify(data)
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(text)
    : Buffer.from(text, 'utf8')
  writeFileSync(storagePath(), payload)
}

// Synchronous storage adapter for supabase-js so the refresh token never sits in plaintext
// on disk when the OS keychain is available.
export const encryptedSessionStorage = {
  getItem(key: string): string | null {
    return load()[key] ?? null
  },
  setItem(key: string, value: string): void {
    const data = load()
    data[key] = value
    save(data)
  },
  removeItem(key: string): void {
    const data = load()
    delete data[key]
    save(data)
  },
}
