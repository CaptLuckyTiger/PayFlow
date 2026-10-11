import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('v1/payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a payment request with idempotency key' })
  async create(@CurrentUser() user: { userId: string }, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List payments for the current user' })
  async list(@CurrentUser() user: { userId: string }) {
    return this.paymentsService.list(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment details' })
  async find(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.paymentsService.findById(user.userId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending or processing payment' })
  async cancel(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.paymentsService.cancel(user.userId, id);
  }
}
