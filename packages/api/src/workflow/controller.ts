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
import { ReadService } from './read.service';
import { StudentsService } from './students.service';
import { TeachingService } from './teaching.service';
import { TasksService } from './tasks.service';
import { AiService } from './ai.service';
import * as D from './dto';
const write = () =>
  ApiHeader({
    name: 'idempotency-key',
    required: true,
    description: 'UUID retained when retrying identical input.',
  });
@ApiTags('Workflow')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller()
export class WorkflowController {
  constructor(
    readonly read: ReadService,
    readonly students: StudentsService,
    readonly teaching: TeachingService,
    readonly tasks: TasksService,
    readonly ai: AiService,
  ) {}
  @Get('students') @ApiOkResponse({ type: D.StudentPageDto }) listStudents(
    @Req() r: AuthRequest,
    @Query() q: D.StudentQuery,
  ) {
    return this.read.students(r.auth.user, q);
  }
  @Post('students') @write() @ApiCreatedResponse({ type: D.StudentDto }) createStudent(
    @Req() r: AuthRequest,
    @Body() b: D.CreateStudentDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.students.create(r.auth.user, b, k);
  }
  @Get('students/:id') @ApiOkResponse({ type: D.StudentDetailDto }) student(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.read.student(r.auth.user, id);
  }
  @Patch('students/:id') @write() @ApiOkResponse({ type: D.ActionDto }) updateStudent(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.UpdateStudentDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.students.update(r.auth.user, id, b, k);
  }
  @Get('students/:id/communications')
  @ApiOkResponse({ type: D.CommunicationPageDto })
  communications(@Req() r: AuthRequest, @Param('id') id: string, @Query() q: D.PageQuery) {
    return this.read.communications(r.auth.user, id, q);
  }
  @Post('students/:id/communications')
  @write()
  @ApiCreatedResponse({ type: D.ActionDto })
  communicate(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.CommunicationDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.students.communicate(r.auth.user, id, b, k);
  }
  @Get('sessions') @ApiOkResponse({ type: [D.LessonDto] }) sessions(
    @Req() r: AuthRequest,
    @Query() q: D.WeekQuery,
  ) {
    return this.read.lessons(r.auth.user, q);
  }
  @Get('sessions/options') @ApiOkResponse({ type: D.SessionOptionsDto }) options(
    @Req() r: AuthRequest,
  ) {
    return this.read.options(r.auth.user);
  }
  @Post('sessions') @write() @ApiCreatedResponse({ type: D.ActionDto }) createSession(
    @Req() r: AuthRequest,
    @Body() b: D.CreateSessionDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.teaching.create(r.auth.user, b, k);
  }
  @Patch('sessions/:id') @write() @ApiOkResponse({ type: D.ActionDto }) updateSession(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.UpdateSessionDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.teaching.update(r.auth.user, id, b, k);
  }
  @Post('sessions/:id/cancel') @write() @ApiCreatedResponse({ type: D.ActionDto }) cancelSession(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.CancelSessionDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.teaching.cancelSession(r.auth.user, id, b, k);
  }
  @Get('sessions/:id/participants') @ApiOkResponse({ type: D.RosterDto }) roster(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.read.roster(r.auth.user, id);
  }
  @Post('sessions/:id/participants') @write() @ApiCreatedResponse({ type: D.ActionDto }) add(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.AddParticipantDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.teaching.add(r.auth.user, id, b, k);
  }
  @Post('participants/:id/feedback')
  @write()
  @ApiCreatedResponse({ type: D.ActionDto })
  participantFeedback(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.ParticipantFeedbackDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.teaching.participantFeedback(r.auth.user, id, b, k);
  }
  @Post('participants/:id/check-in')
  @write()
  @ApiCreatedResponse({ type: D.CheckInResultDto })
  checkIn(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.CheckInDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.teaching.checkIn(r.auth.user, id, b, k);
  }
  @Post('participants/:id/cancel') @write() @ApiCreatedResponse({ type: D.ActionDto }) cancel(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.VersionDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.teaching.cancelParticipant(r.auth.user, id, b, k);
  }
  @Get('sessions/:id/changes') @ApiOkResponse({ type: D.ChangePageDto }) changes(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query() q: D.PageQuery,
  ) {
    return this.read.changes(r.auth.user, id, q);
  }
  @Get('tasks') @ApiOkResponse({ type: D.TaskPageDto }) listTasks(
    @Req() r: AuthRequest,
    @Query() q: D.TaskQuery,
  ) {
    return this.read.tasks(r.auth.user, q);
  }
  @Get('tasks/:id') @ApiOkResponse({ type: D.TaskDetailDto }) task(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.read.task(r.auth.user, id);
  }
  @Post('tasks/:id/follow-up') @write() @ApiCreatedResponse({ type: D.ActionDto }) followUp(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.FollowUpDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.tasks.followUp(r.auth.user, id, b, k);
  }
  @Get('tasks/:id/report')
  @ApiOkResponse({ type: D.ReportDto })
  report(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.ai.view(r.auth.user, id);
  }
  @Post('tasks/:id/report/generate')
  @ApiCreatedResponse({ type: D.ReportDto })
  generateReport(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: D.ReportVersionDto) {
    return this.ai.generate(r.auth.user, id, b);
  }
  @Post('tasks/:id/report/complete')
  @write()
  @ApiCreatedResponse({ type: D.ActionDto })
  completeReport(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: D.ReportVersionDto,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.ai.complete(r.auth.user, id, b, k);
  }
}
