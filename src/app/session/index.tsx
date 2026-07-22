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
import { CaseBundleCard } from '@/components/session/CaseBundleCard';
import { RatingBar } from '@/components/session/RatingBar';
import { RelatedCard } from '@/components/session/RelatedCard';
import { SessionErrorBoundary } from '@/components/session/SessionErrorBoundary';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { useSessionStore } from '@/stores/sessionStore';
import { computeSessionQueue } from '@/hooks/useQueue';
import { processRating, processCaseRating } from '@/hooks/useReviewSession';
import type { CaseRowAnswer } from '@/hooks/useReviewSession';
import { SchedulerService } from '@/domain/scheduler/SchedulerService';
import { QueueBuilder } from '@/domain/scheduler/QueueBuilder';
import { ExamModeCompressor } from '@/domain/scheduler/ExamModeCompressor';
import { RelearningPipeline } from '@/domain/scheduler/RelearningPipeline';
import { UnsupportedCardFormatError } from '@/domain/types';
import type { ContentCase, ContentItem, FsrsCardState, QueueEntry, Rating, ReviewMode } from '@/domain/types';
import { useAppSettingsStore } from '@/stores/appSettingsStore';
import type { IntervalPreview } from '@/components/session/RatingBar';
import {
  computeLogicalGroups,
  findCurrentGroup,
} from '@/components/session/caseBundleUtils';
import { resolveRating, isCorrectForAccuracy } from '@/components/session/objectiveCardUtils';

// ─── Linked-items lookup ──────────────────────────────────────────────────────

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
    for (const link of entry.item.graphLinks) {
      if (typeof link === 'string' && !map.has(link)) needed.add(link);
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

// ─── Card router (standalone formats only) ────────────────────────────────────

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
  const [casesMap, setCasesMap] = useState<Map<string, ContentCase>>(() => new Map());

  const startedAt = useRef(Date.now());
  const correctRef = useRef(0);
  const totalRatedRef = useRef(0);

  // null  → self-graded format (cloze, free_recall): accuracy from rating≥3
  // true  → objective format, answered correctly: accuracy always counts correct
  // false → objective format, answered incorrectly: forced Again, accuracy counts wrong
  const [revealResult, setRevealResult] = useState<boolean | null>(null);

  const { queue, currentIndex, advance, advanceBy, flush, restore } = sessionStore;
  const currentEntry: QueueEntry | undefined = queue[currentIndex];
  const isComplete = queueReady && currentIndex >= queue.length;

  // ── Logical progress (case bundle = 1 position) ───────────────────────────

  const logicalGroups = useMemo(() => computeLogicalGroups(queue), [queue]);
  const currentGroupResult = useMemo(
    () => findCurrentGroup(logicalGroups, currentIndex),
    [logicalGroups, currentIndex],
  );
  const logicalTotal = logicalGroups.length;
  const logicalIndex = currentGroupResult?.logicalIndex ?? 0;

  const isCaseBundle = currentGroupResult?.group.kind === 'case';

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
        sessionStore.setQueue(q);
        await restore(db.db);

        const linked = await computeLinkedItems(q, db.contentItemRepo)
          .catch(() => new Map<string, ContentItem>());
        setLinkedItemsMap(linked);

        // Pre-fetch all ContentCase metadata so CaseBundleCard never has to wait.
        const caseIds = [...new Set(
          q.filter(e => e.item.caseId !== null).map(e => e.item.caseId!),
        )];
        if (caseIds.length > 0) {
          const cases = await db.caseRepo.findByIds(caseIds).catch(() => [] as ContentCase[]);
          setCasesMap(new Map(cases.map(c => [c.caseId, c])));
        }

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
    setRevealResult(null);
  }, [currentIndex]);

  // ── Skip bundles with missing case metadata (data-integrity failure) ──────
  //
  // casesMap is fully populated before queueReady flips to true, so any caseId
  // absent here is a genuine gap (DB write failed, content_pack_id mismatch, etc).
  // Advance past the whole bundle to avoid stranding the student on a dead card,
  // mirroring SessionErrorBoundary's onSkip behavior for standalone cards.

  useEffect(() => {
    if (!queueReady) return;
    if (!currentGroupResult || currentGroupResult.group.kind !== 'case') return;
    const { group } = currentGroupResult;
    if (!casesMap.has(group.caseId)) {
      console.error(
        `[SessionScreen] Missing ContentCase for caseId=${group.caseId}; ` +
        `advancing past ${group.size}-row bundle to prevent session block`,
      );
      advanceBy(group.size);
    }
  }, [queueReady, currentGroupResult, casesMap, advanceBy]);

  // ── Flush session index to SQLite when app backgrounds ────────────────────

  useEffect(() => {
    if (!db) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        flush(db.db).catch(() => {});
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

  // ── Interval preview (memoised per standalone card) ───────────────────────

  const intervalPreview: IntervalPreview = useMemo(() => {
    if (!currentEntry || isCaseBundle) return { 1: 0, 2: 0, 3: 0, 4: 0 };
    const fsrs = currentEntry.kind === 'review'
      ? currentEntry.memoryState.fsrs
      : currentEntry.syntheticState.fsrs;
    return computeIntervalPreview(fsrs, currentEntry.mode, new Date());
  }, [currentEntry, isCaseBundle]);

  // ── Standalone rating handlers ─────────────────────────────────────────────
  //
  // handleRate: objective-correct (revealResult===true) and self-graded
  //   (revealResult===null). Accuracy logic differs by path:
  //   - objective-correct: count as correct regardless of which rating the user
  //     chooses (they got the answer right; the rating calibrates FSRS interval).
  //   - self-graded: count as correct only when rating≥3 (per-design, Evidence §2).
  //
  // handleObjectiveMiss: objective-wrong (revealResult===false). Forces rating=1
  //   (Again). Never increments correctRef. Called from the "Continue" button shown
  //   instead of the RatingBar after a confirmed wrong MCQ/numeric answer.

  const handleRate = (rating: Rating) => {
    if (!currentEntry || !db) return;

    totalRatedRef.current += 1;
    if (isCorrectForAccuracy(revealResult, rating)) {
      correctRef.current += 1;
    }

    processRating({
      entry: currentEntry,
      rating: resolveRating(revealResult, rating),
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

  const handleObjectiveMiss = () => {
    if (!currentEntry || !db) return;

    totalRatedRef.current += 1;
    // correctRef intentionally not incremented — answer was objectively wrong.

    processRating({
      entry: currentEntry,
      rating: 1, // Again — forced; not the user's choice
      reviewedAt: new Date(),
      latencyMs: 0,
      scheduler,
      relearningPipeline,
      memStateRepo: db.memStateRepo,
      reviewEventRepo: db.reviewEventRepo,
      boundaryConfig: { hourOffset: dayBoundaryHour },
    }).catch((e: unknown) => {
      console.error('[SessionScreen] Objective-miss rating write failed:', e);
    });

    advance();
  };

  const handleSkip = () => advance();

  // ── Case bundle handlers ───────────────────────────────────────────────────

  const handleCaseSubmit = (rowAnswers: CaseRowAnswer[]) => {
    if (!db) return;
    // reviewedAt captured at the moment Submit is tapped — matches standalone handleRate pattern.
    const reviewedAt = new Date();
    // Exam mode wins if any row is exam-mode (conservative: one exam row → all rated as exam).
    const mode = rowAnswers.some(a => a.entry.mode === 'exam') ? 'exam' : 'daily';

    totalRatedRef.current += rowAnswers.length;
    correctRef.current += rowAnswers.filter(a => a.correct).length;

    processCaseRating({
      rowAnswers,
      mode,
      reviewedAt,
      scheduler,
      relearningPipeline,
      memStateRepo: db.memStateRepo,
      reviewEventRepo: db.reviewEventRepo,
      boundaryConfig: { hourOffset: dayBoundaryHour },
    }).catch((e: unknown) => {
      console.error('[SessionScreen] Case rating write failed:', e);
    });
  };

  const handleCaseAdvance = (n: number) => {
    advanceBy(n);
  };

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

  // ── Case bundle path ──────────────────────────────────────────────────────
  // CaseBundleCard owns its own ScrollView with stickyHeaderIndices={[0]} so
  // the scenario + exhibit panel pins while the student works through matrix rows.

  if (isCaseBundle && currentGroupResult?.group.kind === 'case') {
    const group = currentGroupResult.group;
    const bundleEntries = queue.slice(group.startIndex, group.startIndex + group.size);
    const caseData = casesMap.get(group.caseId);

    return (
      <AppSafeArea edges={['top', 'bottom']}>
        {/* Logical position: this entire bundle = 1 slot in progress */}
        <ProgressBar current={logicalIndex} total={logicalTotal} />

        <View style={{ paddingHorizontal: space[4], paddingTop: space[2] }}>
          <PillarChip pillar={currentEntry.item.pillar} />
        </View>

        {caseData && (
          <CaseBundleCard
            key={group.caseId}
            caseData={caseData}
            entries={bundleEntries}
            onSubmit={handleCaseSubmit}
            onContinue={() => handleCaseAdvance(group.size)}
          />
        )}
      </AppSafeArea>
    );
  }

  // ── Standalone path ───────────────────────────────────────────────────────

  return (
    <AppSafeArea edges={['top', 'bottom']}>
      <ProgressBar current={logicalIndex} total={logicalTotal} />

      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[3] }]}
        keyboardShouldPersistTaps="handled">

        <PillarChip pillar={currentEntry.item.pillar} />

        <SessionErrorBoundary
          key={currentEntry.item.id}
          onSkip={handleSkip}>
          <CardRouter
            entry={currentEntry}
            onReveal={(correct?: boolean) => {
              setRevealed(true);
              setRevealResult(correct ?? null);
            }}
          />
        </SessionErrorBoundary>

        {revealed && (() => {
          const conceptualLinks = currentEntry.item.graphLinks.filter(
            (l): l is string => typeof l === 'string',
          );
          return conceptualLinks.length > 0 ? (
            <RelatedCard links={conceptualLinks} linkedItems={linkedItemsMap} />
          ) : null;
        })()}

        {revealed && revealResult === false && (
          // Objective wrong answer: no rating choice. Force Again, show message.
          <View style={{ gap: space[2] }}>
            <AppText
              variant="caption"
              color="inkMuted"
              style={{ textAlign: 'center' }}>
              Incorrect — scheduled to review this one again soon.
            </AppText>
            <Pressable
              onPress={handleObjectiveMiss}
              accessibilityRole="button"
              accessibilityLabel="Continue"
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: space[3],
                opacity: pressed ? 0.65 : 1,
              })}>
              <AppText variant="label" color="primary">Continue</AppText>
            </Pressable>
          </View>
        )}

        {revealed && revealResult !== false && (
          // Objective correct (revealResult===true) or self-graded (revealResult===null):
          // full rating bar. handleRate routes accuracy appropriately for each case.
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
