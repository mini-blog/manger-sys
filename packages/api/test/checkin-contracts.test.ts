import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FOLLOWUP_OUTCOMES, MANUAL_FOLLOWUP_OUTCOMES, FOLLOWUP_REASON_TAGS } from '@student/common';
import { CommunicationDto } from '../src/workflow/dto';

const base = {
  guardianNameSnapshot: 'Parent',
  channel: 'PHONE',
  content: 'Parent asked about lesson times.',
  occurredAt: '2026-09-17T00:00:00Z',
};
const errors = (extra: Record<string, unknown>) =>
  validateSync(plainToInstance(CommunicationDto, { ...base, ...extra }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

test('manual follow-up outcomes cannot claim a recorded purchase', () => {
  assert.ok(FOLLOWUP_OUTCOMES.includes('PURCHASE_RECORDED'));
  assert.ok(!MANUAL_FOLLOWUP_OUTCOMES.some((v: string) => v === 'PURCHASE_RECORDED'));
  assert.deepEqual(MANUAL_FOLLOWUP_OUTCOMES, [
    'INTERESTED',
    'CONSIDERING',
    'NOT_INTERESTED',
    'UNREACHABLE',
  ]);
});

test('communication concerns and reason tags have bounded, non-duplicated values', () => {
  assert.deepEqual(errors({}), []);
  assert.deepEqual(errors({ concerns: ' '.repeat(3), coreQuestion: '', reasonTags: [] }), []);
  assert.deepEqual(
    errors({
      concerns: 'Price and time',
      coreQuestion: 'Can we attend Sunday?',
      reasonTags: [...FOLLOWUP_REASON_TAGS],
    }),
    [],
  );
  for (const invalid of [
    { concerns: 'x'.repeat(2001) },
    { coreQuestion: 'x'.repeat(1001) },
    { concerns: 2 },
    { reasonTags: ['PRICE', 'PRICE'] },
    { reasonTags: ['MADE_UP'] },
    { reasonTags: ['PRICE', null] },
    { reasonTags: [...FOLLOWUP_REASON_TAGS, 'PRICE'] },
    { reasonTags: 'PRICE' },
    { followupOutcome: 'PURCHASE_RECORDED' },
  ])
    assert.ok(errors(invalid).length > 0, JSON.stringify(invalid));
});
