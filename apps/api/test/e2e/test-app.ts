import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { WorkerModule } from '../../../worker/src/worker.module';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface RegisteredUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

export async function createTestWorkerApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export async function registerUser(app: INestApplication): Promise<RegisteredUser> {
  const user = {
    email: `payflow-${randomUUID()}@example.test`,
    password: 'Valid-password-123',
  };
  const response = await request(app.getHttpServer()).post('/v1/auth/register').send(user).expect(201);
  return {
    ...user,
    id: response.body.user.id as string,
    accessToken: response.body.accessToken as string,
    refreshToken: response.body.refreshToken as string,
  };
}

export async function cleanupUser(app: INestApplication, email: string): Promise<void> {
  await app.get(PrismaService).user.deleteMany({ where: { email } });
}
