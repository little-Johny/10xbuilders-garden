import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/contexts/AuthContext'
import FeedPage from '../src/pages/FeedPage'

const SESSION = {
  access_token: 'test-token',
  refresh_token: 'r',
  expires_at: 999,
  user: { id: 'uid', email: 'a@b.com' },
  profile: { username: 'testuser', display_name: 'Test User', avatar_url: null },
}

describe('FeedPage', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch = jest.fn()
  })

  it('publica un tweet con Authorization Bearer', async () => {
    const user = userEvent.setup()
    localStorage.setItem('tc_session', JSON.stringify(SESSION))

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tweets: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tweet: {
            id: 't1',
            content: 'Hola mundo',
            created_at: '2020-01-01T00:00:00.000Z',
            author_id: 'uid',
            profiles: { username: 'u', display_name: 'User' },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tweets: [
            {
              id: 't1',
              content: 'Hola mundo',
              created_at: '2020-01-01T00:00:00.000Z',
              author_id: 'uid',
              profiles: { username: 'u', display_name: 'User' },
            },
          ],
        }),
      })

    render(
      <MemoryRouter>
        <AuthProvider>
          <FeedPage />
        </AuthProvider>
      </MemoryRouter>
    )

    const textarea = await screen.findByPlaceholderText(/qué está pasando/i)
    await user.type(textarea, 'Hola mundo')
    await user.click(screen.getByRole('button', { name: /publicar/i }))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/tweets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ content: 'Hola mundo' }),
      })
    )
  })

  it('los tweets muestran link al perfil del autor', async () => {
    localStorage.setItem('tc_session', JSON.stringify(SESSION))

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweets: [
          {
            id: 't1',
            content: 'Tweet de prueba',
            created_at: '2024-01-01T00:00:00.000Z',
            author_id: 'uid2',
            profiles: { username: 'author', display_name: 'Author Name', avatar_url: null },
          },
        ],
      }),
    })

    render(
      <MemoryRouter>
        <AuthProvider>
          <FeedPage />
        </AuthProvider>
      </MemoryRouter>
    )

    // Hay dos links por autor: avatar (aria-label) y nombre (texto)
    const links = await screen.findAllByRole('link', { name: /author name/i })
    expect(links.every((l) => l.getAttribute('href') === '/profile/author')).toBe(true)
  })
})
