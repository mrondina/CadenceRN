import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useDrillSession } from '@/hooks/useDrillSession';
import type { ContentItem } from '@/domain/types';

const DOSAGE_PACK_ID = 'dosage-pack';
const SESSION_SIZES = [3, 5, 10];

// ─── Numeric keypad (reused from NumericCard logic) ───────────────────────────

const KEYPAD_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '⌫'],
];

function DrillKeypad({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const { colors, space, radius } = useAppTheme();

  function handleKey(key: string) {
    if (key === '⌫') { onChange(value.slice(0, -1)); return; }
    if (key === '.' && value.includes('.')) return;
    if (value.length >= 10) return;
    onChange(value + key);
  }

  return (
    <View style={{ gap: space[1] }}>
      {KEYPAD_ROWS.map((row, ri) => (
        <View key={ri} style={styles.keyRow}>
          {row.map(key => (
            <Pressable
              key={key}
              onPress={() => handleKey(key)}
              accessibilityRole="button"
              accessibilityLabel={key === '⌫' ? 'backspace' : key}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 52,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.border : colors.surfaceAlt,
                borderRadius: radius.sm,
              })}>
              <AppText variant="subtitle">{key}</AppText>
            </Pressable>
          ))}
        </View>
      ))}
      <Pressable
        onPress={onSubmit}
        disabled={!value}
        accessibilityRole="button"
        accessibilityLabel="Submit answer"
        style={({ pressed }) => ({
          marginTop: space[1],
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: value ? colors.primary : colors.border,
          borderRadius: radius.md,
          opacity: pressed ? 0.75 : 1,
        })}>
        <AppText variant="label" style={{ color: value ? colors.surface : colors.inkMuted }}>
          Submit
        </AppText>
      </Pressable>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DrillScreen() {
  const { colors, space, radius, type: { scale, mono } } = useAppTheme();
  const db = useDBContext();
  const [dosageItems, setDosageItems] = useState<ContentItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [answer, setAnswer] = useState('');
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [sessionSize, setSessionSize] = useState(SESSION_SIZES[0]);
  const [pickingSize, setPickingSize] = useState(false);

  const drill = useDrillSession({
    db: db?.db!,
    drillRepo: db?.drillRepo!,
  });

  useEffect(() => {
    if (!db) return;
    db.contentItemRepo.findByPack(DOSAGE_PACK_ID)
      .then(items => {
        setDosageItems(items.filter(i => i.format === 'numeric'));
        setLoadingItems(false);
      })
      .catch(e => {
        setLoadError(e instanceof Error ? e.message : 'Could not load drills');
        setLoadingItems(false);
      });
  }, [db]);

  // Reset answer on each new item
  useEffect(() => {
    setAnswer('');
    setRevealedAt(null);
  }, [drill.currentIndex, drill.phase]);

  function handleStart(size: number) {
    setSessionSize(size);
    setPickingSize(false);
    drill.start(dosageItems, size);
  }

  function handleSubmit() {
    if (!answer || !revealedAt) {
      const now = Date.now();
      setRevealedAt(now);
      drill.submitAnswer(answer, now - (revealedAt ?? now));
    }
  }

  function handleSubmitFinal() {
    const now = Date.now();
    drill.submitAnswer(answer, revealedAt ? now - revealedAt : 0);
  }

  if (!db) return null;

  if (loadingItems) {
    return (
      <AppSafeArea style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </AppSafeArea>
    );
  }

  if (loadError) {
    return (
      <AppSafeArea style={styles.center}>
        <AppText variant="body" color="danger">Could not load drills.</AppText>
        <AppText variant="caption" color="inkMuted">{loadError}</AppText>
      </AppSafeArea>
    );
  }

  // ── Idle / start ────────────────────────────────────────────────────────────

  if (drill.phase === 'idle') {
    return (
      <AppSafeArea>
        <ScrollView contentContainerStyle={[styles.content, { padding: space[4], gap: space[4] }]}>
          <View style={{ gap: space[1] }}>
            <AppText variant="title">Dosage Drills</AppText>
            <AppText variant="caption" color="inkMuted">
              Dimensional analysis · IV rates · Weight-based dosing
            </AppText>
          </View>

          {/* Streak chip */}
          {drill.streak.currentStreak > 0 && (
            <AppCard variant="alt" style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <AppText variant="label">{drill.streak.currentStreak}-day streak</AppText>
              {drill.streak.longestStreak > drill.streak.currentStreak && (
                <AppText variant="caption" color="inkMuted">
                  Best: {drill.streak.longestStreak}
                </AppText>
              )}
            </AppCard>
          )}

          {dosageItems.length === 0 ? (
            <AppCard>
              <AppText variant="body" color="inkMuted">
                No dosage problems available yet.
              </AppText>
            </AppCard>
          ) : (
            <>
              <AppCard style={{ gap: space[2] }}>
                <AppText variant="label">Quick Check</AppText>
                <AppText variant="caption" color="inkMuted">
                  3 calculations — about 2 minutes
                </AppText>
                <AppButton
                  label="Start 3-problem drill"
                  variant="primary"
                  onPress={() => handleStart(3)}
                  fullWidth
                  disabled={dosageItems.length === 0}
                />
              </AppCard>

              {!pickingSize ? (
                <Pressable
                  onPress={() => setPickingSize(true)}
                  accessibilityRole="button">
                  <AppText variant="caption" color="primary" style={{ textAlign: 'center' }}>
                    More problems…
                  </AppText>
                </Pressable>
              ) : (
                <AppCard style={{ gap: space[2] }}>
                  <AppText variant="label">Choose session length</AppText>
                  {SESSION_SIZES.filter(s => s !== 3).map(size => (
                    <AppButton
                      key={size}
                      label={`${size} problems`}
                      variant="secondary"
                      onPress={() => handleStart(size)}
                      fullWidth
                    />
                  ))}
                </AppCard>
              )}
            </>
          )}
        </ScrollView>
      </AppSafeArea>
    );
  }

  // ── Complete ────────────────────────────────────────────────────────────────

  if (drill.phase === 'complete') {
    const correct = drill.results.filter(r => r.correct).length;
    const total = drill.results.length;
    return (
      <AppSafeArea>
        <ScrollView contentContainerStyle={[styles.content, { padding: space[4], gap: space[4] }]}>
          <AppText variant="title">Done</AppText>

          <AppCard style={{ gap: space[2] }}>
            <AppText variant="subtitle">{correct}/{total} correct</AppText>
            {drill.streak.currentStreak > 0 && (
              <AppText variant="caption" color="inkMuted">
                {drill.streak.currentStreak}-day streak
              </AppText>
            )}
          </AppCard>

          {/* Per-item recap */}
          {drill.results.map((r, i) => {
            const body = r.item.body;
            if (body.type !== 'numeric') return null;
            return (
              <AppCard key={r.item.id} variant={r.correct ? 'surface' : 'alt'} style={{ gap: space[2] }}>
                <AppText variant="mono" style={{ fontSize: scale.sm }}>
                  {body.problem}
                </AppText>
                {r.correct ? (
                  <AppText variant="label" style={{ color: colors.success }}>
                    {body.answer} {body.unit}
                  </AppText>
                ) : (
                  <>
                    <AppText variant="caption" color="danger">
                      Your answer: {r.userAnswer || '—'} · Correct: {body.answer} {body.unit}
                      {body.tolerance > 0 ? ` (±${body.tolerance})` : ''}
                    </AppText>
                    {body.workingSteps && body.workingSteps.length > 0 && (
                      <View style={{ gap: 2 }}>
                        {body.workingSteps.map((step, si) => (
                          <AppText key={si} variant="mono" color="inkMuted">{step}</AppText>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </AppCard>
            );
          })}

          <AppButton
            label="New drill"
            variant="primary"
            onPress={drill.reset}
            fullWidth
          />
        </ScrollView>
      </AppSafeArea>
    );
  }

  // ── Active / feedback ───────────────────────────────────────────────────────

  if (!drill.currentItem) return null;
  const body = drill.currentItem.body;
  if (body.type !== 'numeric') return null;

  const isCorrect = drill.phase === 'feedback' &&
    Math.abs(parseFloat(answer) - body.answer) <= body.tolerance;

  return (
    <AppSafeArea>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[3] }]}
        keyboardShouldPersistTaps="handled">

        {/* Progress indicator */}
        <AppText variant="caption" color="inkMuted">
          {drill.currentIndex + 1} of {drill.items.length}
        </AppText>

        {/* Problem */}
        <AppCard>
          <AppText variant="mono">{body.problem}</AppText>
        </AppCard>

        {/* Answer display */}
        <View
          style={{
            borderWidth: 1,
            borderColor: drill.phase === 'feedback'
              ? isCorrect ? colors.success : colors.danger
              : colors.border,
            borderRadius: radius.md,
            padding: space[3],
            minHeight: 48,
            alignItems: 'flex-end',
            justifyContent: 'center',
            backgroundColor: colors.surfaceAlt,
          }}>
          <AppText style={{ fontFamily: mono, fontSize: scale.xl, color: colors.ink }}>
            {answer || '0'}{answer ? ` ${body.unit}` : ''}
          </AppText>
        </View>

        {/* Feedback after submit */}
        {drill.phase === 'feedback' && (
          <AppCard variant="alt" style={{ gap: space[1] }}>
            {isCorrect ? (
              <AppText variant="label" style={{ color: colors.success }}>
                Correct — {body.answer} {body.unit}
              </AppText>
            ) : (
              <>
                <AppText variant="label" style={{ color: colors.danger }}>
                  Answer: {body.answer} {body.unit}
                  {body.tolerance > 0 ? ` (±${body.tolerance})` : ''}
                </AppText>
                {body.workingSteps && body.workingSteps.length > 0 && (
                  <View style={{ marginTop: space[1], gap: 2 }}>
                    {body.workingSteps.map((step, i) => (
                      <AppText key={i} variant="mono" color="inkMuted">{step}</AppText>
                    ))}
                  </View>
                )}
              </>
            )}
          </AppCard>
        )}

        {/* Keypad or Next button */}
        {drill.phase === 'active' ? (
          <DrillKeypad
            value={answer}
            onChange={v => { setAnswer(v); if (!revealedAt) setRevealedAt(Date.now()); }}
            onSubmit={handleSubmitFinal}
          />
        ) : (
          <Pressable
            onPress={drill.next}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              opacity: pressed ? 0.75 : 1,
            })}>
            <AppText variant="label" style={{ color: colors.surface }}>
              {drill.currentIndex + 1 < drill.items.length ? 'Next' : 'Finish'}
            </AppText>
          </Pressable>
        )}
      </ScrollView>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: 8 },
  content: { flexGrow: 1 },
  keyRow: { flexDirection: 'row', gap: 6 },
});
