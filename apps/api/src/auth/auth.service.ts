import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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

    const tokens = this.issueTokens(user.id, user.email);

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

    const tokens = this.issueTokens(user.id, user.email);
    return {
      ...tokens,
      user: { id: user.id, email: user.email },
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let decoded: { sub: string; email: string };
    try {
      decoded = this.jwtService.verify<{ sub: string; email: string }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      });
    } catch (error) {
      if (error instanceof Error && ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
        throw new UnauthorizedException('Refresh token is invalid or expired.');
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || user.email !== decoded.email) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    return this.issueTokens(user.id, user.email);
  }

  async getProfile(userId: string): Promise<{ id: string; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }
    return { id: user.id, email: user.email };
  }

  private issueTokens(userId: string, email: string): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      { secret: process.env.JWT_SECRET ?? 'dev-secret', expiresIn: '15m' },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, email, jti: randomUUID() },
      { secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret', expiresIn: '7d' },
    );

    return { accessToken, refreshToken };
  }
}
