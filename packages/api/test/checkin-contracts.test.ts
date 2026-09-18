import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CommunicationDto, ParticipantFeedbackDto } from '../src/workflow/dto';
test('new evaluation requires two half-star ratings and rejects old fields', () => {
  const errors = (body: object) =>
    validateSync(plainToInstance(ParticipantFeedbackDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  assert.deepEqual(
    errors({ expectedVersion: 1, classroomPerformanceRating: 4.5, overallAbilityRating: 1 }),
    [],
  );
  for (const n of [0, 0.5, 3.49, 5.5, '4'])
    assert.ok(
      errors({ expectedVersion: 1, classroomPerformanceRating: n, overallAbilityRating: 4 }).length,
    );
  assert.ok(errors({ expectedVersion: 1, feedback: 'old' }).length);
});
test('communication rejects duplicate reasons, unknown tags and invalid intent precision', () => {
  const base = {
    guardianNameSnapshot: 'Parent',
    channel: 'EMAIL',
    occurredAt: '2026-09-17T00:00:00Z',
    noteHtml: '<p>Reason</p>',
  };
  const errors = (extra: object) =>
    validateSync(plainToInstance(CommunicationDto, { ...base, ...extra }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  assert.deepEqual(errors({ purchaseIntentRating: 3.5, notPurchasedReasons: ['COMPARING'] }), []);
  for (const invalid of [
    { notPurchasedReasons: ['PRICE', 'PRICE'] },
    { notPurchasedReasons: ['MADE_UP'] },
    { purchaseIntentRating: 3.49 },
    { content: 'old' },
  ])
    assert.ok(errors(invalid).length);
});
