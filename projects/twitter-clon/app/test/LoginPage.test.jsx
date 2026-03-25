import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/contexts/AuthContext'
import LoginPage from '../src/pages/LoginPage'

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch = jest.fn()
  })

  it('envía credenciales a /api/auth/login', async () => {
    const user = userEvent.setup()
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: {
          access_token: 'at',
          refresh_token: 'rt',
          expires_at: 999,
        },
        user: { id: 'uid', email: 'a@b.com' },
      }),
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    await user.type(screen.getByPlaceholderText(/correo electrónico/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^contraseña$/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /siguiente/i }))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', password: 'secret123' }),
      })
    )
  })
})
