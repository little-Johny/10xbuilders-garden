import { render, screen } from '@testing-library/react'
import App from '../src/components/App'

describe('App', () => {
  it('renderiza el título de la aplicación', () => {
    render(<App />)
    expect(screen.getByText('Twitter Clon')).toBeInTheDocument()
  })
})
