import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { cleanupUser, createTestApp, registerUser, RegisteredUser } from './test-app';

describe('Authentication API', () => {
  let app: INestApplication;
  let user: RegisteredUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    user = await registerUser(app);
  });

  afterEach(async () => {
    await cleanupUser(app, user.email);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, protects the profile, logs in, and reads the persisted identity', async () => {
    await request(app.getHttpServer()).get('/v1/auth/me').expect(401);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(201);

    const profile = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(profile.body.email).toBe(user.email);
    expect(profile.body.id).toBeTruthy();
  });

  it('rejects invalid credentials and malformed registration input', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'incorrect-password' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });
});
