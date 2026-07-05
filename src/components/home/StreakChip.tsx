import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/context/ThemeContext';

interface StreakChipProps {
  streak: number | null;
}

// Quiet streak chip — no celebration, no confetti. Shows consecutive study days.
// streak=null means not yet calculated (wired in step 20).
export function StreakChip({ streak }: StreakChipProps) {
  const { colors, space, radius } = useAppTheme();

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.border,
          borderRadius: radius.pill,
          paddingHorizontal: space[3],
          paddingVertical: space[1],
        },
      ]}>
      <AppText variant="caption" color="inkMuted">
        {streak === null ? 'Streak: —' : streak === 1 ? '1 day' : `${streak} days`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
