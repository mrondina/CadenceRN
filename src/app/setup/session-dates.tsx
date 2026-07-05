import { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';
import { CohortBuilder } from '@/domain/cohort/CohortBuilder';
import { useWizardStore } from '@/stores/wizardStore';
import type { Cohort } from '@/domain/types';

export default function SessionDatesScreen() {
  const router = useRouter();
  const { colors, space, radius, type: { scale } } = useAppTheme();
  const { draft, setDraft } = useWizardStore();

  // All hooks must be called before any conditional returns.
  const [starts, setStarts] = useState<string[]>(
    () => draft?.sessions.map(s => s.startDate) ?? [],
  );
  const [ends, setEnds] = useState<string[]>(
    () => draft?.sessions.map(s => s.endDate) ?? [],
  );

  useEffect(() => {
    if (!draft) router.replace('/setup/start-date');
  }, [draft, router]);

  if (!draft) return null;

  const builder = new CohortBuilder();

  function handleStartChange(index: number, value: string) {
    setStarts(prev => { const next = [...prev]; next[index] = value; return next; });
  }

  function handleEndChange(index: number, value: string) {
    setEnds(prev => { const next = [...prev]; next[index] = value; return next; });
  }

  function handleContinue() {
    // non-null: checked above
    let updated: Cohort = draft!;
    for (let i = 0; i < draft!.sessions.length; i++) {
      const session = draft!.sessions[i];
      const sStr = starts[i];
      const eStr = ends[i];
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(sStr) && /^\d{4}-\d{2}-\d{2}$/.test(eStr);
      if (valid && (sStr !== session.startDate || eStr !== session.endDate)) {
        updated = builder.applySessionDateEdit(
          updated,
          session.sessionIndex,
          new Date(sStr + 'T00:00:00.000Z'),
          new Date(eStr + 'T00:00:00.000Z'),
        );
      }
    }
    setDraft(updated);
    router.push('/setup/exam-dates');
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
    fontSize: scale.sm,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    minHeight: 44,
    flex: 1,
  };

  return (
    <AppSafeArea>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[3] }]}>
        <AppText variant="title">Confirm your schedule</AppText>
        <AppText variant="body" color="inkMuted">
          These dates are generated from your start date. Adjust any session if your
          program schedule differs.
        </AppText>
        <AppText variant="caption" color="inkMuted">
          Format: YYYY-MM-DD
        </AppText>

        {draft.sessions.map((session, i) => (
          <AppCard key={session.id} style={{ gap: space[2] }}>
            <AppText variant="label">{session.label}</AppText>

            {session.courses.length > 0 && (
              <View style={{ gap: 2 }}>
                {session.courses.map(c => (
                  <AppText key={c.id} variant="caption" color="inkMuted">
                    {c.title}
                  </AppText>
                ))}
              </View>
            )}

            <View style={styles.dateRow}>
              <View style={styles.flex}>
                <AppText variant="caption" color="inkMuted">Start</AppText>
                <TextInput
                  style={inputStyle}
                  value={starts[i]}
                  onChangeText={v => handleStartChange(i, v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  accessibilityLabel={`${session.label} start date`}
                />
              </View>
              <View style={styles.flex}>
                <AppText variant="caption" color="inkMuted">End</AppText>
                <TextInput
                  style={inputStyle}
                  value={ends[i]}
                  onChangeText={v => handleEndChange(i, v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  accessibilityLabel={`${session.label} end date`}
                />
              </View>
            </View>
          </AppCard>
        ))}

        <AppButton label="Continue to exam dates" onPress={handleContinue} fullWidth />
      </ScrollView>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  dateRow: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
