import { describe, expect, it } from 'vitest';

import {
  currentRotationIndex,
  rotationMemberForStep,
  type RotationMember,
} from '../src/services/oncall.service.js';
import { ConflictError } from '../src/utils/errors.js';

const members: RotationMember[] = [
  { position: 0, user: { id: 'user-a', email: 'alice@example.com', displayName: 'Alice' } },
  { position: 1, user: { id: 'user-b', email: 'bob@example.com', displayName: 'Bob' } },
  { position: 2, user: { id: 'user-c', email: 'charlie@example.com', displayName: 'Charlie' } },
];

const schedule = {
  rotationStartAt: new Date('2026-01-01T00:00:00.000Z'),
  rotationPeriodMinutes: 60,
  members,
};

describe('ordered on-call rotation', () => {
  it('selects the rotation member deterministically from time elapsed since rotation start', () => {
    expect(
      currentRotationIndex(
        schedule.rotationStartAt,
        60,
        members.length,
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ).toBe(0);
    expect(
      currentRotationIndex(
        schedule.rotationStartAt,
        60,
        members.length,
        new Date('2026-01-01T01:20:00.000Z'),
      ),
    ).toBe(1);
    expect(
      currentRotationIndex(
        schedule.rotationStartAt,
        60,
        members.length,
        new Date('2026-01-01T03:01:00.000Z'),
      ),
    ).toBe(0);
  });

  it('advances through a fixed incident escalation order without wrapping', () => {
    expect(rotationMemberForStep(schedule, 0, new Date('2026-01-01T01:10:00.000Z')).user.id).toBe(
      'user-b',
    );
    expect(rotationMemberForStep(schedule, 1, new Date('2026-01-01T01:10:00.000Z')).user.id).toBe(
      'user-c',
    );
  });

  it('stops escalation when the incident rotation has been exhausted', () => {
    expect(() => rotationMemberForStep(schedule, 2, new Date('2026-01-01T01:10:00.000Z'))).toThrow(
      ConflictError,
    );
  });
});
