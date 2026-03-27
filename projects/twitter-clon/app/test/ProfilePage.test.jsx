import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../src/contexts/AuthContext'
import ProfilePage from '../src/pages/ProfilePage'

const mockProfile = {
  id: 'uid',
  username: 'johndoe',
  display_name: 'John Doe',
  bio: 'Soy un usuario de prueba',
  avatar_url: null,
}

const mockTweets = [
  {
    id: 't1',
    content: 'Hola desde el perfil',
    created_at: '2024-01-01T00:00:00.000Z',
    author_id: 'uid',
  },
]

function renderWithRoute(username, sessionData = null) {
  if (sessionData) {
    localStorage.setItem('tc_session', JSON.stringify(sessionData))
  }
  return render(
    <MemoryRouter initialEntries={[`/profile/${username}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/profile/:username" element={<ProfilePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch = jest.fn()
  })

  it('muestra el perfil del usuario', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: mockProfile, tweets: mockTweets }),
    })

    renderWithRoute('johndoe')

    expect(await screen.findByText('Soy un usuario de prueba')).toBeInTheDocument()
    expect(screen.getByText('Hola desde el perfil')).toBeInTheDocument()
  })

  it('muestra botón Editar perfil solo si es el propio usuario', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: mockProfile, tweets: [] }),
      })

    renderWithRoute('johndoe', {
      access_token: 'tok',
      refresh_token: 'r',
      expires_at: 9999,
      user: { id: 'uid', email: 'a@b.com' },
      profile: { username: 'johndoe', display_name: 'John Doe', avatar_url: null },
    })

    expect(await screen.findByRole('button', { name: /editar perfil/i })).toBeInTheDocument()
  })

  it('NO muestra Editar perfil para otro usuario', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        profile: { ...mockProfile, username: 'otrousuario' },
        tweets: [],
      }),
    })

    renderWithRoute('otrousuario', {
      access_token: 'tok',
      refresh_token: 'r',
      expires_at: 9999,
      user: { id: 'uid', email: 'a@b.com' },
      profile: { username: 'johndoe', display_name: 'John Doe', avatar_url: null },
    })

    await screen.findByText('@otrousuario')
    expect(screen.queryByRole('button', { name: /editar perfil/i })).not.toBeInTheDocument()
  })

  it('muestra formulario de edición al pulsar Editar perfil', async () => {
    const user = userEvent.setup()
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: mockProfile, tweets: [] }),
    })

    renderWithRoute('johndoe', {
      access_token: 'tok',
      refresh_token: 'r',
      expires_at: 9999,
      user: { id: 'uid', email: 'a@b.com' },
      profile: { username: 'johndoe', display_name: 'John Doe', avatar_url: null },
    })

    await user.click(await screen.findByRole('button', { name: /editar perfil/i }))
    expect(screen.getByLabelText(/^nombre$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^biografía$/i)).toBeInTheDocument()
  })

  it('llama a PATCH /api/profiles/me al guardar cambios de nombre', async () => {
    const user = userEvent.setup()
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: mockProfile, tweets: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          profile: { ...mockProfile, display_name: 'John Editado' },
        }),
      })

    renderWithRoute('johndoe', {
      access_token: 'tok',
      refresh_token: 'r',
      expires_at: 9999,
      user: { id: 'uid', email: 'a@b.com' },
      profile: { username: 'johndoe', display_name: 'John Doe', avatar_url: null },
    })

    await user.click(await screen.findByRole('button', { name: /editar perfil/i }))
    const input = screen.getByLabelText(/^nombre$/i)
    await user.clear(input)
    await user.type(input, 'John Editado')
    await user.click(screen.getByRole('button', { name: /^guardar$/i }))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/profiles/me',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      })
    )
  })

  it('muestra 404 cuando el perfil no existe', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Perfil no encontrado' }),
    })

    renderWithRoute('noexiste')

    expect(await screen.findByText(/esta cuenta no existe/i)).toBeInTheDocument()
  })
})
