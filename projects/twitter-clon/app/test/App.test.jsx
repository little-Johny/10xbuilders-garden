import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/components/App'

describe('App', () => {
  it('muestra la pantalla de login en /login', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    )
    expect(
      screen.getByRole('heading', { name: /entra en x/i })
    ).toBeInTheDocument()
  })
})
