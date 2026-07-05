import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';

interface FreeRecallBody {
  type: 'free_recall';
  prompt: string;
  rubric: string[];
  modelAnswer: string;
}

interface FreeRecallCardProps {
  body: FreeRecallBody;
  onReveal: () => void;
}

export function FreeRecallCard({ body, onReveal }: FreeRecallCardProps) {
  const { colors, space } = useAppTheme();
  const [revealed, setRevealed] = useState(false);

  const handleReveal = () => {
    setRevealed(true);
    onReveal();
  };

  return (
    <View style={{ gap: space[3] }}>
      <AppCard>
        <AppText variant="body">{body.prompt}</AppText>
      </AppCard>

      {!revealed ? (
        <Pressable
          onPress={handleReveal}
          accessibilityRole="button"
          accessibilityLabel="Reveal answer and rubric"
          style={({ pressed }) => ({
            alignItems: 'center',
            paddingVertical: space[3],
            opacity: pressed ? 0.65 : 1,
          })}>
          <AppText variant="label" color="primary">Reveal answer</AppText>
          <AppText variant="caption" color="inkMuted">Think it through, then reveal — no typing needed</AppText>
        </Pressable>
      ) : (
        <>
          <AppCard variant="alt">
            <AppText variant="label" color="inkMuted" style={{ marginBottom: space[2] }}>
              Model answer
            </AppText>
            <AppText variant="body">{body.modelAnswer}</AppText>
          </AppCard>

          {body.rubric.length > 0 && (
            <AppCard variant="alt">
              <AppText variant="label" color="inkMuted" style={{ marginBottom: space[2] }}>
                Rubric — did you cover these?
              </AppText>
              {body.rubric.map((criterion, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: space[2], marginTop: i > 0 ? space[1] : 0 }}>
                  <AppText variant="caption" color="inkMuted">·</AppText>
                  <AppText variant="caption" color="ink" style={{ flex: 1 }}>{criterion}</AppText>
                </View>
              ))}
            </AppCard>
          )}

          <AppText variant="caption" color="inkMuted" style={{ textAlign: 'center' }}>
            Rate how well you recalled it — be honest with yourself.
          </AppText>
        </>
      )}
    </View>
  );
}
