import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { CaseBundleCard } from '@/components/session/CaseBundleCard';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useCasePractice } from '@/hooks/useCasePractice';
import { SchedulerService } from '@/domain/scheduler/SchedulerService';
import type { QueueEntry, SyntheticItemState } from '@/domain/types';
import type { CaseRowAnswer } from '@/hooks/useReviewSession';

// Module-scope singleton — SchedulerService is stateless; createInitialState
// is the only call here. Same pattern as session/index.tsx.
const scheduler = new SchedulerService();

// ─── Entry → QueueEntry adapter ───────────────────────────────────────────────
//
// CaseBundleCard and its renderers only access entry.item. The kind/syntheticState
// fields satisfy the discriminated union; their FSRS values are never used because
// the practice path calls no processRating or processCaseRating.
function makeEntries(rows: import('@/domain/types').ContentItem[], now: Date): QueueEntry[] {
  return rows.map(item => {
    const syntheticState: SyntheticItemState = {
      itemId: item.id,
      fsrs: scheduler.createInitialState(item.id, now),
      relearnStreak: 0,
      graduated: false,
    };
    return { kind: 'new', item, syntheticState, mode: 'daily' as const };
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CasePreviewScreen() {
  const router = useRouter();
  const { colors, space } = useAppTheme();
  const db = useDBContext();

  // useCasePractice loads on mount; db is guaranteed non-null by route gating
  // (TryACaseCard only navigates here when hasCases === true).
  const { bundles, loading, error } = useCasePractice(
    db!.caseRepo,
    db!.contentItemRepo,
  );

  // Which case is currently displayed — cycles through available bundles.
  const [caseIndex, setCaseIndex] = useState(0);
  // Whether the current case has been submitted (Continue tapped by user).
  const [submitted, setSubmitted] = useState(false);

  const bundle = bundles[caseIndex % Math.max(bundles.length, 1)];

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="caption" color="inkMuted">Loading case…</AppText>
      </AppSafeArea>
    );
  }

  if (error || bundles.length === 0) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="body" color="danger">
          {error ?? 'No cases available.'}
        </AppText>
        <AppButton
          label="Back"
          variant="secondary"
          onPress={() => router.back()}
          style={{ marginTop: space[3] }}
        />
      </AppSafeArea>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  // No-op: the practice path is consequence-free. CaseBundleCard manages all
  // selection/submit display state internally; this callback writes nothing.
  const handleSubmit = (_answers: CaseRowAnswer[]) => {};

  const handleContinue = () => {
    setSubmitted(true);
  };

  const handleTryAnother = () => {
    setCaseIndex(i => i + 1);
    setSubmitted(false);
  };

  // ── Banner (shown in all states) ──────────────────────────────────────────

  const banner = (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.primarySoft,
          paddingHorizontal: space[4],
          paddingVertical: space[2],
        },
      ]}>
      <AppText variant="caption" style={{ color: colors.primary, textAlign: 'center' }}>
        Preview — doesn't affect your reviews.
      </AppText>
    </View>
  );

  // ── After Continue: replace card with next-action choices ─────────────────
  //
  // onContinue fires when the user taps Continue after seeing rationale.
  // Show a completion view so the actions are the only thing on screen.

  if (submitted) {
    return (
      <AppSafeArea edges={['top', 'bottom']}>
        {banner}
        <View style={[styles.center, { padding: space[6] }]}>
          <AppText variant="subtitle" style={{ textAlign: 'center', marginBottom: space[2] }}>
            Case complete
          </AppText>
          <AppText variant="body" color="inkMuted" style={{ textAlign: 'center', marginBottom: space[4] }}>
            No impact on your review schedule.
          </AppText>
          <AppButton
            label={bundles.length > 1 ? 'Try another case' : 'Try again'}
            variant="primary"
            onPress={handleTryAnother}
            fullWidth
          />
          <View style={{ marginTop: space[2] }}>
            <AppButton
              label="Back to Practice"
              variant="secondary"
              onPress={() => router.back()}
              fullWidth
            />
          </View>
        </View>
      </AppSafeArea>
    );
  }

  // ── Active case ───────────────────────────────────────────────────────────

  return (
    <AppSafeArea edges={['top', 'bottom']}>
      {banner}
      {/* key resets CaseBundleCard's internal selection + submit state on advance */}
      <View style={styles.fill}>
        <CaseBundleCard
          key={caseIndex}
          caseData={bundle.caseData}
          entries={makeEntries(bundle.rows, new Date())}
          onSubmit={handleSubmit}
          onContinue={handleContinue}
        />
      </View>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  banner: { alignItems: 'center' },
});
