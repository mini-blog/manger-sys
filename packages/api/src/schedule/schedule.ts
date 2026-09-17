import { PARTICIPANT_KINDS } from '@student/common';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuthGuard, AuthRequest } from '../auth/auth';
import { weekBounds } from './time';

class WeekQuery {
  @ApiProperty({
    example: '2026-09-14',
    description: 'Any date in the requested Melbourne week (YYYY-MM-DD).',
  })
  @IsDateString()
  week!: string;
}
export class LessonDto {
  @ApiProperty() id!: string;
  @ApiProperty() className!: string;
  @ApiProperty() classGroupId!: string;
  @ApiProperty() targetLevel!: string;
  @ApiProperty() courseName!: string;
  @ApiProperty() teacherName!: string;
  @ApiProperty() teacherId!: string;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty() capacity!: number;
  @ApiProperty() participantCount!: number;
  @ApiProperty() trialCount!: number;
  @ApiProperty() newCount!: number;
  @ApiProperty({ enum: ['SCHEDULED', 'CANCELLED'] }) status!: string;
}
class ParticipantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() yearLevel!: string;
  @ApiProperty({ enum: PARTICIPANT_KINDS }) kind!: string;
  @ApiProperty() isNewToClass!: boolean;
}
class RosterDto {
  @ApiProperty({ type: [ParticipantDto] }) participants!: ParticipantDto[];
}

@ApiTags('Timetable')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('sessions')
export class ScheduleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ type: [LessonDto] })
  async list(@Query() query: WeekQuery, @Req() req: AuthRequest): Promise<LessonDto[]> {
    let bounds: ReturnType<typeof weekBounds>;
    try {
      bounds = weekBounds(query.week);
    } catch {
      throw new BadRequestException('week must be a valid YYYY-MM-DD date.');
    }
    const lessons = await this.prisma.classSession.findMany({
      where: {
        startsAt: { gte: bounds.start, lt: bounds.end },
        ...(req.auth.user.role === 'TEACHER' ? { teacherId: req.auth.user.id } : {}),
      },
      include: {
        classGroup: true,
        course: true,
        teacher: { select: { id: true, name: true } },
        participants: { select: { kind: true, isNewToClass: true } },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return lessons.map((l) => ({
      id: l.id,
      className: l.classGroup.name,
      classGroupId: l.classGroupId,
      targetLevel: l.classGroup.targetLevel,
      courseName: l.course.name,
      teacherName: l.teacher.name,
      teacherId: l.teacherId,
      startsAt: l.startsAt.toISOString(),
      endsAt: l.endsAt.toISOString(),
      capacity: l.capacity,
      participantCount: l.participants.length,
      trialCount: l.participants.filter((p) => p.kind === 'TRIAL').length,
      newCount: l.participants.filter((p) => p.isNewToClass).length,
      status: l.status,
    }));
  }

  @Get(':id/participants')
  @ApiOkResponse({ type: RosterDto })
  async roster(@Param('id') id: string, @Req() req: AuthRequest): Promise<RosterDto> {
    const lesson = await this.prisma.classSession.findUnique({
      where: { id },
      select: { teacherId: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found.');
    if (req.auth.user.role === 'TEACHER' && lesson.teacherId !== req.auth.user.id)
      throw new ForbiddenException('You can only view your assigned lessons.');
    const people = await this.prisma.sessionParticipant.findMany({
      where: { sessionId: id },
      include: { student: { select: { id: true, name: true, yearLevel: true } } },
    });
    const rank = (p: (typeof people)[number]) => (p.kind === 'TRIAL' ? 0 : p.isNewToClass ? 1 : 2);
    people.sort((a, b) => rank(a) - rank(b) || a.student.name.localeCompare(b.student.name));
    return {
      participants: people.map((p) => ({
        id: p.student.id,
        name: p.student.name,
        yearLevel: p.student.yearLevel,
        kind: p.kind,
        isNewToClass: p.isNewToClass,
      })),
    };
  }
}
