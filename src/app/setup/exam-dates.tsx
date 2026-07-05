import { useState } from 'react';
import { View, TextInput, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { useWizardStore } from '@/stores/wizardStore';
import type { Cohort } from '@/domain/types';

export default function ExamDatesScreen() {
  const router = useRouter();
  const { colors, space, radius, type: { scale } } = useAppTheme();
  const db = useDBContext();
  const { setCohort } = useCohortStore();
  const { draft, clearDraft } = useWizardStore();

  // All hooks before any conditional returns.
  const [saving, setSaving] = useState(false);
  const [examInputs, setExamInputs] = useState<Record<string, string>>(() => {
    if (!draft) return {};
    return Object.fromEntries(
      draft.sessions
        .flatMap(s => s.courses)
        .map(c => [c.id, c.examDates.join(', ')]),
    );
  });

  if (!draft) {
    router.replace('/setup/start-date');
    return null;
  }

  // draft is non-null from here down.
  const allCourses = draft.sessions.flatMap(
    s => s.courses.map(c => ({ ...c, sessionLabel: s.label })),
  );

  function handleExamChange(courseId: string, value: string) {
    setExamInputs(prev => ({ ...prev, [courseId]: value }));
  }

  async function handleFinish() {
    // non-null: checked above; db may still be initialising
    if (!db || saving) return;
    setSaving(true);

    const d: Cohort = draft!;
    const now = new Date().toISOString();
    const sessionsWithExams = d.sessions.map(session => ({
      ...session,
      updatedAt: now,
      courses: session.courses.map(course => {
        const raw = examInputs[course.id] ?? '';
        const examDates = raw
          .split(',')
          .map(s => s.trim())
          .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
        return { ...course, examDates, updatedAt: now };
      }),
    }));

    const finalCohort: Cohort = { ...d, sessions: sessionsWithExams, updatedAt: now };

    try {
      await db.cohortRepo.save(finalCohort);
      setCohort(finalCohort);
      clearDraft();
      router.replace('/(tabs)/');
    } catch {
      setSaving(false);
    }
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
  };

  return (
    <AppSafeArea>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[3] }]}>
        <AppText variant="title">Exam dates</AppText>
        <AppText variant="body" color="inkMuted">
          Optional. Enter exam dates to activate review compression in the 10 days
          before each exam. You can update these later in Settings.
        </AppText>
        <AppText variant="caption" color="inkMuted">
          Format: YYYY-MM-DD. Multiple dates separated by commas.
        </AppText>

        {allCourses.length === 0 && (
          <AppCard>
            <AppText variant="caption" color="inkMuted">No courses configured.</AppText>
          </AppCard>
        )}

        {allCourses.map(course => (
          <AppCard key={course.id} style={{ gap: space[2] }}>
            <AppText variant="label">{course.title}</AppText>
            <AppText variant="caption" color="inkMuted">{course.sessionLabel}</AppText>
            <View>
              <AppText variant="caption" color="inkMuted">Exam date(s)</AppText>
              <TextInput
                style={inputStyle}
                value={examInputs[course.id] ?? ''}
                onChangeText={v => handleExamChange(course.id, v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inkMuted}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel={`${course.title} exam date`}
              />
            </View>
          </AppCard>
        ))}

        <AppButton
          label="Skip exam dates"
          variant="ghost"
          onPress={handleFinish}
          fullWidth
          disabled={saving}
        />
        <AppButton
          label={saving ? 'Saving…' : 'Start studying'}
          variant="primary"
          onPress={handleFinish}
          fullWidth
          disabled={saving}
        />
      </ScrollView>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
});
