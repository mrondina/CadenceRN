import { useState } from 'react';
import { View, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { uuidv7 } from 'uuidv7';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';
import { CohortBuilder, BELLARMINE_SESSION_COURSES, toDateStr } from '@/domain/cohort/CohortBuilder';
import { useWizardStore } from '@/stores/wizardStore';
import type { CourseInstance, SessionInstance } from '@/domain/types';

const TEMPLATE_ID = 'bellarmine-absn-v1';

export default function StartDateScreen() {
  const router = useRouter();
  const { colors, space, radius, type: { scale } } = useAppTheme();
  const setDraft = useWizardStore(s => s.setDraft);

  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);

  function parseDate(): Date | null {
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    if (isNaN(m) || m < 1 || m > 12) return null;
    if (isNaN(d) || d < 1 || d > 31) return null;
    if (isNaN(y) || y < 2024 || y > 2035) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1) return null; // rolled over (e.g. Feb 30)
    return date;
  }

  function handleContinue() {
    const date = parseDate();
    if (!date) {
      setError('Enter a valid date (month 1–12, day 1–31, year 2024–2035).');
      return;
    }
    setError(null);

    const cohortId = uuidv7();
    const builder = new CohortBuilder();
    const now = new Date().toISOString();
    const cohort = builder.build({ id: cohortId, startDate: date, templateId: TEMPLATE_ID });

    const sessionsWithCourses: SessionInstance[] = cohort.sessions.map(session => {
      const courseTemplates = BELLARMINE_SESSION_COURSES[session.sessionIndex] ?? [];
      const courses: CourseInstance[] = courseTemplates.map(ct => ({
        id: uuidv7(),
        sessionId: session.id,
        title: ct.title,
        contentPackIds: ct.contentPackIds,
        examDates: [],
        updatedAt: now,
      }));
      return { ...session, courses };
    });

    setDraft({ ...cohort, sessions: sessionsWithCourses });
    router.push('/setup/confirm-courses');
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
    fontSize: scale.base,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: 44,
  };

  const isComplete = month.length > 0 && day.length > 0 && year.length === 4;

  return (
    <AppSafeArea>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, { padding: space[4], gap: space[3] }]}
          keyboardShouldPersistTaps="handled">

          <AppText variant="title">When did your cohort start?</AppText>
          <AppText variant="body" color="inkMuted">
            Past dates are fine — this is the common case.
            The app will set up your schedule from here.
          </AppText>

          <AppCard style={{ gap: space[3] }}>
            <AppText variant="label">Program start date</AppText>
            <View style={styles.dateRow}>
              <View style={styles.dateFieldSmall}>
                <AppText variant="caption" color="inkMuted">Month</AppText>
                <TextInput
                  style={inputStyle}
                  placeholder="1–12"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={month}
                  onChangeText={setMonth}
                  accessibilityLabel="Month"
                />
              </View>
              <View style={styles.dateFieldSmall}>
                <AppText variant="caption" color="inkMuted">Day</AppText>
                <TextInput
                  style={inputStyle}
                  placeholder="1–31"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={day}
                  onChangeText={setDay}
                  accessibilityLabel="Day"
                />
              </View>
              <View style={styles.dateFieldLarge}>
                <AppText variant="caption" color="inkMuted">Year</AppText>
                <TextInput
                  style={inputStyle}
                  placeholder="2025"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={year}
                  onChangeText={setYear}
                  accessibilityLabel="Year"
                />
              </View>
            </View>

            {error && (
              <AppText variant="caption" color="danger">{error}</AppText>
            )}
          </AppCard>

          <AppButton
            label="Continue"
            onPress={handleContinue}
            fullWidth
            disabled={!isComplete}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateFieldSmall: { flex: 1 },
  dateFieldLarge: { flex: 2 },
});
