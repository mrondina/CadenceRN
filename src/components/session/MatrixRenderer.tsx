import React from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/context/ThemeContext';
import type { QueueEntry } from '@/domain/types';
import type { CaseRowAnswer } from '@/hooks/useReviewSession';

interface MatrixRendererProps {
  entries: QueueEntry[];
  columns: string[];
  selections: (number | null)[];
  onSelect: (rowIdx: number, colIdx: number) => void;
  submitted: boolean;
  rowAnswers: CaseRowAnswer[];
}

const LABEL_WIDTH = 140;
const COL_WIDTH = 84;

export function MatrixRenderer({
  entries,
  columns,
  selections,
  onSelect,
  submitted,
  rowAnswers,
}: MatrixRendererProps) {
  const { colors, space, radius } = useAppTheme();

  const tableWidth = LABEL_WIDTH + columns.length * COL_WIDTH;

  return (
    <View style={{ gap: space[2] }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: tableWidth }}>
          {/* Column headers */}
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space[2] }]}>
            <View style={{ width: LABEL_WIDTH }} />
            {columns.map((col, ci) => (
              <View key={ci} style={{ width: COL_WIDTH, alignItems: 'center' }}>
                <AppText variant="caption" color="inkMuted" style={{ textAlign: 'center' }}>
                  {col}
                </AppText>
              </View>
            ))}
          </View>

          {/* Data rows */}
          {entries.map((entry, ri) => {
            const body = entry.item.body;
            if (body.type !== 'matrix_row') return null;
            const sel = selections[ri] ?? -1;
            const answer = rowAnswers[ri];

            return (
              <View key={ri} style={{ marginTop: space[2] }}>
                <View style={styles.row}>
                  <View style={{ width: LABEL_WIDTH, paddingRight: space[2] }}>
                    <AppText variant="body">{body.rowLabel}</AppText>
                  </View>

                  {columns.map((_, ci) => {
                    const isSelected = sel === ci;
                    const isCorrect = body.correctColumn === ci;
                    let bgColor: string | undefined;
                    if (submitted && isCorrect) bgColor = colors.success + '22';
                    if (submitted && isSelected && !isCorrect) bgColor = colors.danger + '22';

                    return (
                      <View
                        key={ci}
                        style={{
                          width: COL_WIDTH,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: bgColor,
                          borderRadius: radius.sm,
                          paddingVertical: space[1],
                        }}>
                        <Pressable
                          disabled={submitted}
                          onPress={() => onSelect(ri, ci)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={`${body.rowLabel}: ${columns[ci]}`}
                          style={styles.radioHit}>
                          <View
                            style={[
                              styles.radioOuter,
                              {
                                borderColor: submitted
                                  ? isCorrect
                                    ? colors.success
                                    : isSelected
                                    ? colors.danger
                                    : colors.border
                                  : isSelected
                                  ? colors.primary
                                  : colors.border,
                              },
                            ]}>
                            {isSelected && (
                              <View
                                style={[
                                  styles.radioInner,
                                  {
                                    backgroundColor: submitted
                                      ? isCorrect
                                        ? colors.success
                                        : colors.danger
                                      : colors.primary,
                                  },
                                ]}
                              />
                            )}
                            {/* Show correct indicator when submitted and not already selected-correct */}
                            {submitted && isCorrect && !isSelected && (
                              <View style={[styles.radioInner, { backgroundColor: colors.success }]} />
                            )}
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>

                {/* Per-row rationale after submit */}
                {submitted && answer && (
                  <AppCard
                    variant="alt"
                    style={[
                      { marginTop: space[1] },
                      !answer.correct ? { borderColor: colors.danger } : undefined,
                    ]}>
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
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioHit: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
