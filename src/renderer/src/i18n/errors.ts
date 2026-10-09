import type { TFunction } from 'i18next'

// Error messages written by this app's main process (and the most common Supabase auth
// errors). They are matched by their exact English text so the IPC contract stays unchanged;
// anything unrecognised (raw server text) is shown as is.
const ERROR_KEYS: Record<string, string> = {
  'Supabase is not configured': 'errors.notConfigured',
  'Enter a valid email address': 'errors.invalidEmail',
  'Password must be at least 8 characters': 'errors.passwordShort',
  'Enter your name': 'errors.enterName',
  'Enter your email and password': 'errors.enterCredentials',
  'Organization name must be 1-100 characters': 'errors.orgNameLength',
  'Invalid request': 'errors.invalidRequest',
  'Invalid organization': 'errors.invalidOrganization',
  'Invalid invitation': 'errors.invalidInvitation',
  'Role must be manager or member': 'errors.invalidRole',
  'Invalid update': 'errors.invalidUpdate',
  'Invalid login credentials': 'errors.invalidLogin',
  'Email not confirmed': 'errors.emailNotConfirmed',
  'User already registered': 'errors.userExists',
}

export function translateError(
  t: TFunction,
  message: string | undefined,
  fallbackKey: string,
): string {
  if (!message) return t(fallbackKey)
  const key = ERROR_KEYS[message]
  return key ? t(key) : message
}
