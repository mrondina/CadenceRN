import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/context/ThemeContext';
import type { ActiveExam } from '@/domain/types';

interface ExamBannerProps {
  activeExam: ActiveExam;
}

// Amendment (f): copy must not promise visible extra cards — "reviews tuned for your exam"
// not "extra reviews added." Well-retained items correctly produce zero exam candidates.
export function ExamBanner({ activeExam }: ExamBannerProps) {
  const { colors, space, radius } = useAppTheme();

  const daysText =
    activeExam.daysRemaining === 0 ? 'today' :
    activeExam.daysRemaining === 1 ? 'tomorrow' :
    `in ${activeExam.daysRemaining} days`;

  // Amendment (g): "in X days" uses the daysRemaining computed from FSRS state at queue-build
  // time, which already accounts for the 4am study-day boundary. No new Date() here.

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.primarySoft,
          borderColor: colors.primary,
          borderRadius: radius.md,
          padding: space[3],
        },
      ]}>
      <AppText variant="label" color="primary">
        Exam tune-up active
      </AppText>
      <AppText variant="caption" color="inkMuted">
        {activeExam.courseTitle} — exam {daysText}. Reviews tuned for your exam.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    gap: 4,
  },
});
