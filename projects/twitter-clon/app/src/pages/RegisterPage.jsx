import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { useAuth } from '../contexts/AuthContext'

export default function RegisterPage() {
  const { register, session, ready } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (ready && session) navigate('/', { replace: true })
  }, [ready, session, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await register(email, password, username, displayName)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-x-black text-x-text flex items-center justify-center">
        <BrandLogo className="h-10 w-10 animate-pulse text-x-text" />
      </div>
    )
  }

  if (session) return null

  return (
    <main className="min-h-screen bg-x-black text-x-text flex flex-col items-center justify-center p-6">
      <div className="mb-8 flex flex-col items-center gap-2">
        <BrandLogo className="h-12 w-12 text-x-text" />
        <h1 className="text-xl font-bold tracking-tight">Crea tu cuenta</h1>
      </div>

      <div className="w-full max-w-[360px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="reg-email"
              className="mb-1.5 block text-[13px] font-medium text-x-text"
            >
              Correo
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="x-input"
              required
            />
          </div>
          <div>
            <label
              htmlFor="reg-password"
              className="mb-1.5 block text-[13px] font-medium text-x-text"
            >
              Contraseña
            </label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="x-input"
              required
            />
          </div>
          <div>
            <label
              htmlFor="reg-username"
              className="mb-1.5 block text-[13px] font-medium text-x-text"
            >
              Nombre de usuario
            </label>
            <input
              id="reg-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="minúsculas, números y _"
              className="x-input"
              required
            />
          </div>
          <div>
            <label
              htmlFor="reg-display"
              className="mb-1.5 block text-[13px] font-medium text-x-text"
            >
              Nombre para mostrar{' '}
              <span className="font-normal text-x-secondary">(opcional)</span>
            </label>
            <input
              id="reg-display"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="x-input"
            />
          </div>
          {error ? (
            <p className="text-[15px] text-red-500" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="x-btn-primary w-full py-3">
            Registrarse
          </button>
        </form>
        <p className="mt-8 text-center text-[15px] text-x-secondary">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="x-link font-medium">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  )
}
