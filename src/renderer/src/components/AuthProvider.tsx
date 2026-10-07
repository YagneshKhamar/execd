import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type AuthState = Awaited<ReturnType<Window['api']['auth']['getState']>>

interface AuthContextValue {
  state: AuthState | null
  localOnly: boolean
  refresh: () => Promise<void>
  continueLocalOnly: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<AuthState | null>(null)
  const [localOnly, setLocalOnly] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setState(await window.api.auth.getState())
    } catch {
      setState({ configured: true, signedIn: false, user: null, organization: null })
    }
  }, [])

  const signOut = useCallback(async () => {
    await window.api.auth.signOut()
    setLocalOnly(false)
    await refresh()
  }, [refresh])

  const continueLocalOnly = useCallback(() => setLocalOnly(true), [])

  useEffect(() => {
    async function load(): Promise<void> {
      await refresh()
    }
    load()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ state, localOnly, refresh, continueLocalOnly, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
