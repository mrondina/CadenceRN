import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/context/ThemeContext';
import type { QueueEntry } from '@/domain/types';
import type { CaseRowAnswer } from '@/hooks/useReviewSession';
import { parseCaseTemplate } from '@/components/session/caseBundleUtils';

interface DropdownSentenceRendererProps {
  entries: QueueEntry[];
  template: string;
  selections: (number | null)[];
  onSelect: (entryIdx: number, optionIdx: number) => void;
  submitted: boolean;
  rowAnswers: CaseRowAnswer[];
}

export function DropdownSentenceRenderer({
  entries,
  template,
  selections,
  onSelect,
  submitted,
  rowAnswers,
}: DropdownSentenceRendererProps) {
  const { colors, space, radius } = useAppTheme();
  const [activeEntryIdx, setActiveEntryIdx] = useState<number | null>(null);

  // Map blankIndex → { entryIdx, entry } for template rendering.
  const entryByBlankIndex = new Map<number, { entryIdx: number; entry: QueueEntry }>();
  entries.forEach((entry, i) => {
    if (entry.item.body.type === 'dropdown_blank') {
      entryByBlankIndex.set(entry.item.body.blankIndex, { entryIdx: i, entry });
    }
  });

  const segments = parseCaseTemplate(template);

  const handleBlankPress = (entryIdx: number) => {
    if (submitted) return;
    setActiveEntryIdx(prev => (prev === entryIdx ? null : entryIdx));
  };

  const handleOptionSelect = (entryIdx: number, optionIdx: number) => {
    onSelect(entryIdx, optionIdx);
    setActiveEntryIdx(null);
  };

  return (
    <View style={{ gap: space[3] }}>
      {/* Sentence with inline blank buttons */}
      <View style={styles.sentence}>
        {segments.map((seg, si) => {
          if (seg.kind === 'text') {
            return (
              <AppText key={si} variant="body" style={styles.inlineText}>
                {seg.value}
              </AppText>
            );
          }

          const mapped = entryByBlankIndex.get(seg.index);
          if (!mapped) return null;
          const { entryIdx, entry } = mapped;
          const body = entry.item.body;
          if (body.type !== 'dropdown_blank') return null;

          const sel = selections[entryIdx];
          const answer = rowAnswers[entryIdx];
          const selectedText = sel !== null ? body.options[sel] : null;
          const isActive = activeEntryIdx === entryIdx;

          let borderColor = colors.primary;
          let textColor: string = colors.primary;
          if (submitted && answer) {
            borderColor = answer.correct ? colors.success : colors.danger;
            textColor = answer.correct ? colors.success : colors.danger;
          }

          return (
            <Pressable
              key={si}
              disabled={submitted}
              onPress={() => handleBlankPress(entryIdx)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isActive }}
              accessibilityLabel={`Blank ${seg.index}: ${selectedText ?? 'Select an answer'}`}
              style={[
                styles.blankButton,
                {
                  borderColor,
                  backgroundColor: isActive ? colors.surfaceAlt : colors.surface,
                  borderRadius: radius.sm,
                },
              ]}>
              <AppText
                variant="label"
                style={{ color: textColor }}>
                {selectedText ?? 'Select…'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Inline options panel — appears below the sentence when a blank is active */}
      {activeEntryIdx !== null && !submitted && (() => {
        const activeEntry = entries[activeEntryIdx];
        const body = activeEntry?.item.body;
        if (!body || body.type !== 'dropdown_blank') return null;

        return (
          <AppCard variant="alt">
            {body.options.map((opt, oi) => {
              const isSelected = selections[activeEntryIdx] === oi;
              return (
                <Pressable
                  key={oi}
                  onPress={() => handleOptionSelect(activeEntryIdx, oi)}
                  accessibilityRole="menuitem"
                  style={[
                    styles.optionRow,
                    {
                      backgroundColor: isSelected ? colors.primary + '22' : undefined,
                      borderRadius: radius.sm,
                      padding: space[2],
                    },
                  ]}>
                  <AppText
                    variant="body"
                    style={{ color: isSelected ? colors.primary : undefined }}>
                    {opt}
                  </AppText>
                </Pressable>
              );
            })}
          </AppCard>
        );
      })()}

      {/* Per-blank rationale after submit */}
      {submitted && entries.map((entry, ri) => {
        const body = entry.item.body;
        if (body.type !== 'dropdown_blank') return null;
        const answer = rowAnswers[ri];
        if (!answer) return null;

        return (
          <AppCard
            key={ri}
            variant="alt"
            style={!answer.correct ? { borderColor: colors.danger } : undefined}>
            {!answer.correct && (
              <AppText
                variant="label"
                style={{ color: colors.danger, marginBottom: space[1] }}>
                Here's why:
              </AppText>
            )}
            <AppText variant="caption" color="inkMuted">
              {body.rationale}
            </AppText>
          </AppCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  inlineText: {
    flexShrink: 1,
  },
  blankButton: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 80,
    alignItems: 'center',
  },
  optionRow: {
    marginVertical: 2,
  },
});
