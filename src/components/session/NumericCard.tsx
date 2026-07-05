import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';

interface NumericBody {
  type: 'numeric';
  problem: string;
  answer: number;
  unit: string;
  tolerance: number;
  workingSteps?: string[];
}

interface NumericCardProps {
  body: NumericBody;
  onReveal: () => void;
}

const KEYPAD_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '⌫'],
];

export function NumericCard({ body, onReveal }: NumericCardProps) {
  const { colors, space, radius, type: { scale } } = useAppTheme();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = submitted && Math.abs(parseFloat(input) - body.answer) <= body.tolerance;

  const handleKey = (key: string) => {
    if (submitted) return;
    if (key === '⌫') {
      setInput(prev => prev.slice(0, -1));
    } else if (key === '.' && input.includes('.')) {
      // Only one decimal point
    } else if (input.length < 10) {
      setInput(prev => prev + key);
    }
  };

  const handleSubmit = () => {
    if (!input || submitted) return;
    setSubmitted(true);
    onReveal();
  };

  return (
    <View style={{ gap: space[3] }}>
      <AppCard>
        <AppText variant="mono">{body.problem}</AppText>
      </AppCard>

      {/* Input display */}
      <View
        style={{
          borderWidth: 1,
          borderColor: submitted
            ? isCorrect ? colors.success : colors.danger
            : colors.border,
          borderRadius: radius.md,
          padding: space[3],
          minHeight: 48,
          alignItems: 'flex-end',
          justifyContent: 'center',
          backgroundColor: colors.surfaceAlt,
        }}>
        <AppText variant="mono" style={{ fontSize: scale.xl }}>
          {input || '0'}{input ? ` ${body.unit}` : ''}
        </AppText>
      </View>

      {/* Result feedback */}
      {submitted && (
        <AppCard variant="alt">
          {isCorrect ? (
            <AppText variant="label" style={{ color: colors.success }}>
              Correct — {body.answer} {body.unit}
            </AppText>
          ) : (
            <>
              <AppText variant="label" style={{ color: colors.danger }}>
                Answer: {body.answer} {body.unit}
                {body.tolerance > 0 ? ` (±${body.tolerance})` : ''}
              </AppText>
              {body.workingSteps && body.workingSteps.length > 0 && (
                <View style={{ marginTop: space[2], gap: space[1] }}>
                  {body.workingSteps.map((step, i) => (
                    <AppText key={i} variant="mono" color="inkMuted">
                      {step}
                    </AppText>
                  ))}
                </View>
              )}
            </>
          )}
        </AppCard>
      )}

      {/* Numeric keypad — hidden after submit */}
      {!submitted && (
        <View style={{ gap: space[1] }}>
          {KEYPAD_ROWS.map((row, ri) => (
            <View key={ri} style={styles.keyRow}>
              {row.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => handleKey(key)}
                  accessibilityRole="button"
                  accessibilityLabel={key === '⌫' ? 'backspace' : key}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.border : colors.surfaceAlt,
                    borderRadius: radius.sm,
                  })}>
                  <AppText variant="subtitle">{key}</AppText>
                </Pressable>
              ))}
            </View>
          ))}

          <Pressable
            onPress={handleSubmit}
            disabled={!input}
            accessibilityRole="button"
            accessibilityLabel="Submit answer"
            style={({ pressed }) => ({
              marginTop: space[1],
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: input ? colors.primary : colors.border,
              borderRadius: radius.md,
              opacity: pressed ? 0.75 : 1,
            })}>
            <AppText variant="label" style={{ color: input ? colors.surface : colors.inkMuted }}>
              Submit
            </AppText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  keyRow: {
    flexDirection: 'row',
    gap: 6,
  },
});
