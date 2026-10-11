import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('v1/webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('endpoints')
  @ApiOperation({ summary: 'Create a webhook endpoint' })
  async create(@CurrentUser() user: { userId: string }, @Body() dto: CreateWebhookEndpointDto) {
    return this.webhooksService.createEndpoint(user.userId, dto.url, dto.secret, dto.active ?? true);
  }

  @Get('endpoints')
  @ApiOperation({ summary: 'List registered webhook endpoints' })
  async listEndpoints(@CurrentUser() user: { userId: string }) {
    return this.webhooksService.listEndpoints(user.userId);
  }

  @Delete('endpoints/:id')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  async delete(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.webhooksService.deleteEndpoint(user.userId, id);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'List webhook delivery attempts' })
  async listDeliveries(@CurrentUser() user: { userId: string }) {
    return this.webhooksService.listDeliveries(user.userId);
  }
}
