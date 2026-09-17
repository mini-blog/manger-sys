import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth';
import { PageQuery } from './dto';
import * as D from './entitlements.dto';
import { EntitlementsService } from './entitlements.service';

@ApiTags('Entitlements')
@ApiCookieAuth()
@ApiExtraModels(D.TrialGrantDto, D.CustomPurchaseDto, D.PackagePurchaseDto)
@UseGuards(AuthGuard)
@Controller()
export class EntitlementsController {
  constructor(readonly entitlements: EntitlementsService) {}
  @Get('lesson-packages')
  @ApiOkResponse({ type: D.LessonPackagePageDto })
  packages(@Req() r: AuthRequest, @Query() q: PageQuery) {
    return this.entitlements.packages(r.auth.user, q);
  }
  @Post('entitlements/grants')
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    description: 'UUID retained for retries of identical input.',
  })
  @ApiBody({
    schema: {
      oneOf: [D.TrialGrantDto, D.CustomPurchaseDto, D.PackagePurchaseDto].map((t) => ({
        $ref: getSchemaPath(t),
      })),
    },
  })
  @ApiCreatedResponse({ type: D.GrantResultDto })
  grant(
    @Req() r: AuthRequest,
    @Body(new D.GrantBodyPipe()) b: D.GrantBody,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.entitlements.grant(r.auth.user, b, key);
  }
  @Get('entitlements')
  @ApiOkResponse({ type: D.EntitlementPageDto })
  list(@Req() r: AuthRequest, @Query() q: D.EntitlementQuery) {
    return this.entitlements.list(r.auth.user, q);
  }
  @Get('students/:id/entitlements')
  @ApiOkResponse({ type: D.EntitlementSummaryDto })
  summary(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.entitlements.studentSummary(r.auth.user, id);
  }
  @Get('students/:id/entitlement-entries')
  @ApiOkResponse({ type: D.LedgerPageDto })
  ledger(@Req() r: AuthRequest, @Param('id') id: string, @Query() q: D.LedgerQuery) {
    return this.entitlements.ledger(r.auth.user, id, q);
  }
}
