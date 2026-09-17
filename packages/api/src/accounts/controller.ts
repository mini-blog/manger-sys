import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth';
import { AccountsService } from './service';
import * as D from './dto';
const write = () =>
  ApiHeader({
    name: 'idempotency-key',
    required: true,
    description: 'UUID retained when retrying identical input.',
  });
@ApiTags('Accounts')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(readonly accounts: AccountsService) {}
  @Get() @ApiOkResponse({ type: D.AccountPageDto }) list(
    @Req() r: AuthRequest,
    @Query() q: D.AccountQuery,
  ) {
    return this.accounts.list(r.auth.user, q);
  }
  @Get(':id') @ApiOkResponse({ type: D.AccountDto }) detail(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.accounts.detail(r.auth.user, id);
  }
  @Get(':id/deactivation-impact') @ApiOkResponse({ type: D.DeactivationImpactDto }) impact(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.accounts.impact(r.auth.user, id);
  }
  @Post() @write() @ApiCreatedResponse({ type: D.AccountActionDto }) create(
    @Req() r: AuthRequest,
    @Body() b: D.CreateAccountDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.accounts.create(r.auth.user, b, k);
  }
  @Patch(':id') @write() @ApiOkResponse({ type: D.AccountActionDto }) update(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.UpdateAccountDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.accounts.update(r.auth.user, id, b, k);
  }
  @Post(':id/reset-password') @write() @ApiCreatedResponse({ type: D.AccountActionDto }) reset(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.ResetPasswordDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.accounts.reset(r.auth.user, id, b, k);
  }
  @Post(':id/deactivate')
  @write()
  @ApiCreatedResponse({ type: D.DeactivationResultDto })
  deactivate(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.DeactivateAccountDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.accounts.deactivate(r.auth.user, id, b, k);
  }
}
