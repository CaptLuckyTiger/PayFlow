import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { getRequiredJwtSecret } from './jwt-secrets';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    const accessSecret = getRequiredJwtSecret(config, 'JWT_SECRET');
    const refreshSecret = getRequiredJwtSecret(config, 'JWT_REFRESH_SECRET');
    if (accessSecret === refreshSecret) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different.');
    }
  }

  async register(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string } }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('User already exists.');
    }

    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    const tokens = await this.issueTokens(user.id, user.email);

    return {
      ...tokens,
      user: { id: user.id, email: user.email },
    };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string } }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const tokens = await this.issueTokens(user.id, user.email);
    return {
      ...tokens,
      user: { id: user.id, email: user.email },
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let decoded: { sub: string; email: string; jti: string };
    try {
      decoded = this.jwtService.verify<{ sub: string; email: string; jti: string }>(refreshToken, {
        secret: getRequiredJwtSecret(this.config, 'JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      if (error instanceof Error && ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
        throw new UnauthorizedException('Refresh token is invalid or expired.');
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || user.email !== decoded.email || typeof decoded.jti !== 'string') {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const nextTokens = await this.createTokens(user.id, user.email);
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          jti: decoded.jti,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException('Refresh token is invalid, expired, or already used.');
      }

      await tx.refreshToken.create({
        data: {
          jti: nextTokens.jti,
          userId: user.id,
          expiresAt: nextTokens.expiresAt,
        },
      });
    });

    return { accessToken: nextTokens.accessToken, refreshToken: nextTokens.refreshToken };
  }

  async getProfile(userId: string): Promise<{ id: string; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }
    return { id: user.id, email: user.email };
  }

  private async issueTokens(userId: string, email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokens = await this.createTokens(userId, email);
    await this.prisma.refreshToken.create({
      data: {
        jti: tokens.jti,
        userId,
        expiresAt: tokens.expiresAt,
      },
    });

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  private async createTokens(userId: string, email: string) {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email },
      { secret: getRequiredJwtSecret(this.config, 'JWT_SECRET'), expiresIn: '15m' },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, email, jti },
      { secret: getRequiredJwtSecret(this.config, 'JWT_REFRESH_SECRET'), expiresIn: '7d' },
    );

    return { accessToken, refreshToken, jti, expiresAt };
  }
}
