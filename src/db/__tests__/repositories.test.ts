import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../test-utils/BetterSQLiteDatabase';
import { runSchemaOnly } from '../migrations/runner';
import { ContentItemRepository } from '../repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../repositories/ItemMemoryStateRepository';
import { ReviewEventRepository } from '../repositories/ReviewEventRepository';
import { CohortRepository } from '../repositories/CohortRepository';
import { DrillResultRepository } from '../repositories/DrillResultRepository';
import type { IDatabase } from '../types';
import type {
  ContentItem,
  ItemMemoryState,
  ReviewEvent,
  Cohort,
  FirstReviewTransaction,
  DrillResult,
} from '../../domain/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(id: string, packId = 'pack-1'): ContentItem {
  return {
    id,
    pillar: 'terminology',
    format: 'cloze',
    difficultyTier: 1,
    body: { type: 'cloze', front: 'Q {{blank}}', back: 'A' },
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: packId,
    contentVersion: 1,
    placeholder: false,
  };
}

function makeMemoryState(itemId: string, dueIso = '2026-07-10T10:00:00.000Z'): ItemMemoryState {
  return {
    itemId,
    fsrs: {
      stability: 4,
      difficulty: 5,
      due: dueIso,
      state: 'Review',
      elapsedDays: 4,
      scheduledDays: 4,
      learningSteps: 0,
      reps: 2,
      lapses: 0,
      lastReview: '2026-07-06T10:00:00.000Z',
    },
    relearnStreak: 1,
    graduated: false,
    lastQualifyingDate: '2026-07-06T10:00:00.000Z',
    updatedAt: '2026-07-06T10:00:00.000Z',
  };
}

function makeEvent(id: string, itemId: string): ReviewEvent {
  return {
    id,
    itemId,
    ts: '2026-07-06T10:00:00.000Z',
    rating: 3,
    latencyMs: 1500,
    mode: 'daily',
    stabilityBefore: 0,
    difficultyBefore: 0,
    dueBefore: '2026-07-06T10:00:00.000Z',
  };
}

function makeCohort(): Cohort {
  return {
    id: 'cohort-1',
    startDate: '2026-06-01',
    templateId: 'bellarmine-absn-v1',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    sessions: [
      {
        id: 'session-1',
        cohortId: 'cohort-1',
        sessionIndex: 1,
        label: 'Summer A',
        startDate: '2026-06-01',
        endDate: '2026-07-25',
        updatedAt: '2026-06-01T00:00:00.000Z',
        courses: [
          {
            id: 'course-1',
            sessionId: 'session-1',
            title: 'Applied Pharmacology',
            contentPackIds: ['pack-1'],
            examDates: ['2026-07-20'],
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      },
    ],
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let db: IDatabase;

beforeEach(async () => {
  db = openTestDb();
  await runSchemaOnly(db);
});

// ─── ContentItemRepository ───────────────────────────────────────────────────

describe('ContentItemRepository', () => {
  it('upsert then findById round-trips all fields', async () => {
    const repo = new ContentItemRepository(db);
    const item = makeItem('item-1');
    await repo.upsert(item);

    const found = await repo.findById('item-1');
    expect(found).toEqual(item);
  });

  it('findByPack returns all items in a pack', async () => {
    const repo = new ContentItemRepository(db);
    await repo.upsert(makeItem('a', 'pack-x'));
    await repo.upsert(makeItem('b', 'pack-x'));
    await repo.upsert(makeItem('c', 'pack-y'));

    const results = await repo.findByPack('pack-x');
    expect(results).toHaveLength(2);
    expect(results.map(i => i.id).sort()).toEqual(['a', 'b']);
  });

  it('upsert is idempotent — second write with same id updates fields', async () => {
    const repo = new ContentItemRepository(db);
    await repo.upsert(makeItem('item-u'));

    const updated: ContentItem = { ...makeItem('item-u'), contentVersion: 2, highAlert: true };
    await repo.upsert(updated);

    const found = await repo.findById('item-u');
    expect(found?.contentVersion).toBe(2);
    expect(found?.highAlert).toBe(true);
  });

  it('findUnlocked returns items at or before session/week boundary', async () => {
    const repo = new ContentItemRepository(db);
    const s1w1: ContentItem = { ...makeItem('s1w1'), releaseGate: { sessionIndex: 1, week: 1 } };
    const s1w2: ContentItem = { ...makeItem('s1w2'), releaseGate: { sessionIndex: 1, week: 2 } };
    const s2w1: ContentItem = { ...makeItem('s2w1'), releaseGate: { sessionIndex: 2, week: 1 } };

    await repo.upsert(s1w1);
    await repo.upsert(s1w2);
    await repo.upsert(s2w1);

    const unlocked = await repo.findUnlocked({ sessionIndex: 1, week: 2 });
    const ids = unlocked.map(i => i.id).sort();
    expect(ids).toEqual(['s1w1', 's1w2']);
    expect(ids).not.toContain('s2w1');
  });

  it('body JSON with mcq format round-trips correctly', async () => {
    const repo = new ContentItemRepository(db);
    const mcqItem: ContentItem = {
      ...makeItem('mcq-1'),
      format: 'mcq',
      body: {
        type: 'mcq',
        stem: 'Which drug is a beta-blocker?',
        choices: [
          { id: 'a', text: 'Propranolol' },
          { id: 'b', text: 'Furosemide' },
        ],
        correctId: 'a',
        explanation: 'Propranolol is a non-selective beta-blocker.',
      },
    };
    await repo.upsert(mcqItem);
    const found = await repo.findById('mcq-1');
    expect(found?.body).toEqual(mcqItem.body);
  });
});

// ─── ItemMemoryStateRepository ────────────────────────────────────────────────

describe('ItemMemoryStateRepository', () => {
  it('insert + findByItemId round-trips all fields including lastQualifyingDate', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('item-m'));

    const stateRepo = new ItemMemoryStateRepository(db);
    const state = makeMemoryState('item-m');
    await stateRepo.insert(db, state);

    const found = await stateRepo.findByItemId('item-m');
    expect(found).toEqual(state);
  });

  it('lastQualifyingDate persists as null when null', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('item-null-lqd'));

    const stateRepo = new ItemMemoryStateRepository(db);
    const state: ItemMemoryState = { ...makeMemoryState('item-null-lqd'), lastQualifyingDate: null };
    await stateRepo.insert(db, state);

    const found = await stateRepo.findByItemId('item-null-lqd');
    expect(found?.lastQualifyingDate).toBeNull();
  });

  it('update mutates fsrs fields and lastQualifyingDate', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('item-upd'));

    const stateRepo = new ItemMemoryStateRepository(db);
    const original = makeMemoryState('item-upd');
    await stateRepo.insert(db, original);

    const updated: ItemMemoryState = {
      ...original,
      fsrs: { ...original.fsrs, stability: 12, reps: 3 },
      relearnStreak: 2,
      graduated: true,
      lastQualifyingDate: '2026-07-08T10:00:00.000Z',
      updatedAt: '2026-07-08T10:00:00.000Z',
    };
    await stateRepo.update(updated);

    const found = await stateRepo.findByItemId('item-upd');
    expect(found?.fsrs.stability).toBe(12);
    expect(found?.relearnStreak).toBe(2);
    expect(found?.graduated).toBe(true);
    expect(found?.lastQualifyingDate).toBe('2026-07-08T10:00:00.000Z');
  });

  it('findDueBy returns only states due at or before cutoff', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('due-a'));
    await itemRepo.upsert(makeItem('due-b'));
    await itemRepo.upsert(makeItem('future'));

    const stateRepo = new ItemMemoryStateRepository(db);
    await stateRepo.insert(db, makeMemoryState('due-a', '2026-07-05T10:00:00.000Z'));
    await stateRepo.insert(db, makeMemoryState('due-b', '2026-07-07T10:00:00.000Z'));
    await stateRepo.insert(db, makeMemoryState('future', '2026-07-15T10:00:00.000Z'));

    const due = await stateRepo.findDueBy('2026-07-07T23:59:59.000Z');
    const ids = due.map(s => s.itemId).sort();
    expect(ids).toEqual(['due-a', 'due-b']);
    expect(ids).not.toContain('future');
  });
});

// ─── ReviewEventRepository — first-review transaction ─────────────────────────

describe('ReviewEventRepository', () => {
  it('recordFirstReview inserts both event and state atomically', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('item-fr'));

    const repo = new ReviewEventRepository(db);
    const stateRepo = new ItemMemoryStateRepository(db);

    const tx: FirstReviewTransaction = {
      event: makeEvent('evt-1', 'item-fr'),
      initialMemoryState: makeMemoryState('item-fr'),
    };

    await repo.recordFirstReview(tx);

    const events = await repo.findByItemId('item-fr');
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('evt-1');

    const state = await stateRepo.findByItemId('item-fr');
    expect(state?.itemId).toBe('item-fr');
  });

  it('rollback: if state insert fails, event is not persisted', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('item-rb'));

    // Pre-insert the state to force a UNIQUE constraint violation on the state insert.
    const stateRepo = new ItemMemoryStateRepository(db);
    await stateRepo.insert(db, makeMemoryState('item-rb'));

    const repo = new ReviewEventRepository(db);
    const tx: FirstReviewTransaction = {
      event: makeEvent('evt-rb', 'item-rb'),
      initialMemoryState: makeMemoryState('item-rb'),
    };

    await expect(repo.recordFirstReview(tx)).rejects.toThrow();

    // The event must NOT have been persisted.
    const events = await repo.findByItemId('item-rb');
    expect(events).toHaveLength(0);
  });

  it('no UPDATE path: review_events are append-only', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('item-ao'));

    const repo = new ReviewEventRepository(db);

    const event1 = makeEvent('evt-ao-1', 'item-ao');
    const event2: ReviewEvent = { ...makeEvent('evt-ao-2', 'item-ao'), rating: 4 };
    const state = makeMemoryState('item-ao');

    await repo.recordFirstReview({ event: event1, initialMemoryState: state });
    await repo.append(event2);

    const events = await repo.findByItemId('item-ao');
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt-ao-1');
    expect(events[1].id).toBe('evt-ao-2');
    expect(events[0].rating).toBe(3);
    expect(events[1].rating).toBe(4);
  });

  it('findAll returns events in chronological order', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('item-ord'));

    const repo = new ReviewEventRepository(db);
    const stateRepo = new ItemMemoryStateRepository(db);
    await stateRepo.insert(db, makeMemoryState('item-ord'));

    const e1: ReviewEvent = { ...makeEvent('e1', 'item-ord'), ts: '2026-07-01T10:00:00.000Z' };
    const e2: ReviewEvent = { ...makeEvent('e2', 'item-ord'), ts: '2026-07-03T10:00:00.000Z' };

    await repo.append(e1);
    await repo.append(e2);

    const all = await repo.findAll();
    expect(all[0].ts <= all[1].ts).toBe(true);
  });
});

// ─── CohortRepository ─────────────────────────────────────────────────────────

describe('CohortRepository', () => {
  it('save + findById round-trips cohort with sessions and courses', async () => {
    const repo = new CohortRepository(db);
    const cohort = makeCohort();
    await repo.save(cohort);

    const found = await repo.findById('cohort-1');
    expect(found?.id).toBe('cohort-1');
    expect(found?.sessions).toHaveLength(1);
    expect(found?.sessions[0].courses).toHaveLength(1);
    expect(found?.sessions[0].courses[0].examDates).toEqual(['2026-07-20']);
    expect(found?.sessions[0].courses[0].contentPackIds).toEqual(['pack-1']);
  });

  it('save is idempotent — second save updates in place', async () => {
    const repo = new CohortRepository(db);
    const cohort = makeCohort();
    await repo.save(cohort);

    const updated: Cohort = {
      ...cohort,
      updatedAt: '2026-06-10T00:00:00.000Z',
      sessions: [
        {
          ...cohort.sessions[0],
          label: 'Summer A (edited)',
          updatedAt: '2026-06-10T00:00:00.000Z',
          courses: [
            {
              ...cohort.sessions[0].courses[0],
              examDates: ['2026-07-22'],
              updatedAt: '2026-06-10T00:00:00.000Z',
            },
          ],
        },
      ],
    };
    await repo.save(updated);

    const found = await repo.findById('cohort-1');
    expect(found?.sessions[0].label).toBe('Summer A (edited)');
    expect(found?.sessions[0].courses[0].examDates).toEqual(['2026-07-22']);
  });

  it('findFirst returns the earliest cohort by created_at', async () => {
    const repo = new CohortRepository(db);

    const c1: Cohort = {
      id: 'c-early',
      startDate: '2026-01-01',
      templateId: 'bellarmine-absn-v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      sessions: [
        {
          id: 'session-early-1',
          cohortId: 'c-early',
          sessionIndex: 1,
          label: 'Summer A',
          startDate: '2026-01-01',
          endDate: '2026-02-25',
          updatedAt: '2026-01-01T00:00:00.000Z',
          courses: [],
        },
      ],
    };

    const c2: Cohort = {
      id: 'c-late',
      startDate: '2026-06-01',
      templateId: 'bellarmine-absn-v1',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      sessions: [
        {
          id: 'session-late-1',
          cohortId: 'c-late',
          sessionIndex: 1,
          label: 'Summer A',
          startDate: '2026-06-01',
          endDate: '2026-07-25',
          updatedAt: '2026-06-01T00:00:00.000Z',
          courses: [],
        },
      ],
    };

    await repo.save(c1);
    await repo.save(c2);

    const first = await repo.findFirst();
    expect(first?.id).toBe('c-early');
  });
});

// ─── DrillResultRepository ────────────────────────────────────────────────────

describe('DrillResultRepository', () => {
  it('append + findByItemId round-trips all fields', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('drill-item'));

    const repo = new DrillResultRepository(db);
    const result: DrillResult = {
      id: 'drill-1',
      itemId: 'drill-item',
      ts: '2026-07-06T10:00:00.000Z',
      correct: true,
      latencyMs: 2000,
      userAnswer: '42',
    };
    await repo.append(result);

    const found = await repo.findByItemId('drill-item');
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual(result);
  });

  it('countCorrectByItemId returns correct count', async () => {
    const itemRepo = new ContentItemRepository(db);
    await itemRepo.upsert(makeItem('drill-count'));

    const repo = new DrillResultRepository(db);
    const base: DrillResult = {
      id: 'dc-1',
      itemId: 'drill-count',
      ts: '2026-07-06T10:00:00.000Z',
      correct: true,
      latencyMs: 1000,
      userAnswer: '1',
    };
    await repo.append(base);
    await repo.append({ ...base, id: 'dc-2', correct: false, userAnswer: '2' });
    await repo.append({ ...base, id: 'dc-3', correct: true, userAnswer: '3' });

    const count = await repo.countCorrectByItemId('drill-count');
    expect(count).toBe(2);
  });
});

// ─── Regression: just-in-time onboarding → cold start → Home ─────────────────
//
// New onboarding: start-date → confirm-courses (derive / confirm / fallback).
// The gateway in HomeScreen.useEffect is cohortRepo.findFirst() — non-null routes
// to Home, null routes to /setup/start-date. These tests lock that invariant and
// cover the two confirm-courses exits and the past-start-date case.

import { CohortBuilder, BELLARMINE_SESSION_COURSES } from '../../domain/cohort/CohortBuilder';
import { uuidv7 } from 'uuidv7';

describe('regression: just-in-time onboarding → HomeScreen routes to Home', () => {
  const builder = new CohortBuilder();

  // Build a cohort the way start-date.tsx does: CohortBuilder + SESSION_COURSES attachment.
  function makeOnboardingCohort(startDate: Date, cohortId = 'ob-cohort'): Cohort {
    const built = builder.build({ id: cohortId, startDate, templateId: 'bellarmine-absn-v1' });
    const now = new Date().toISOString();
    const sessions = built.sessions.map(s => ({
      ...s,
      courses: (BELLARMINE_SESSION_COURSES[s.sessionIndex] ?? []).map(ct => ({
        id: uuidv7(),
        sessionId: s.id,
        title: ct.title,
        contentPackIds: ct.contentPackIds,
        examDates: [] as string[],
        updatedAt: now,
      })),
    }));
    return { ...built, sessions };
  }

  it('fresh install — findFirst returns null → HomeScreen routes to setup', async () => {
    const repo = new CohortRepository(db);
    const found = await repo.findFirst();
    expect(found, 'no cohort → findFirst must be null → routes to /setup/start-date').toBeNull();
  });

  it('[Yes, start studying] — all 6 template sessions + courses persist, findFirst non-null', async () => {
    const repo = new CohortRepository(db);
    // Past start date is the primary case: student is mid-program when they onboard.
    const cohort = makeOnboardingCohort(new Date('2026-07-01T00:00:00.000Z'));

    // confirm-courses [Yes] path: save cohort as-is (template courses, no edits).
    await repo.save(cohort);

    const found = await repo.findFirst();
    expect(found, 'null here means HomeScreen routes to /setup/start-date').not.toBeNull();
    expect(found?.sessions).toHaveLength(6);
    expect(found?.templateId).toBe('bellarmine-absn-v1');

    // Session 1 must have the 3 template courses with correct contentPackIds.
    const s1 = found!.sessions[0];
    expect(s1.courses).toHaveLength(3);
    expect(s1.courses.map(c => c.title)).toContain('Applied Pharmacology');
    expect(s1.courses.find(c => c.title === 'Applied Pharmacology')?.contentPackIds)
      .toEqual(['pharm-pack', 'dosage-pack']);

    // Future sessions exist but have no content packs yet (placeholder state).
    expect(found!.sessions[1].courses).toHaveLength(1);
    expect(found!.sessions[1].courses[0].contentPackIds).toEqual([]);
  });

  it('[Not quite] with edits — removed course absent, added Other persists with empty contentPackIds', async () => {
    const repo = new CohortRepository(db);
    const base = makeOnboardingCohort(new Date('2026-07-01T00:00:00.000Z'), 'ob-edit');
    const now = new Date().toISOString();

    // Simulate confirm-courses edit mode on session 1:
    // remove "Nursing Terminology", keep the other two, add an "Other" course.
    const s1 = base.sessions[0];
    const editedCourses = [
      ...s1.courses.filter(c => c.title !== 'Nursing Terminology'),
      {
        id: uuidv7(),
        sessionId: s1.id,
        title: 'Clinical Simulation Lab',
        contentPackIds: [] as string[], // Other course — no content pack
        examDates: [] as string[],
        updatedAt: now,
      },
    ];
    const editedCohort: Cohort = {
      ...base,
      updatedAt: now,
      sessions: base.sessions.map(s =>
        s.id === s1.id ? { ...s, courses: editedCourses, updatedAt: now } : s,
      ),
    };

    await repo.save(editedCohort);

    const found = await repo.findFirst();
    expect(found).not.toBeNull();
    const foundS1 = found!.sessions[0];
    const titles = foundS1.courses.map(c => c.title);
    expect(titles).not.toContain('Nursing Terminology');
    expect(titles).toContain('Clinical Simulation Lab');
    const otherCourse = foundS1.courses.find(c => c.title === 'Clinical Simulation Lab')!;
    expect(otherCourse.contentPackIds, 'Other course must have empty contentPackIds').toEqual([]);
    // Remaining template courses survived.
    expect(titles).toContain('Health Assessment & Foundations');
    expect(titles).toContain('Applied Pharmacology');
  });
});

// ─── ContentItemRepository — practice meta queries ────────────────────────────

describe('ContentItemRepository.findWeeksByPack', () => {
  function makeItemForWeek(id: string, week: number, pillar = 'terminology'): ContentItem {
    return {
      id,
      pillar: pillar as ContentItem['pillar'],
      format: 'cloze',
      difficultyTier: 1,
      body: { type: 'cloze', front: `Q {{blank}}`, back: 'A' },
      sourceCitation: 'test',
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week },
      contentPackId: 'meta-pack',
      contentVersion: 1,
      placeholder: false,
    };
  }

  it('returns distinct weeks sorted ascending', async () => {
    const repo = new ContentItemRepository(db);
    await repo.upsert(makeItemForWeek('a', 3));
    await repo.upsert(makeItemForWeek('b', 1));
    await repo.upsert(makeItemForWeek('c', 3)); // duplicate week
    await repo.upsert(makeItemForWeek('d', 2));
    const weeks = await repo.findWeeksByPack('meta-pack');
    expect(weeks).toEqual([1, 2, 3]);
  });

  it('returns empty array for a pack with no content', async () => {
    const repo = new ContentItemRepository(db);
    const weeks = await repo.findWeeksByPack('nonexistent-pack');
    expect(weeks).toEqual([]);
  });

  it('does not return weeks from other packs', async () => {
    const repo = new ContentItemRepository(db);
    await repo.upsert({ ...makeItemForWeek('x', 5), contentPackId: 'other-pack' });
    await repo.upsert(makeItemForWeek('y', 1));
    const weeks = await repo.findWeeksByPack('meta-pack');
    expect(weeks).toEqual([1]);
  });
});

describe('ContentItemRepository.findPillarsByPackAndWeek', () => {
  function makeItemForPillar(id: string, week: number, pillar: string): ContentItem {
    return {
      id,
      pillar: pillar as ContentItem['pillar'],
      format: 'cloze',
      difficultyTier: 1,
      body: { type: 'cloze', front: `Q {{blank}}`, back: 'A' },
      sourceCitation: 'test',
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week },
      contentPackId: 'pillar-pack',
      contentVersion: 1,
      placeholder: false,
    };
  }

  it('returns distinct pillars across all weeks when week omitted', async () => {
    const repo = new ContentItemRepository(db);
    await repo.upsert(makeItemForPillar('p1', 1, 'pharm'));
    await repo.upsert(makeItemForPillar('p2', 2, 'concepts'));
    await repo.upsert(makeItemForPillar('p3', 1, 'pharm')); // duplicate pillar
    const pillars = await repo.findPillarsByPackAndWeek('pillar-pack');
    expect(pillars.sort()).toEqual(['concepts', 'pharm']);
  });

  it('returns only pillars present in the specified week', async () => {
    const repo = new ContentItemRepository(db);
    await repo.upsert(makeItemForPillar('p1', 1, 'pharm'));
    await repo.upsert(makeItemForPillar('p2', 2, 'concepts'));
    await repo.upsert(makeItemForPillar('p3', 2, 'terminology'));
    const pillars = await repo.findPillarsByPackAndWeek('pillar-pack', 2);
    expect(pillars.sort()).toEqual(['concepts', 'terminology']);
  });

  it('returns empty array when no items match the week', async () => {
    const repo = new ContentItemRepository(db);
    await repo.upsert(makeItemForPillar('p1', 1, 'pharm'));
    const pillars = await repo.findPillarsByPackAndWeek('pillar-pack', 5);
    expect(pillars).toEqual([]);
  });

  it('does not return pillars from other packs', async () => {
    const repo = new ContentItemRepository(db);
    await repo.upsert({ ...makeItemForPillar('p1', 1, 'procedures'), contentPackId: 'other-pack' });
    await repo.upsert(makeItemForPillar('p2', 1, 'pharm'));
    const pillars = await repo.findPillarsByPackAndWeek('pillar-pack', 1);
    expect(pillars).toEqual(['pharm']);
  });
});
