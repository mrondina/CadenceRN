/**
 * useForecast integration suite — tests computeForecast with real repositories
 * and seeded content (migration 002 items).
 *
 * Regression target: fresh-install "All caught up" bug — Home showed 0 and
 * disabled the Start button when there were no memory states, even with 106
 * unlocked items. The fix adds newItemCount to ForecastResult so Home can
 * count introducible new items independently of DebtForecaster.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../../db/test-utils/BetterSQLiteDatabase';
import { runMigrations } from '../../db/migrations/runner';
import { ContentItemRepository } from '../../db/repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../../db/repositories/ItemMemoryStateRepository';
import type { IDatabase } from '../../db/types';
import { CohortBuilder } from '../../domain/cohort/CohortBuilder';
import { DebtForecaster } from '../../domain/scheduler/DebtForecaster';
import { ExamModeCompressor } from '../../domain/scheduler/ExamModeCompressor';
import { SchedulerService } from '../../domain/scheduler/SchedulerService';
import type { ItemMemoryState } from '../../domain/types';
import { computeForecast } from '../useForecast';
import { NEW_ITEM_CAP } from '../useQueue';

// Simulation anchor: 2026-07-05 10:00 UTC
const SIM_NOW = new Date('2026-07-05T10:00:00.000Z');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeIntroducedState(itemId: string): ItemMemoryState {
  const now = SIM_NOW.toISOString();
  const due = new Date(SIM_NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    itemId,
    fsrs: {
      stability: 7,
      difficulty: 5,
      due,
      state: 'Review',
      elapsedDays: 1,
      scheduledDays: 7,
      learningSteps: 0,
      reps: 2,
      lapses: 0,
      lastReview: now,
    },
    relearnStreak: 0,
    graduated: false,
    lastQualifyingDate: null,
    updatedAt: now,
  };
}

// ─── Shared domain instances ──────────────────────────────────────────────────

let db: IDatabase;
let contentItemRepo: ContentItemRepository;
let memStateRepo: ItemMemoryStateRepository;
let forecaster: DebtForecaster;
let examCompressor: ExamModeCompressor;

beforeEach(async () => {
  db = openTestDb();
  await runMigrations(db);  // seeds 106 content items
  contentItemRepo = new ContentItemRepository(db);
  memStateRepo = new ItemMemoryStateRepository(db);
  const scheduler = new SchedulerService();
  forecaster = new DebtForecaster();
  examCompressor = new ExamModeCompressor(scheduler);
});

// ─── Regression: fresh install "All caught up" ────────────────────────────────
//
// Three sightings: device with past start date, fresh install, [Yes] path.
// Root cause: DebtForecaster.forecast() only counted ItemMemoryState records.
// With 0 states → forecast[0].dueCount = 0 → button disabled → "All caught up".

describe('regression: fresh-install home screen shows new items, button enabled', () => {
  it('0 memory states, unlocked items → newItemCount = cap, forecast[0].dueCount = 0', async () => {
    // Cohort starting today → session 1, week 1 is active.
    // getGateParams returns sessionIndex=1, week=1.
    // findUnlocked(1, 1) → 36 seeded items (session 1, week 1 release gate) → all new.
    // 36 > NEW_ITEM_CAP → capped at 20.
    const cohort = new CohortBuilder().build({
      id: 'fresh',
      startDate: SIM_NOW,
      templateId: 'bellarmine-absn-v1',
    });

    const result = await computeForecast({
      now: SIM_NOW,
      cohort,
      memStateRepo,
      contentItemRepo,
      forecaster,
      examCompressor,
    });

    // No memory states → no review debt.
    expect(result.forecast[0]?.dueCount ?? 0).toBe(0);
    // Unlocked new items → capped count surfaced to Home.
    expect(result.newItemCount).toBe(NEW_ITEM_CAP);
    // The sum Home uses to enable the button is > 0.
    const todayTotal = (result.forecast[0]?.dueCount ?? 0) + result.newItemCount;
    expect(todayTotal).toBeGreaterThan(0);
  });

  it('past start date (180 days ago) → all 106 items unlock → newItemCount still capped', async () => {
    // 180 days before Jul 5 = Jan 6 → session 3, week 8 → all 106 items pass gate.
    const startDate = new Date(SIM_NOW.getTime() - 180 * 24 * 60 * 60 * 1000);
    const cohort = new CohortBuilder().build({
      id: 'mid-program',
      startDate,
      templateId: 'bellarmine-absn-v1',
    });

    const result = await computeForecast({
      now: SIM_NOW,
      cohort,
      memStateRepo,
      contentItemRepo,
      forecaster,
      examCompressor,
    });

    expect(result.newItemCount).toBe(NEW_ITEM_CAP);
  });

  it('introduced items are excluded from newItemCount', async () => {
    // Cohort starting today → session 1 week 1 → 36 items unlocked.
    // Introduce exactly NEW_ITEM_CAP items → 16 remain new → count is 16.
    const cohort = new CohortBuilder().build({
      id: 'partial',
      startDate: SIM_NOW,
      templateId: 'bellarmine-absn-v1',
    });

    const weekOneItems = await contentItemRepo.findUnlocked({ sessionIndex: 1, week: 1 });
    const toIntroduce = weekOneItems.slice(0, NEW_ITEM_CAP);
    for (const item of toIntroduce) {
      await memStateRepo.insert(db, makeIntroducedState(item.id));
    }

    const result = await computeForecast({
      now: SIM_NOW,
      cohort,
      memStateRepo,
      contentItemRepo,
      forecaster,
      examCompressor,
    });

    const remainingNew = weekOneItems.length - NEW_ITEM_CAP;
    expect(result.newItemCount).toBe(remainingNew);
  });

  it('fully introduced cohort: all items have states → newItemCount = 0', async () => {
    const startDate = new Date(SIM_NOW.getTime() - 180 * 24 * 60 * 60 * 1000);
    const cohort = new CohortBuilder().build({
      id: 'complete',
      startDate,
      templateId: 'bellarmine-absn-v1',
    });

    const allItems = await contentItemRepo.findUnlocked({ sessionIndex: 3, week: 8 });
    for (const item of allItems) {
      await memStateRepo.insert(db, makeIntroducedState(item.id));
    }

    const result = await computeForecast({
      now: SIM_NOW,
      cohort,
      memStateRepo,
      contentItemRepo,
      forecaster,
      examCompressor,
    });

    expect(result.newItemCount).toBe(0);
  });
});
