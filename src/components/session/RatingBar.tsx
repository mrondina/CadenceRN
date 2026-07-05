import { View, Pressable, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/context/ThemeContext';
import type { Rating } from '@/domain/types';

export type IntervalPreview = Record<Rating, number>;

interface RatingBarProps {
  intervals: IntervalPreview;
  onRate: (rating: Rating) => void;
}

const RATING_LABELS: Record<Rating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

// Subtle semantic color for each rating label — button bg stays neutral.
function useLabelColor(rating: Rating, colors: ReturnType<typeof useAppTheme>['colors']): string {
  switch (rating) {
    case 1: return colors.danger;
    case 2: return colors.warning;
    case 3: return colors.success;
    case 4: return colors.info;
  }
}

// Format scheduledDays to a compact, human-readable interval.
// 0 = "<1d"; 1–6 = "Xd"; 7–27 = "~Xw"; 28+ = "~Xm"
function fmtInterval(days: number): string {
  if (days <= 0) return '<1d';
  if (days < 7) return `${days}d`;
  if (days < 28) return `~${Math.round(days / 7)}w`;
  return `~${Math.round(days / 30)}mo`;
}

const RATINGS: Rating[] = [1, 2, 3, 4];

export function RatingBar({ intervals, onRate }: RatingBarProps) {
  const { colors, space, radius } = useAppTheme();

  return (
    <View style={styles.container}>
      {RATINGS.map((rating) => {
        const labelColor = useLabelColor(rating, colors);
        return (
          <Pressable
            key={rating}
            onPress={() => onRate(rating)}
            accessibilityRole="button"
            accessibilityLabel={`${RATING_LABELS[rating]}, next review ${fmtInterval(intervals[rating])}`}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              paddingVertical: space[3],
              paddingHorizontal: space[1],
              backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 4,
              opacity: pressed ? 0.75 : 1,
            })}>
            <AppText variant="label" style={{ color: labelColor }}>
              {RATING_LABELS[rating]}
            </AppText>
            <AppText variant="caption" color="inkMuted">
              {fmtInterval(intervals[rating])}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
  },
});
