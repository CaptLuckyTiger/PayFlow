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

  it('rotates refresh tokens and rejects reuse, including concurrent reuse', async () => {
    const staleToken = user.refreshToken;
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: staleToken }),
      request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: staleToken }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 401]);
    const rotatedToken = responses.find((response) => response.status === 201)?.body.refreshToken as string;
    expect(rotatedToken).toBeTruthy();

    await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: staleToken }).expect(401);

    const nextRotation = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: rotatedToken })
      .expect(201);
    expect(nextRotation.body.refreshToken).not.toBe(rotatedToken);
  });
});
