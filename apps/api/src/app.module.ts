import { Controller, Get, Module } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { AuthController, AuthGuard } from './auth/auth';
import { ScheduleController } from './schedule/schedule';

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
    return { status: 'ok', timezone: 'Australia/Melbourne', database: 'connected' };
  }
}

@Module({
  controllers: [HealthController, AuthController, ScheduleController],
  providers: [PrismaService, AuthGuard],
})
export class AppModule {}
