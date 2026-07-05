import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';

export default function SettingsScreen() {
  const router = useRouter();
  const { space } = useAppTheme();

  return (
    <AppSafeArea>
      <View style={[styles.container, { padding: space[4], gap: space[4] }]}>
        <AppText variant="title">Settings</AppText>

        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Cohort setup</AppText>
          <AppText variant="caption" color="inkMuted">
            Re-run the setup wizard to adjust your session dates or exam dates.
          </AppText>
          <AppButton
            label="Re-configure cohort"
            variant="secondary"
            onPress={() => router.push('/setup/start-date')}
          />
        </AppCard>

        <AppCard variant="alt" style={{ gap: space[2] }}>
          <AppText variant="label" color="inkMuted">Phase 2</AppText>
          <AppText variant="caption" color="inkMuted">
            Notifications, backup, and advanced settings coming in a future update.
          </AppText>
        </AppCard>

        <AppButton
          label="Close"
          variant="ghost"
          onPress={() => router.back()}
        />
      </View>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
