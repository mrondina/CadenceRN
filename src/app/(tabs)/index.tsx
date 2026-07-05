import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { ForecastStrip } from '@/components/home/ForecastStrip';
import { ExamBanner } from '@/components/home/ExamBanner';
import { AddExamDateAffordance } from '@/components/home/AddExamDateAffordance';
import { StreakChip } from '@/components/home/StreakChip';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import type { DBContextValue } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { useForecast } from '@/hooks/useForecast';
import { useExamMode } from '@/hooks/useExamMode';
import { DebtForecaster } from '@/domain/scheduler/DebtForecaster';
import { ExamModeCompressor } from '@/domain/scheduler/ExamModeCompressor';
import { SchedulerService } from '@/domain/scheduler/SchedulerService';
import { getCurrentSession } from '@/domain/cohort/CohortBuilder';
import type { Cohort } from '@/domain/types';

// ── Assumption: 15 seconds average review latency per card (self-rated recall).
const SECONDS_PER_CARD = 15;

// Domain services — stateless, created once at module scope.
const scheduler = new SchedulerService();
const forecaster = new DebtForecaster();
const examCompressor = new ExamModeCompressor(scheduler);

// ── Root shell ────────────────────────────────────────────────────────────────
// Handles first-run cohort check before rendering content.

export default function HomeScreen() {
  const router = useRouter();
  const db = useDBContext();
  const { colors } = useAppTheme();
  const { cohort, setCohort } = useCohortStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!db) return;
    db.cohortRepo.findFirst().then((found) => {
      if (found) {
        setCohort(found);
      } else {
        router.replace('/setup/start-date');
      }
      setChecking(false);
    });
  }, [db]);

  if (checking || !db || !cohort) {
    return (
      <AppSafeArea style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </AppSafeArea>
    );
  }

  return <HomeContent cohort={cohort} db={db} />;
}

// ── Content component ─────────────────────────────────────────────────────────
// Only rendered once cohort + db are guaranteed non-null.
// Hooks are called unconditionally here.

function HomeContent({ cohort, db }: { cohort: Cohort; db: DBContextValue }) {
  const router = useRouter();
  const { space } = useAppTheme();
  const { setCohort } = useCohortStore();

  const { forecast, loading: forecastLoading } = useForecast({
    cohort,
    memStateRepo: db.memStateRepo,
    contentItemRepo: db.contentItemRepo,
    forecaster,
    examCompressor,
  });

  const { activeExam, refresh: refreshExamMode } = useExamMode({ cohort, examCompressor });

  const currentSessionCourses = useMemo(
    () => getCurrentSession(cohort, new Date()).session.courses,
    [cohort],
  );
  const hasAnyExamDate = currentSessionCourses.some(c => c.examDates.length > 0);

  async function handleExamDateAdded(courseId: string, dateStr: string) {
    const now = new Date().toISOString();
    const updatedCohort: Cohort = {
      ...cohort,
      updatedAt: now,
      sessions: cohort.sessions.map(s => ({
        ...s,
        courses: s.courses.map(c =>
          c.id === courseId
            ? { ...c, examDates: [...c.examDates, dateStr], updatedAt: now }
            : c,
        ),
      })),
    };
    await db.cohortRepo.save(updatedCohort);
    setCohort(updatedCohort);
    refreshExamMode();
  }

  // Queue summary from day-0 bucket.
  const todayDue = forecast[0]?.dueCount ?? 0;
  const estMinutes = Math.ceil((todayDue * SECONDS_PER_CARD) / 60);

  // Amendment (e): suppress warning colour while the pool is early-learning-dominated.
  // Threshold: future-day total < 50% of day-0 count → most items are Learning state
  // (due within hours after first rating), not genuine accumulated debt. A first-week
  // student must not open the app to red bars.
  const futureTotal = forecast.slice(1).reduce((s, d) => s + d.dueCount, 0);
  const isEarlyLearningDominated =
    forecast.length >= 7 &&
    todayDue > 0 &&
    futureTotal < todayDue * 0.5;

  return (
    <AppSafeArea>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[4] }]}>

        {/* Header row: title + quiet streak chip */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <AppText variant="title">CadenceRN</AppText>
            <AppText variant="caption" color="inkMuted">
              {cohort.sessions[0]?.label ?? 'ABSN Study Companion'}
            </AppText>
          </View>
          <StreakChip streak={null} />
        </View>

        {/* Exam banner slot: active exam → tune-up banner; no exam dates set → quiet
            add-date affordance. Amendment (f) copy applies to the banner state. */}
        {activeExam ? (
          <ExamBanner activeExam={activeExam} />
        ) : !hasAnyExamDate ? (
          <AddExamDateAffordance
            courses={currentSessionCourses}
            onSave={handleExamDateAdded}
          />
        ) : null}

        {/* Queue summary */}
        <AppCard style={{ gap: space[2] }}>
          {forecastLoading ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              <AppText variant="subtitle">
                {todayDue > 0
                  ? `${todayDue} review${todayDue === 1 ? '' : 's'} · ~${estMinutes} min`
                  : 'All caught up'}
              </AppText>
              {/* Amendment (g): no "today/tomorrow" string — "ready when you are" is
                  boundary-agnostic and true at 1am. */}
              <AppText variant="caption" color="inkMuted">
                {todayDue > 0 ? 'Ready when you are.' : 'Nothing due right now.'}
              </AppText>
            </>
          )}
        </AppCard>

        {/* Primary action */}
        <AppButton
          label={todayDue > 0 ? 'Start review' : 'Browse content'}
          variant="primary"
          onPress={() => router.push('/session')}
          fullWidth
          disabled={forecastLoading || todayDue === 0}
        />

        {/* 7-day forecast strip */}
        {forecast.length > 0 && (
          <AppCard variant="alt" style={{ gap: space[3] }}>
            <AppText variant="label">Coming up</AppText>
            <ForecastStrip forecast={forecast} suppressWarning={isEarlyLearningDominated} />
          </AppCard>
        )}

        {/* Settings shortcut */}
        <AppButton
          label="Settings"
          variant="ghost"
          onPress={() => router.push('/settings')}
        />
      </ScrollView>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { flexGrow: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { gap: 2 },
});
