import { View } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';

interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const { colors } = useAppTheme();
  const fraction = total > 0 ? Math.min(current / total, 1) : 0;

  return (
    <View
      style={{ height: 2, backgroundColor: colors.border }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current }}>
      <View
        style={{
          height: 2,
          width: `${Math.round(fraction * 100)}%`,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}
