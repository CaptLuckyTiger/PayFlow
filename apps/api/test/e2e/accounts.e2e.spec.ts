import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { cleanupUser, createTestApp, registerUser, RegisteredUser } from './test-app';

describe('Accounts API', () => {
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

  it('creates an account and reads the same account and its ledger', async () => {
    await request(app.getHttpServer()).get('/v1/accounts').expect(401);

    const auth = { Authorization: `Bearer ${user.accessToken}` };
    const created = await request(app.getHttpServer())
      .post('/v1/accounts')
      .set(auth)
      .send({ currency: 'USD', status: 'ACTIVE' })
      .expect(201);

    const listed = await request(app.getHttpServer()).get('/v1/accounts').set(auth).expect(200);
    expect(listed.body.map((account: { id: string }) => account.id)).toContain(created.body.id);

    const fetched = await request(app.getHttpServer()).get(`/v1/accounts/${created.body.id}`).set(auth).expect(200);
    expect(fetched.body.currency).toBe('USD');

    const ledger = await request(app.getHttpServer())
      .get(`/v1/accounts/${created.body.id}/ledger`)
      .set(auth)
      .expect(200);
    expect(ledger.body).toEqual([]);
  });
});
