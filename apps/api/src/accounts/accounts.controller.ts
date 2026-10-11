import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('accounts')
@Controller('v1/accounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a simulated account' })
  async create(@CurrentUser() user: { userId: string }, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(user.userId, dto.currency, dto.status);
  }

  @Get()
  @ApiOperation({ summary: 'List authenticated user accounts' })
  async list(@CurrentUser() user: { userId: string }) {
    return this.accountsService.list(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an account by id' })
  async find(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.accountsService.findById(user.userId, id);
  }

  @Get(':id/ledger')
  @ApiOperation({ summary: 'List ledger entries for an account' })
  async ledger(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.accountsService.ledger(user.userId, id);
  }
}
