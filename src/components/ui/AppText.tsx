import { Text, type TextProps, type TextStyle } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';
import type { Theme } from '@/design/tokens';

export type TextVariant = 'body' | 'label' | 'title' | 'subtitle' | 'caption' | 'mono';
export type TextColorKey = keyof Theme['colors'];

export interface AppTextProps extends Omit<TextProps, 'style'> {
  variant?: TextVariant;
  color?: TextColorKey;
  style?: TextProps['style'];
}

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const {
    colors,
    type: { scale, mono },
  } = useAppTheme();

  const variantStyle = getVariantStyle(variant, scale, mono);

  return (
    <Text
      style={[{ color: colors[color ?? 'ink'] }, variantStyle, style]}
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      {...rest}
    />
  );
}

function getVariantStyle(
  variant: TextVariant,
  scale: Theme['type']['scale'],
  mono: string,
): TextStyle {
  switch (variant) {
    case 'title':
      return { fontSize: scale.xxl, lineHeight: Math.round(scale.xxl * 1.2), fontWeight: '600' };
    case 'subtitle':
      return { fontSize: scale.xl, lineHeight: Math.round(scale.xl * 1.3), fontWeight: '600' };
    case 'label':
      return { fontSize: scale.sm, lineHeight: Math.round(scale.sm * 1.4), fontWeight: '500' };
    case 'caption':
      return { fontSize: scale.xs, lineHeight: Math.round(scale.xs * 1.4) };
    case 'mono':
      return { fontSize: scale.sm, lineHeight: Math.round(scale.sm * 1.4), fontFamily: mono };
    default: // 'body'
      return { fontSize: scale.base, lineHeight: Math.round(scale.base * 1.5) };
  }
}
