import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/contexts/AuthContext'
import FeedPage from '../src/pages/FeedPage'

describe('FeedPage', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch = jest.fn()
  })

  it('publica un tweet con Authorization Bearer', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'tc_session',
      JSON.stringify({
        access_token: 'test-token',
        refresh_token: 'r',
        expires_at: 999,
        user: { id: 'uid', email: 'a@b.com' },
      })
    )

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
})
