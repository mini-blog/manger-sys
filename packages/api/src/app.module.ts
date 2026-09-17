import { AccountsController } from './accounts/controller';
import { AccountsService } from './accounts/service';
import { BUSINESS_TIMEZONE } from '@student/common';
import { Controller, Get, Module } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { AuthController, AuthGuard } from './auth/auth';
import { WorkflowController } from './workflow/controller';
import { Clock, Commands } from './common/domain';
import { ReadService } from './workflow/read.service';
import { StudentsService } from './workflow/students.service';
import { TeachingService } from './workflow/teaching.service';
import { TasksService } from './workflow/tasks.service';
import { AiService, QwenProvider } from './workflow/ai.service';

import { EntitlementsService } from './workflow/entitlements.service';
import { EntitlementsController } from './workflow/entitlements.controller';

class HealthDto {
  @ApiProperty() status!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() database!: string;
}
@ApiTags('Health')
@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  @ApiOkResponse({ type: HealthDto })
  async health(): Promise<HealthDto> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', timezone: BUSINESS_TIMEZONE, database: 'connected' };
  }
}

@Module({
  controllers: [
    AccountsController,
    HealthController,
    AuthController,
    WorkflowController,
    EntitlementsController,
  ],
  providers: [
    AccountsService,
    PrismaService,
    AuthGuard,
    Clock,
    Commands,
    ReadService,
    StudentsService,
    EntitlementsService,
    TeachingService,
    TasksService,
    AiService,
    QwenProvider,
  ],
})
export class AppModule {}
