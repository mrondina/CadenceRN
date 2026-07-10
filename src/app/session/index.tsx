import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, ScrollView, Pressable, AppState, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { ProgressBar } from '@/components/session/ProgressBar';
import { PillarChip } from '@/components/session/PillarChip';
import { ClozeCard } from '@/components/session/ClozeCard';
import { MCQCard } from '@/components/session/MCQCard';
import { FreeRecallCard } from '@/components/session/FreeRecallCard';
import { NumericCard } from '@/components/session/NumericCard';
import { RatingBar } from '@/components/session/RatingBar';
import { RelatedCard } from '@/components/session/RelatedCard';
import { SessionErrorBoundary } from '@/components/session/SessionErrorBoundary';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { useSessionStore } from '@/stores/sessionStore';
import { computeSessionQueue } from '@/hooks/useQueue';
import { processRating } from '@/hooks/useReviewSession';
import { SchedulerService } from '@/domain/scheduler/SchedulerService';
import { QueueBuilder } from '@/domain/scheduler/QueueBuilder';
import { ExamModeCompressor } from '@/domain/scheduler/ExamModeCompressor';
import { RelearningPipeline } from '@/domain/scheduler/RelearningPipeline';
import { UnsupportedCardFormatError } from '@/domain/types';
import type { ContentItem, FsrsCardState, QueueEntry, Rating, ReviewMode } from '@/domain/types';
import { useAppSettingsStore } from '@/stores/appSettingsStore';
import type { IntervalPreview } from '@/components/session/RatingBar';

// ─── Linked-items lookup ──────────────────────────────────────────────────────

/**
 * Builds a ContentItem lookup map for graphLink resolution after the queue is
 * computed. Queue items are seeded first (no extra DB call needed); any linked
 * IDs not already present are fetched individually. Missing/locked items are
 * silently omitted — RelatedCard degrades gracefully for any unresolved ID.
 * The map is computed once at mount; stale links simply show nothing.
 */
async function computeLinkedItems(
  queue: QueueEntry[],
  repo: { findById(id: string): Promise<ContentItem | null> },
): Promise<Map<string, ContentItem>> {
  const map = new Map<string, ContentItem>();

  for (const entry of queue) {
    map.set(entry.item.id, entry.item);
  }

  const needed = new Set<string>();
  for (const entry of queue) {
    for (const linkId of entry.item.graphLinks) {
      if (!map.has(linkId)) needed.add(linkId);
    }
  }

  for (const id of needed) {
    const item = await repo.findById(id);
    if (item) map.set(item.id, item);
  }

  return map;
}

// ─── Domain services (stateless — module-scope singletons) ────────────────────

const scheduler = new SchedulerService();
const examCompressor = new ExamModeCompressor(scheduler);
const queueBuilder = new QueueBuilder(scheduler);
const relearningPipeline = new RelearningPipeline();

// ─── Preview intervals ────────────────────────────────────────────────────────

// Calls scheduler.schedule() for each rating to get predicted scheduledDays.
// Called once per card (memoized by entry). No side effects.
function computeIntervalPreview(
  fsrs: FsrsCardState,
  mode: ReviewMode,
  now: Date,
): IntervalPreview {
  const desiredRetention = mode === 'exam' ? 0.95 : 0.90;
  return {
    1: scheduler.schedule(fsrs, 1, now, desiredRetention).scheduledDays,
    2: scheduler.schedule(fsrs, 2, now, desiredRetention).scheduledDays,
    3: scheduler.schedule(fsrs, 3, now, desiredRetention).scheduledDays,
    4: scheduler.schedule(fsrs, 4, now, desiredRetention).scheduledDays,
  };
}

// ─── Card router ──────────────────────────────────────────────────────────────

function CardRouter({ entry, onReveal }: { entry: QueueEntry; onReveal: () => void }) {
  const { body } = entry.item;

  switch (body.type) {
    case 'cloze':
      return <ClozeCard body={body} onReveal={onReveal} />;
    case 'mcq':
      return <MCQCard body={body} onReveal={onReveal} itemId={entry.item.id} />;
    case 'free_recall':
      return <FreeRecallCard body={body} onReveal={onReveal} />;
    case 'numeric':
      return <NumericCard body={body} onReveal={onReveal} />;
    case 'sequence':
      throw new UnsupportedCardFormatError('sequence', 'Phase 2 — not yet implemented');
    default:
      throw new UnsupportedCardFormatError(
        (body as { type: string }).type as import('@/domain/types').ItemFormat,
        'unrecognised card format',
      );
  }
}

// ─── Session screen ───────────────────────────────────────────────────────────

export default function SessionScreen() {
  const router = useRouter();
  const { colors, space } = useAppTheme();
  const db = useDBContext();
  const { cohort } = useCohortStore();
  const sessionStore = useSessionStore();
  const dayBoundaryHour = useAppSettingsStore(s => s.dayBoundaryHour);

  const [queueReady, setQueueReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [linkedItemsMap, setLinkedItemsMap] = useState<Map<string, ContentItem>>(() => new Map());

  // Session-level stats for summary.
  const startedAt = useRef(Date.now());
  const correctRef = useRef(0);
  const totalRatedRef = useRef(0);

  const { queue, currentIndex, advance, flush, restore } = sessionStore;
  const currentEntry: QueueEntry | undefined = queue[currentIndex];
  const isComplete = queueReady && currentIndex >= queue.length;

  // ── Load queue on mount ────────────────────────────────────────────────────

  useEffect(() => {
    if (!db || !cohort) return;

    computeSessionQueue({
      now: new Date(),
      cohort,
      contentItemRepo: db.contentItemRepo,
      memStateRepo: db.memStateRepo,
      queueBuilder,
      examCompressor,
    })
      .then(async (q) => {
        sessionStore.setQueue(q);        // resets currentIndex to 0
        await restore(db.db);            // overrides with persisted index if present
        // Non-fatal: a failed lookup falls back to an empty map; RelatedCard
        // degrades by omitting any unresolved link.
        const linked = await computeLinkedItems(q, db.contentItemRepo)
          .catch(() => new Map<string, ContentItem>());
        setLinkedItemsMap(linked);
        setQueueReady(true);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : 'Failed to load queue');
        setQueueReady(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset revealed state on every card advance ─────────────────────────────

  useEffect(() => {
    setRevealed(false);
  }, [currentIndex]);

  // ── Flush session index to SQLite when app backgrounds ────────────────────

  useEffect(() => {
    if (!db) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        flush(db.db).catch(() => {}); // idempotent; ignore flush errors
      }
    });
    return () => sub.remove();
  }, [db, flush]);

  // ── Navigate to summary on completion ─────────────────────────────────────

  useEffect(() => {
    if (!isComplete) return;
    const durationMs = Date.now() - startedAt.current;
    router.replace({
      pathname: '/session/summary',
      params: {
        total: String(totalRatedRef.current),
        correct: String(correctRef.current),
        durationMs: String(durationMs),
      },
    });
  }, [isComplete, router]);

  // ── Interval preview (memoised per card) ──────────────────────────────────

  const intervalPreview: IntervalPreview = useMemo(() => {
    if (!currentEntry) return { 1: 0, 2: 0, 3: 0, 4: 0 };
    const fsrs = currentEntry.kind === 'review'
      ? currentEntry.memoryState.fsrs
      : currentEntry.syntheticState.fsrs;
    return computeIntervalPreview(fsrs, currentEntry.mode, new Date());
  }, [currentEntry]);

  // ── Rating handler ────────────────────────────────────────────────────────

  const handleRate = (rating: Rating) => {
    if (!currentEntry || !db) return;

    // Track stats before advancing.
    totalRatedRef.current += 1;
    if (rating >= 3) correctRef.current += 1;

    // Fire write off the interaction path — advance immediately.
    // Perceived card-to-card latency: tap → advance (sync Zustand) → next card
    // renders (<16ms) → DB write completes in background (~5–20ms).
    processRating({
      entry: currentEntry,
      rating,
      reviewedAt: new Date(),
      latencyMs: 0,
      scheduler,
      relearningPipeline,
      memStateRepo: db.memStateRepo,
      reviewEventRepo: db.reviewEventRepo,
      boundaryConfig: { hourOffset: dayBoundaryHour },
    }).catch((e: unknown) => {
      console.error('[SessionScreen] Rating write failed:', e);
    });

    advance();
  };

  const handleSkip = () => advance();

  // ── Error / loading states ────────────────────────────────────────────────

  if (!queueReady) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="caption" color="inkMuted">Loading your cards…</AppText>
      </AppSafeArea>
    );
  }

  if (loadError) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="body" color="danger">Could not load session.</AppText>
        <AppText variant="caption" color="inkMuted">{loadError}</AppText>
        <Pressable onPress={() => router.back()} style={{ marginTop: space[3] }}>
          <AppText variant="label" color="primary">Go back</AppText>
        </Pressable>
      </AppSafeArea>
    );
  }

  if (queue.length === 0) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="subtitle" style={{ textAlign: 'center' }}>All caught up</AppText>
        <AppText variant="body" color="inkMuted" style={{ textAlign: 'center', marginTop: space[2] }}>
          No reviews due right now.
        </AppText>
        <Pressable onPress={() => router.back()} style={{ marginTop: space[4] }}>
          <AppText variant="label" color="primary">Back to home</AppText>
        </Pressable>
      </AppSafeArea>
    );
  }

  if (isComplete || !currentEntry) return null;

  return (
    <AppSafeArea edges={['top', 'bottom']}>
      {/* Thin progress bar — the only session-level indicator */}
      <ProgressBar current={currentIndex} total={queue.length} />

      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[3] }]}
        keyboardShouldPersistTaps="handled">

        {/* Pillar chip — small, quiet */}
        <PillarChip pillar={currentEntry.item.pillar} />

        {/* Card content behind error boundary — boundary resets on each new card */}
        <SessionErrorBoundary
          key={currentEntry.item.id}
          onSkip={handleSkip}>
          <CardRouter
            entry={currentEntry}
            onReveal={() => setRevealed(true)}
          />
        </SessionErrorBoundary>

        {/* Related concepts — shown on every reveal when the item has graph links */}
        {revealed && currentEntry.item.graphLinks.length > 0 && (
          <RelatedCard links={currentEntry.item.graphLinks} linkedItems={linkedItemsMap} />
        )}

        {/* Rating bar — appears only after answer is revealed */}
        {revealed && (
          <RatingBar intervals={intervalPreview} onRate={handleRate} />
        )}
      </ScrollView>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  content: {
    flexGrow: 1,
  },
});
