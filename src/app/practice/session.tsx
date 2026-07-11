import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { PillarChip } from '@/components/session/PillarChip';
import { ClozeCard } from '@/components/session/ClozeCard';
import { MCQCard } from '@/components/session/MCQCard';
import { FreeRecallCard } from '@/components/session/FreeRecallCard';
import { NumericCard } from '@/components/session/NumericCard';
import { RelatedCard } from '@/components/session/RelatedCard';
import { SessionErrorBoundary } from '@/components/session/SessionErrorBoundary';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { usePracticeSession } from '@/hooks/usePracticeSession';
import { UnsupportedCardFormatError } from '@/domain/types';
import type { ContentItem, Pillar } from '@/domain/types';

// ─── Practice card router ─────────────────────────────────────────────────────
// Receives ContentItem directly (not QueueEntry) — practice has no memory state.

function PracticeCardRouter({ item, onReveal }: { item: ContentItem; onReveal: () => void }) {
  const { body } = item;
  switch (body.type) {
    case 'cloze':
      return <ClozeCard body={body} onReveal={onReveal} />;
    case 'mcq':
      return <MCQCard body={body} onReveal={onReveal} itemId={item.id} />;
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

// ─── Practice session screen ──────────────────────────────────────────────────

export default function PracticeSessionScreen() {
  const router = useRouter();
  const { colors, space } = useAppTheme();
  const db = useDBContext();

  const params = useLocalSearchParams<{ packId: string; week: string; pillar: string }>();
  const packId = params.packId ?? '';
  const week = params.week ? Number(params.week) : undefined;
  const pillar = params.pillar ? (params.pillar as Pillar) : undefined;

  const session = usePracticeSession(db!.contentItemRepo);
  const { items, currentIndex, currentItem, isComplete, loading, error, next, load } = session;

  const [revealed, setRevealed] = useState(false);

  // Reset revealed flag on every card advance.
  useEffect(() => {
    setRevealed(false);
  }, [currentIndex]);

  // Load items on mount.
  useEffect(() => {
    if (!db || !packId) return;
    load({ packId, week, pillar });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNext = () => {
    next();
  };

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="caption" color="inkMuted">Loading practice…</AppText>
      </AppSafeArea>
    );
  }

  if (error) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="body" color="danger">Could not load practice items.</AppText>
        <Pressable onPress={() => router.back()} style={{ marginTop: space[3] }}>
          <AppText variant="label" color="primary">Go back</AppText>
        </Pressable>
      </AppSafeArea>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="subtitle" style={{ textAlign: 'center' }}>No items found</AppText>
        <AppText variant="body" color="inkMuted" style={{ textAlign: 'center', marginTop: space[2] }}>
          Try a different scope.
        </AppText>
        <Pressable onPress={() => router.back()} style={{ marginTop: space[4] }}>
          <AppText variant="label" color="primary">Go back</AppText>
        </Pressable>
      </AppSafeArea>
    );
  }

  // ── Complete ──────────────────────────────────────────────────────────────

  if (isComplete) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="subtitle" style={{ textAlign: 'center' }}>Done</AppText>
        <AppText variant="body" color="inkMuted" style={{ textAlign: 'center', marginTop: space[2] }}>
          {items.length} {items.length === 1 ? 'item' : 'items'} practised.
        </AppText>
        <AppText variant="caption" color="inkMuted" style={{ textAlign: 'center', marginTop: space[1] }}>
          Nothing was scheduled or recorded.
        </AppText>
        <View style={{ marginTop: space[4], gap: space[3], width: '100%' }}>
          <AppButton
            label="Practice again"
            variant="secondary"
            onPress={() => router.back()}
            fullWidth
          />
          <AppButton
            label="Done"
            variant="ghost"
            onPress={() => router.dismissAll()}
            fullWidth
          />
        </View>
      </AppSafeArea>
    );
  }

  if (!currentItem) return null;

  return (
    <AppSafeArea edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[3] }]}
        keyboardShouldPersistTaps="handled">

        {/* Practice banner — visually distinct from the scheduled review header */}
        <View style={[styles.banner, { backgroundColor: colors.primarySoft, borderRadius: 8, padding: space[2] }]}>
          <AppText variant="caption" style={{ color: colors.primary }}>
            Practice · {currentIndex + 1} of {items.length}
          </AppText>
        </View>

        {/* Pillar chip */}
        <PillarChip pillar={currentItem.pillar} />

        {/* Card behind error boundary — boundary key resets on each new card */}
        <SessionErrorBoundary
          key={currentItem.id}
          onSkip={handleNext}>
          <PracticeCardRouter item={currentItem} onReveal={() => setRevealed(true)} />
        </SessionErrorBoundary>

        {/* Related concepts — shown on reveal when item has graph links */}
        {revealed && currentItem.graphLinks.length > 0 && (
          <RelatedCard
            links={currentItem.graphLinks}
            linkedItems={new Map([[currentItem.id, currentItem]])}
          />
        )}

        {/* Next button — appears after reveal; no rating */}
        {revealed && (
          <AppCard variant="alt">
            <AppButton
              label={currentIndex + 1 < items.length ? 'Next' : 'Finish'}
              variant="primary"
              onPress={handleNext}
              fullWidth
            />
          </AppCard>
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
  content: { flexGrow: 1 },
  banner: {
    alignItems: 'center',
  },
});
