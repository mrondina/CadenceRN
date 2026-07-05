import { SafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';
import { useAppTheme } from '@/context/ThemeContext';

export interface AppSafeAreaProps extends SafeAreaViewProps {}

export function AppSafeArea({ style, ...rest }: AppSafeAreaProps) {
  const { colors } = useAppTheme();

  return (
    <SafeAreaView
      style={[{ flex: 1, backgroundColor: colors.surface }, style]}
      {...rest}
    />
  );
}
