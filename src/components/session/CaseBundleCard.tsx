import React, { useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { MatrixRenderer } from '@/components/session/MatrixRenderer';
import { DropdownSentenceRenderer } from '@/components/session/DropdownSentenceRenderer';
import { useAppTheme } from '@/context/ThemeContext';
import type { ContentCase, MatrixPresentationData, DropdownPresentationData, QueueEntry } from '@/domain/types';
import type { CaseRowAnswer } from '@/hooks/useReviewSession';
import { isSubmitEnabled, buildCaseRowAnswers } from '@/components/session/caseBundleUtils';

interface CaseBundleCardProps {
  caseData: ContentCase;
  entries: QueueEntry[];
  /** Called at submit time (fire-and-forget — DB write runs in background). */
  onSubmit: (answers: CaseRowAnswer[]) => void;
  /** Called when the user taps Continue after reviewing rationale. */
  onContinue: () => void;
}

export function CaseBundleCard({ caseData, entries, onSubmit, onContinue }: CaseBundleCardProps) {
  const { colors, space, radius } = useAppTheme();
  const { height: viewportHeight } = useWindowDimensions();

  const [selections, setSelections] = useState<(number | null)[]>(() => entries.map(() => null));
  const [activeExhibit, setActiveExhibit] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [rowAnswers, setRowAnswers] = useState<CaseRowAnswer[]>([]);

  const submitEnabled = isSubmitEnabled(selections) && !submitted;
  const answeredCount = selections.filter(s => s !== null).length;

  const handleSelect = (rowIdx: number, colIdx: number) => {
    if (submitted) return;
    setSelections(prev => {
      const next = [...prev];
      next[rowIdx] = colIdx;
      return next;
    });
  };

  const handleSubmit = () => {
    if (!submitEnabled) return;
    const answers = buildCaseRowAnswers(entries, selections);
    setRowAnswers(answers);
    setSubmitted(true);
    onSubmit(answers);
  };

  const hasExhibits = caseData.exhibits.length > 0;
  // Cap exhibit body at ~40% of viewport so matrix rows stay reachable without scrolling past the pin.
  const exhibitBodyMaxHeight = viewportHeight * 0.4;

  return (
    <View style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ padding: space[4], gap: space[3] }}
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled">

        {/* Child 0 — pinned: scenario + exhibit tabs + exhibit body */}
        <View style={{ gap: space[3] }}>
          <AppCard>
            <AppText
              variant="caption"
              color="inkMuted"
              style={{ marginBottom: space[1] }}>
              Scenario
            </AppText>
            <AppText variant="body">{caseData.scenario}</AppText>
          </AppCard>

          {hasExhibits && (
            <View style={{ gap: space[2] }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space[2] }}>
                {caseData.exhibits.map((exhibit, i) => {
                  const isActive = activeExhibit === i;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => setActiveExhibit(i)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.tab,
                        {
                          borderColor: isActive ? colors.primary : colors.border,
                          backgroundColor: isActive ? colors.primary + '18' : colors.surface,
                          borderRadius: radius.sm,
                          paddingHorizontal: space[3],
                          paddingVertical: space[1],
                        },
                      ]}>
                      <AppText
                        variant="label"
                        style={{ color: isActive ? colors.primary : undefined }}>
                        {exhibit.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Exhibit body: height-capped and internally scrollable */}
              <ScrollView
                style={{ maxHeight: exhibitBodyMaxHeight }}
                nestedScrollEnabled>
                <AppCard variant="alt">
                  <AppText
                    variant="label"
                    style={{ marginBottom: space[1] }}>
                    {caseData.exhibits[activeExhibit].title}
                  </AppText>
                  <AppText variant="body" color="inkMuted">
                    {caseData.exhibits[activeExhibit].body}
                  </AppText>
                </AppCard>
              </ScrollView>
            </View>
          )}
        </View>

        {/* Children 1+ — scroll beneath the pinned header */}

        {/* Prompt */}
        <AppText variant="body">{caseData.prompt}</AppText>

        {/* Matrix or dropdown renderer */}
        {caseData.presentation === 'matrix' ? (
          <MatrixRenderer
            entries={entries}
            columns={(caseData.presentationData as MatrixPresentationData).columns}
            selections={selections}
            onSelect={handleSelect}
            submitted={submitted}
            rowAnswers={submitted ? rowAnswers : []}
          />
        ) : (
          <DropdownSentenceRenderer
            entries={entries}
            template={(caseData.presentationData as DropdownPresentationData).template}
            selections={selections}
            onSelect={handleSelect}
            submitted={submitted}
            rowAnswers={submitted ? rowAnswers : []}
          />
        )}

        {/* Submit row */}
        {!submitted && (
          <View style={{ gap: space[2] }}>
            <AppText variant="caption" color="inkMuted">
              {answeredCount} of {entries.length} answered
            </AppText>
            <Pressable
              disabled={!submitEnabled}
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !submitEnabled }}
              style={[
                styles.submitBtn,
                {
                  backgroundColor: submitEnabled ? colors.primary : colors.border,
                  borderRadius: radius.md,
                  padding: space[3],
                },
              ]}>
              <AppText
                variant="label"
                style={{ color: submitEnabled ? colors.surface : colors.inkMuted, textAlign: 'center' }}>
                Submit
              </AppText>
            </Pressable>
          </View>
        )}

        {/* Continue button after reveal */}
        {submitted && (
          <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            style={[
              styles.submitBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: radius.md,
                padding: space[3],
              },
            ]}>
            <AppText
              variant="label"
              style={{ color: colors.surface, textAlign: 'center' }}>
              Continue
            </AppText>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  tab: {
    borderWidth: 1,
  },
  submitBtn: {
    alignItems: 'center',
  },
});
