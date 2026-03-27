import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

const AuthContext = createContext(null)

const STORAGE_KEY = 'tc_session'

async function fetchProfile(username, accessToken) {
  const res = await fetch(`/api/profiles/${username}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return null
  return data.profile ?? null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setSession(parsed)
        // Usar el perfil cacheado inmediatamente; se actualiza al editar
        if (parsed?.profile) setProfile(parsed.profile)
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
    setReady(true)
  }, [])

  const persist = useCallback((nextSession, nextProfile) => {
    setSession(nextSession)
    setProfile(nextProfile ?? null)
    if (nextSession) {
      const bundle = nextProfile
        ? { ...nextSession, profile: nextProfile }
        : nextSession
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const login = useCallback(
    async (email, password) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar sesión')
      }
      const bundle = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        user: data.user,
      }
      // Cargar perfil por email (necesitamos saber el username)
      // Lo obtenemos vía GET /profiles buscando por user id no está expuesto directamente,
      // así que usamos el endpoint con token para obtener el propio perfil
      const profileRes = await fetch('/api/profiles/me', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
      const profileData = await profileRes.json().catch(() => ({}))
      const p = profileRes.ok ? profileData.profile : null
      persist(bundle, p)
    },
    [persist]
  )

  const register = useCallback(
    async (email, password, username, displayName) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          username,
          display_name: displayName || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Error al registrarse')
      }
      const bundle = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        user: data.user,
      }
      const p = await fetchProfile(username.trim().toLowerCase(), data.session.access_token)
      persist(bundle, p)
    },
    [persist]
  )

  const logout = useCallback(() => {
    persist(null, null)
  }, [persist])

  const updateProfile = useCallback((nextProfile) => {
    setProfile(nextProfile)
    setSession((prev) => {
      if (!prev) return prev
      const updated = { ...prev, profile: nextProfile }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, profile, ready, login, register, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}
