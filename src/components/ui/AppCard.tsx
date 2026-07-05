import { View, type ViewProps } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';

export type CardVariant = 'surface' | 'alt';

export interface AppCardProps extends ViewProps {
  variant?: CardVariant;
}

export function AppCard({ variant = 'surface', style, children, ...rest }: AppCardProps) {
  const { colors, radius, space } = useAppTheme();

  return (
    <View
      style={[
        {
          backgroundColor: variant === 'surface' ? colors.surface : colors.surfaceAlt,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          padding: space[4],
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
