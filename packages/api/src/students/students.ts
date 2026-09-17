import { YEAR_LEVELS } from '@student/common';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { AuthGuard, AuthRequest } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import type { Prisma } from '../generated/prisma/client';

const yearLevels = YEAR_LEVELS;
class StudentQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @Length(0, 80) q?: string;
}
class CreateStudentDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ enum: yearLevels }) @IsIn(yearLevels) yearLevel!: string;
}
class StudentDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() yearLevel!: string;
}
class StudentPageDto {
  @ApiProperty({ type: [StudentDto] }) items!: StudentDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

@ApiTags('Students')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ type: StudentPageDto })
  async list(@Query() query: StudentQuery, @Req() req: AuthRequest): Promise<StudentPageDto> {
    const where: Prisma.StudentWhereInput = {
      ...(query.q?.trim() ? { name: { contains: query.q.trim(), mode: 'insensitive' } } : {}),
      ...(req.auth.user.role === 'TEACHER'
        ? {
            participants: {
              some: { session: { teacherId: req.auth.user.id, status: 'SCHEDULED' } },
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.student.findMany({
          where,
          select: { id: true, name: true, yearLevel: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.student.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Post()
  @ApiCreatedResponse({ type: StudentDto })
  async create(@Body() body: CreateStudentDto, @Req() req: AuthRequest): Promise<StudentDto> {
    if (req.auth.user.role !== 'ADMIN')
      throw new ForbiddenException('Only admins can create students.');
    return this.prisma.student.create({
      data: { name: body.name, yearLevel: body.yearLevel, ownerAdminId: req.auth.user.id },
      select: { id: true, name: true, yearLevel: true },
    });
  }
}
