import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/context/ThemeContext';
import type { Pillar } from '@/domain/types';

const PILLAR_LABELS: Record<Pillar, string> = {
  pharm:       'Pharm',
  procedures:  'Procedures',
  terminology: 'Terminology',
  concepts:    'Concepts',
  dosage:      'Dosage',
};

interface PillarChipProps {
  pillar: Pillar;
}

export function PillarChip({ pillar }: PillarChipProps) {
  const { colors, space, radius } = useAppTheme();
  const accentColor = colors[pillar];

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: accentColor,
        borderRadius: radius.pill,
        paddingHorizontal: space[2],
        paddingVertical: 2,
      }}>
      <AppText variant="caption" style={{ color: accentColor }}>
        {PILLAR_LABELS[pillar]}
      </AppText>
    </View>
  );
}
