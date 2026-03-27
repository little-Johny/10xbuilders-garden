import request from 'supertest'
import { createApp } from './app.js'

describe('API HTTP', () => {
  const app = createApp()

  it('GET /health responde ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST /auth/login sin email devuelve 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('POST /auth/register con username inválido devuelve 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: 'a@b.com',
        password: 'secret123',
        username: 'AB',
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/usuario/i)
  })

  it('POST /tweets sin Authorization devuelve 401', async () => {
    const res = await request(app).post('/tweets').send({ content: 'hola' })
    expect(res.status).toBe(401)
  })

  it('POST /tweets con contenido vacío devuelve 400', async () => {
    const res = await request(app)
      .post('/tweets')
      .set('Authorization', 'Bearer fake-token')
      .send({ content: '   ' })
    expect(res.status).toBe(400)
  })

  it('POST /tweets con más de 280 caracteres devuelve 400', async () => {
    const res = await request(app)
      .post('/tweets')
      .set('Authorization', 'Bearer fake-token')
      .send({ content: 'x'.repeat(281) })
    expect(res.status).toBe(400)
  })

  it('GET /profiles/:username sin usuario devuelve 404', async () => {
    const res = await request(app).get('/profiles/')
    expect(res.status).toBe(404)
  })

  it('PATCH /profiles/me sin Authorization devuelve 401', async () => {
    const res = await request(app)
      .patch('/profiles/me')
      .send({ display_name: 'Nuevo' })
    expect(res.status).toBe(401)
  })

  it('PATCH /profiles/me sin campos devuelve 400', async () => {
    const res = await request(app)
      .patch('/profiles/me')
      .set('Authorization', 'Bearer fake-token')
      .send({})
    expect(res.status).toBe(400)
  })

  it('POST /profiles/me/avatar sin Authorization devuelve 401', async () => {
    const res = await request(app)
      .post('/profiles/me/avatar')
    expect(res.status).toBe(401)
  })

  it('POST /profiles/me/avatar sin archivo devuelve 400', async () => {
    const res = await request(app)
      .post('/profiles/me/avatar')
      .set('Authorization', 'Bearer fake-token')
    expect(res.status).toBe(400)
  })
})
