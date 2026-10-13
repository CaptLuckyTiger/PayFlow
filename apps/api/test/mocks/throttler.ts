import type { DynamicModule } from '@nestjs/common';

export class ThrottlerModule {
  static forRoot(): DynamicModule {
    return { module: ThrottlerModule };
  }
}
