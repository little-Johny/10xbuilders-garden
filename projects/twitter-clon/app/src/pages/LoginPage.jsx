import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { login, session, ready } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (ready && session) navigate('/', { replace: true })
  }, [ready, session, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
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
        <h1 className="text-xl font-bold tracking-tight">Entra en X</h1>
      </div>

      <div className="w-full max-w-[360px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-[13px] font-medium text-x-text"
            >
              Teléfono, correo o usuario
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="x-input"
              placeholder="Correo electrónico"
              required
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-[13px] font-medium text-x-text"
            >
              Contraseña
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="x-input"
              required
            />
          </div>
          {error ? (
            <p className="text-[15px] text-red-500" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="x-btn-primary w-full py-3">
            Siguiente
          </button>
        </form>
        <p className="mt-8 text-center text-[15px] text-x-secondary">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="x-link font-medium">
            Regístrate
          </Link>
        </p>
      </div>
    </main>
  )
}
