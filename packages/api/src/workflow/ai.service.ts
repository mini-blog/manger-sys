import { HttpException, Injectable } from '@nestjs/common';
import { reportJsonSchema, reportSchema, validateReport, Facts } from './report-schema';
import { reportMessages, REPORT_PROMPT_VERSION } from './report-prompt';
export { reportSchema, validateReport } from './report-schema';
import {
  Actor,
  admin,
  Clock,
  Commands,
  digest,
  fail,
  json,
  required,
  Tx,
  version,
} from '../common/domain';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/prisma/client';
import { assignedTask } from './read.service';
import { ReportDto, ReportVersionDto } from './dto';
@Injectable()
export class QwenProvider {
  async generate(input: unknown) {
    const key = process.env.QIWEN_API_KEY,
      base = process.env.QWEN_BASE_URL,
      model = process.env.QWEN_MODEL;
    if (!key || !base || !model) throw new Error('AI_NOT_CONFIGURED');
    const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        enable_thinking: false,
        max_tokens: 4096,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'student_report_v1', strict: true, schema: reportJsonSchema },
        },
        messages: reportMessages(input),
      }),
    });
    if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
    const body = await response.text();
    if (body.length > 100000) throw new Error('AI_INVALID_OUTPUT');
    const envelope = JSON.parse(body);
    const choice = envelope.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== 'stop')
      throw new Error('AI_INCOMPLETE_OUTPUT');
    if (choice?.message?.refusal) throw new Error('AI_REFUSED');
    return JSON.parse(choice?.message?.content ?? '');
  }
}
@Injectable()
export class AiService {
  private readonly limits = new Map<string, { until: number; count: number }>();
  constructor(
    readonly db: PrismaService,
    readonly clock: Clock,
    readonly provider: QwenProvider,
    readonly commands: Commands,
  ) {}
  async context(tx: Tx, user: Actor, id: string) {
    admin(user);
    const task = await assignedTask(tx, user, id);
    if (task.type !== 'STUDENT_AI_REPORT') fail('TASK_TYPE_INVALID', 'This is not a report task.');
    const report = required(await tx.studentAiReport.findUnique({ where: { taskId: id } }));
    const p = required(task.participant),
      s = p.student;
    const comm = required(
      await tx.communicationLog.findUnique({ where: { taskId: report.sourceFollowupTaskId } }),
    );
    const redact = (input: string | null) => {
      let text = input ?? '';
      for (const token of [
        s.name,
        s.guardianName,
        s.guardianPhone,
        s.guardianEmail,
        s.guardianWechat,
        comm.guardianNameSnapshot,
      ].filter((v): v is string => !!v))
        text = text.split(token).join('[redacted]');
      return text
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/\+?\d[\d ()-]{7,}\d/g, '[phone]')
        .replace(/(?:AUD|\$)\s*\d[\d,.]*/gi, '[amount]');
    };
    const facts: Facts = {
      classroomPerformanceRating: Number(p.classroomPerformanceRating),
      overallAbilityRating: Number(p.overallAbilityRating),
      purchaseIntentRating:
        comm.purchaseIntentRating == null ? null : Number(comm.purchaseIntentRating),
      reasons: comm.notPurchasedReasons,
    };
    const evidence = [
      { id: `background:${s.id}`, text: redact(s.backgroundText) },
      {
        id: `internal:${s.id}`,
        text: 'Unverified internal admin observation: ' + redact(s.adminNotesText),
      },
      {
        id: `evaluation:${p.id}`,
        text: `Classroom performance: ${facts.classroomPerformanceRating}; overall ability: ${facts.overallAbilityRating}. ${redact(p.teacherNoteText)}`,
      },
      {
        id: comm.id,
        text: `Purchase intent: ${facts.purchaseIntentRating ?? 'unknown'}; reasons: ${facts.reasons.join(', ')}. ${redact(comm.noteText)}`,
      },
    ];
    const input = {
      facts,
      evidence,
      yearLevel: s.yearLevel,
      language: s.preferredLanguage ?? 'en-AU',
    };
    const fingerprint = digest({
      input,
      promptVersion: REPORT_PROMPT_VERSION,
      studentVersion: s.version,
      participantVersion: p.version,
      owner: s.ownerAdminId,
    });
    return { task, report, input, fingerprint };
  }
  async view(user: Actor, id: string): Promise<ReportDto> {
    return this.db.$transaction(
      async (tx) => {
        const c = await this.context(tx, user, id),
          r = c.report;
        return {
          id: r.id,
          taskId: id,
          sourceFollowupTaskId: r.sourceFollowupTaskId,
          version: r.version,
          generationStatus: r.generationStatus,
          source: r.source,
          model: r.model,
          generatedAt: r.generatedAt?.toISOString() ?? null,
          lastErrorCode: r.lastErrorCode,
          stale:
            c.task.status === 'OPEN' &&
            r.generationStatus === 'READY' &&
            r.inputFingerprint !== c.fingerprint,
          content: r.content as Record<string, unknown> | null,
          evidenceSnapshot: r.evidenceSnapshot as { id: string; text: string }[] | null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async generate(user: Actor, id: string, body: ReportVersionDto) {
    const initial = await this.db.$transaction((tx) => this.context(tx, user, id), {
      isolationLevel: 'RepeatableRead',
    });
    if (initial.task.status !== 'OPEN') fail('TASK_CLOSED', 'Completed reports are read-only.');
    version(initial.report.version, body.expectedVersion);
    const now = this.clock.now().getTime();
    for (const [k, v] of this.limits) if (v.until <= now) this.limits.delete(k);
    const limit = this.limits.get(user.id) ?? { count: 0, until: now + 60000 };
    if (limit.count >= 5)
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Wait a minute before generating another report.' },
        429,
      );
    limit.count++;
    this.limits.set(user.id, limit);
    let content: ReturnType<typeof validateReport> | undefined, error: string | undefined;
    try {
      content = validateReport(
        await this.provider.generate({
          ...initial.input,
          outputSchema: reportJsonSchema,
        }),
        initial.input.facts,
        initial.input.evidence.map((e) => e.id),
      );
    } catch (e) {
      error =
        e instanceof Error && e.message === 'AI_NOT_CONFIGURED'
          ? 'AI_NOT_CONFIGURED'
          : 'AI_GENERATION_FAILED';
    }
    await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73192461)`;
        const actor = await tx.user.findUnique({ where: { id: user.id } });
        if (actor?.status !== 'ACTIVE') fail('ACCOUNT_DISABLED', 'Account is no longer active.');
        const current = await this.context(tx, user, id);
        if (current.task.status !== 'OPEN') fail('TASK_CLOSED', 'Completed reports are read-only.');
        version(current.report.version, body.expectedVersion);
        if (current.fingerprint !== initial.fingerprint)
          fail('REPORT_INPUT_CHANGED', 'Source records changed. Generate again.');
        await tx.studentAiReport.update({
          where: { taskId: id },
          data: content
            ? {
                generationStatus: 'READY',
                schemaVersion: 1,
                content: json(content),
                evidenceSnapshot: json(initial.input.evidence),
                inputFingerprint: initial.fingerprint,
                source: 'llm',
                provider: 'qwen',
                model: process.env.QWEN_MODEL,
                generatedAt: this.clock.now(),
                lastErrorCode: null,
                version: { increment: 1 },
              }
            : {
                generationStatus: 'FAILED',
                content: Prisma.DbNull,
                evidenceSnapshot: Prisma.DbNull,
                inputFingerprint: null,
                source: null,
                provider: null,
                model: null,
                generatedAt: null,
                lastErrorCode: error,
                version: { increment: 1 },
              },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return this.view(user, id);
  }
  complete(user: Actor, id: string, body: ReportVersionDto, key?: string) {
    return this.commands.run(
      user,
      `report:${id}:read`,
      key,
      body,
      async (tx) => {
        await this.context(tx, user, id);
      },
      async (tx) => {
        const c = await this.context(tx, user, id);
        version(c.report.version, body.expectedVersion);
        if (c.task.status !== 'OPEN') fail('TASK_CLOSED', 'This report is already closed.');
        if (c.report.generationStatus !== 'READY' || c.report.inputFingerprint !== c.fingerprint)
          fail('REPORT_NOT_READY', 'Generate a current report before marking it read.');
        await tx.task.update({
          where: { id },
          data: { status: 'DONE', completedAt: this.clock.now(), version: { increment: 1 } },
        });
        return { id };
      },
    );
  }
}
