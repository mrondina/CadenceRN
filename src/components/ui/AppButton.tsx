import { Pressable, Text, type PressableProps, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: PressableProps['style'];
  fullWidth?: boolean;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  fullWidth = false,
}: AppButtonProps) {
  const { colors, space, radius, minTouchTarget, type: { scale } } = useAppTheme();

  const bgColor =
    variant === 'primary' ? colors.primary :
    variant === 'secondary' ? colors.primarySoft :
    'transparent';

  const labelColor =
    variant === 'primary' ? colors.surface :
    colors.primary;

  const containerStyle: ViewStyle = {
    backgroundColor: bgColor,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  const labelStyle: TextStyle = {
    color: labelColor,
    fontSize: scale.base,
    fontWeight: '600',
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        containerStyle,
        (pressed || disabled) && { opacity: 0.65 },
        typeof style === 'function' ? style({ pressed }) : style,
      ]}>
      <Text style={labelStyle} allowFontScaling maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}
