import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';

interface MCQBody {
  type: 'mcq';
  stem: string;
  choices: { id: string; text: string }[];
  correctId: string;
  explanation: string;
}

interface MCQCardProps {
  body: MCQBody;
  onReveal: () => void;
}

export function MCQCard({ body, onReveal }: MCQCardProps) {
  const { colors, space, radius } = useAppTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isMiss = selectedId !== null && selectedId !== body.correctId;

  const handleChoice = (id: string) => {
    if (selectedId) return; // locked after first selection
    setSelectedId(id);
    onReveal();
  };

  return (
    <View style={{ gap: space[3] }}>
      <AppCard>
        <AppText variant="body">{body.stem}</AppText>
      </AppCard>

      <View style={{ gap: space[2] }}>
        {body.choices.map((choice) => {
          const isSelected = selectedId === choice.id;
          const isCorrect = choice.id === body.correctId;
          const isAnswered = selectedId !== null;

          let borderColor = colors.border;
          let bgColor = colors.surface;

          if (isAnswered) {
            if (isCorrect) {
              borderColor = colors.success;
              bgColor = colors.surfaceAlt;
            } else if (isSelected) {
              borderColor = colors.danger;
              bgColor = colors.surfaceAlt;
            }
          } else if (isSelected) {
            borderColor = colors.primary;
          }

          return (
            // Border lives on the outer View so it never bleeds into child Text
            // elements — a known iOS artifact when borderWidth sits on Pressable.
            <View
              key={choice.id}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: radius.md,
                overflow: 'hidden',
              }}>
              <Pressable
                onPress={() => handleChoice(choice.id)}
                disabled={isAnswered}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: isAnswered }}
                style={({ pressed }) => ({
                  padding: space[3],
                  backgroundColor: bgColor,
                  opacity: pressed && !isAnswered ? 0.75 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[2],
                })}>
              <AppText variant="body">{choice.text}</AppText>
              {isAnswered && isCorrect && (
                <AppText variant="caption" style={{ color: colors.success, marginLeft: 'auto' }}>
                  ✓
                </AppText>
              )}
              {isAnswered && isSelected && !isCorrect && (
                <AppText variant="caption" style={{ color: colors.danger, marginLeft: 'auto' }}>
                  ✗
                </AppText>
              )}
            </Pressable>
            </View>
          );
        })}
      </View>

      {selectedId && (
        <AppCard variant="alt" style={isMiss ? { borderColor: colors.danger } : undefined}>
          {isMiss && (
            <AppText variant="label" style={{ color: colors.danger, marginBottom: space[1] }}>
              Here's why:
            </AppText>
          )}
          <AppText variant="caption" color="inkMuted">{body.explanation}</AppText>
        </AppCard>
      )}
    </View>
  );
}
