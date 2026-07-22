import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';

interface ClozeBody {
  type: 'cloze';
  front: string;
  back: string;
  hint?: string;
}

interface ClozeCardProps {
  body: ClozeBody;
  onReveal: (correct?: boolean) => void;
}

// Replace {{blank}} marker with a styled blank placeholder.
function renderFront(front: string, revealed: boolean, back: string, colors: ReturnType<typeof useAppTheme>['colors']) {
  const parts = front.split('{{blank}}');
  if (parts.length === 1) return <AppText variant="body">{front}</AppText>;

  return (
    <AppText variant="body">
      {parts[0]}
      {revealed
        ? <AppText variant="body" style={{ color: colors.primary, fontWeight: '600' }}>{back}</AppText>
        : <AppText variant="body" style={{ color: colors.inkMuted, textDecorationLine: 'underline' }}>{'_'.repeat(Math.max(back.length, 6))}</AppText>
      }
      {parts[1]}
    </AppText>
  );
}

export function ClozeCard({ body, onReveal }: ClozeCardProps) {
  const { colors, space } = useAppTheme();
  const [revealed, setRevealed] = useState(false);

  const handleReveal = () => {
    setRevealed(true);
    onReveal();
  };

  return (
    <View style={{ gap: space[3] }}>
      <AppCard>
        {renderFront(body.front, revealed, body.back, colors)}
        {body.hint && !revealed && (
          <AppText variant="caption" color="inkMuted" style={{ marginTop: space[2] }}>
            Hint: {body.hint}
          </AppText>
        )}
      </AppCard>

      {!revealed && (
        <Pressable
          onPress={handleReveal}
          accessibilityRole="button"
          accessibilityLabel="Reveal answer"
          style={({ pressed }) => ({
            alignItems: 'center',
            paddingVertical: space[3],
            opacity: pressed ? 0.65 : 1,
          })}>
          <AppText variant="label" color="primary">Reveal answer</AppText>
        </Pressable>
      )}
    </View>
  );
}
