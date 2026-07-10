import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { PillarChip } from '@/components/session/PillarChip';
import { useAppTheme } from '@/context/ThemeContext';
import type { ContentItem } from '@/domain/types';
import { resolveLinks, getItemStem } from './relatedCardUtils';

interface RelatedCardProps {
  links: string[];
  linkedItems: Map<string, ContentItem>;
}

export function RelatedCard({ links, linkedItems }: RelatedCardProps) {
  const { space } = useAppTheme();
  const resolved = resolveLinks(links, linkedItems);

  if (resolved.length === 0) return null;

  return (
    <AppCard variant="alt">
      <AppText variant="label" color="inkMuted" style={{ marginBottom: space[2] }}>
        Related
      </AppText>
      <View style={{ gap: space[2] }}>
        {resolved.map((item) => (
          <View
            key={item.id}
            style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
            <PillarChip pillar={item.pillar} />
            <AppText variant="caption" color="ink" style={{ flex: 1 }}>
              {getItemStem(item)}
            </AppText>
          </View>
        ))}
      </View>
    </AppCard>
  );
}
