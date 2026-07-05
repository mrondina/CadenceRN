import { View, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/context/ThemeContext';
import { useSessionStore } from '@/stores/sessionStore';

// ─── Summary screen ───────────────────────────────────────────────────────────
//
// One screen, one dismiss. Stats: items reviewed, accuracy, time.
// Amendment (g): no "today/tomorrow" strings — all phrases are boundary-agnostic.

export default function SummaryScreen() {
  const router = useRouter();
  const { colors, space } = useAppTheme();
  const sessionStore = useSessionStore();

  const { total, correct, durationMs } = useLocalSearchParams<{
    total: string;
    correct: string;
    durationMs: string;
  }>();

  const totalN = Number(total ?? '0');
  const correctN = Number(correct ?? '0');
  const duration = Number(durationMs ?? '0');

  const accuracy = totalN > 0 ? Math.round((correctN / totalN) * 100) : 0;
  const minutes = Math.floor(duration / 60_000);
  const seconds = Math.floor((duration % 60_000) / 1000);

  const timeLabel =
    minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;

  const accuracyColor =
    accuracy >= 80 ? colors.success :
    accuracy >= 60 ? colors.warning :
    colors.danger;

  const handleDismiss = () => {
    sessionStore.reset();
    router.dismissAll();
  };

  return (
    <AppSafeArea>
      <View style={[styles.container, { padding: space[5], gap: space[4] }]}>

        <View style={{ gap: space[1] }}>
          <AppText variant="title">Session complete</AppText>
          <AppText variant="body" color="inkMuted">
            {totalN > 0
              ? `You reviewed ${totalN} card${totalN === 1 ? '' : 's'}.`
              : 'No cards were reviewed.'}
          </AppText>
        </View>

        {/* Stats row */}
        {totalN > 0 && (
          <View style={[styles.statsRow, { gap: space[3] }]}>
            <StatCard label="Accuracy" value={`${accuracy}%`} valueColor={accuracyColor} />
            <StatCard label="Time" value={timeLabel} />
            <StatCard label="Cards" value={String(totalN)} />
          </View>
        )}

        {/* Boundary-agnostic next-session note (amendment g) */}
        <AppCard variant="alt">
          <AppText variant="body" color="inkMuted">
            {accuracy >= 80
              ? 'Solid session. Your next reviews are scheduled — check home when you\'re ready.'
              : accuracy >= 50
              ? 'The items you found tricky will come back sooner. Keep at it.'
              : 'Tough session — that\'s normal early on. The schedule will space these out so they stick.'}
          </AppText>
        </AppCard>

        <AppButton
          label="Done"
          onPress={handleDismiss}
          variant="primary"
          fullWidth
        />
      </View>
    </AppSafeArea>
  );
}

function StatCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors, space, radius } = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: space[3],
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.surfaceAlt,
      }}>
      <AppText variant="subtitle" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </AppText>
      <AppText variant="caption" color="inkMuted">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
  },
});
