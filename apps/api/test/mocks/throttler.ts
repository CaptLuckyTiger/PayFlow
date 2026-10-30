import type { DynamicModule } from '@nestjs/common';

export class ThrottlerModule {
  static forRoot(): DynamicModule {
    return { module: ThrottlerModule };
  }
}

export class ThrottlerGuard {
  canActivate(): boolean {
    return true;
  }
}

export function Throttle(...args: unknown[]): MethodDecorator {
  void args;
  return () => undefined;
}
