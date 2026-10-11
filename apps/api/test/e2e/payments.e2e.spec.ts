import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { cleanupUser, createTestApp, createTestWorkerApp, registerUser, RegisteredUser } from './test-app';

describe('Payments API', () => {
  let app: INestApplication;
  let workerApp: INestApplication;
  let user: RegisteredUser;

  beforeAll(async () => {
    app = await createTestApp();
    workerApp = await createTestWorkerApp();
  });

  beforeEach(async () => {
    user = await registerUser(app);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupUser(app, user.email);
  });

  afterAll(async () => {
    await workerApp.close();
    await app.close();
  });

  it('creates an idempotent payment and reads its persisted state', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
    } as Response);
    const auth = { Authorization: `Bearer ${user.accessToken}` };
    await request(app.getHttpServer()).get('/v1/payments').expect(401);

    const account = await request(app.getHttpServer())
      .post('/v1/accounts')
      .set(auth)
      .send({ currency: 'USD' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/v1/webhooks/endpoints')
      .set(auth)
      .send({ url: 'http://127.0.0.1/hook', secret: 'test-webhook-secret' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/v1/webhooks/endpoints')
      .set(auth)
      .send({ url: 'https://hooks.example.test/payflow', secret: 'test-webhook-secret' })
      .expect(201);

    const paymentRequest = {
      accountId: account.body.id,
      amountMinor: 2400,
      currency: 'USD',
      description: 'integration invoice',
      idempotencyKey: randomUUID(),
    };
    const created = await request(app.getHttpServer()).post('/v1/payments').set(auth).send(paymentRequest).expect(201);
    const replay = await request(app.getHttpServer()).post('/v1/payments').set(auth).send(paymentRequest).expect(201);

    expect(replay.body.id).toBe(created.body.id);
    expect(created.body.amountMinor).toBe(2400);

    await request(app.getHttpServer())
      .post('/v1/payments')
      .set(auth)
      .send({ ...paymentRequest, amountMinor: 2401 })
      .expect(409);

    const fetched = await request(app.getHttpServer()).get(`/v1/payments/${created.body.id}`).set(auth).expect(200);
    expect(fetched.body.id).toBe(created.body.id);

    let processed = fetched;
    for (let attempt = 0; attempt < 30 && ['PENDING', 'PROCESSING'].includes(processed.body.status); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      processed = await request(app.getHttpServer()).get(`/v1/payments/${created.body.id}`).set(auth).expect(200);
    }
    expect(processed.body.status).toBe('APPROVED');

    const listed = await request(app.getHttpServer()).get('/v1/payments').set(auth).expect(200);
    expect(listed.body.map((payment: { id: string }) => payment.id)).toContain(created.body.id);

    const ledger = await request(app.getHttpServer())
      .get(`/v1/accounts/${account.body.id}/ledger`)
      .set(auth)
      .expect(200);
    expect(ledger.body).toHaveLength(1);
    expect(ledger.body[0].amountMinor).toBe(2400);

    let deliveries = await request(app.getHttpServer()).get('/v1/webhooks/deliveries').set(auth).expect(200);
    for (let attempt = 0; attempt < 30 && deliveries.body[0]?.status !== 'SENT'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      deliveries = await request(app.getHttpServer()).get('/v1/webhooks/deliveries').set(auth).expect(200);
    }
    expect(deliveries.body[0]?.status).toBe('SENT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.test/payflow');
    expect(options?.headers).toMatchObject({
      'X-PayFlow-Signature': expect.stringMatching(/^sha256=/),
    });
    const body = String(options?.body);
    const expectedSignature = createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');
    expect(options?.headers).toMatchObject({
      'X-PayFlow-Signature': `sha256=${expectedSignature}`,
    });
    expect(JSON.parse(body).payload.payment.status).toBe('APPROVED');
  });
});
