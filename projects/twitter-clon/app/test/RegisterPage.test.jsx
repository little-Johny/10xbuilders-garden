import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/contexts/AuthContext'
import RegisterPage from '../src/pages/RegisterPage'

describe('RegisterPage', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch = jest.fn()
  })

  it('envía datos a /api/auth/register', async () => {
    const user = userEvent.setup()
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: {
          access_token: 'at',
          refresh_token: 'rt',
          expires_at: 999,
        },
        user: { id: 'uid', email: 'new@b.com' },
      }),
    })

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/^correo$/i), 'new@b.com')
    await user.type(screen.getByLabelText(/^contraseña$/i), 'secret123')
    await user.type(screen.getByLabelText(/nombre de usuario/i), 'usuario_test')
    await user.click(screen.getByRole('button', { name: /registrarse/i }))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'new@b.com',
          password: 'secret123',
          username: 'usuario_test',
        }),
      })
    )
  })
})
