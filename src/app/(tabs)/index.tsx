import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useDBContext } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { useAppTheme } from '@/context/ThemeContext';

export default function HomeScreen() {
  const router = useRouter();
  const db = useDBContext();
  const { cohort, setCohort } = useCohortStore();
  const { space } = useAppTheme();
  const [checking, setChecking] = useState(true);

  // On mount: load cohort from DB; if none, go to setup wizard.
  useEffect(() => {
    if (!db) return;
    db.cohortRepo.findFirst().then((found) => {
      if (found) {
        setCohort(found);
      } else {
        router.replace('/setup/start-date');
      }
      setChecking(false);
    });
  }, [db]);

  if (checking || !cohort) return null;

  return (
    <AppSafeArea>
      <View style={[styles.container, { padding: space[4] }]}>
        <AppText variant="title">CadenceRN</AppText>
        <AppText variant="body" color="inkMuted" style={styles.sub}>
          ABSN Study Companion
        </AppText>

        <AppCard style={styles.card}>
          <AppText variant="label">Setup complete</AppText>
          <AppText variant="caption" color="inkMuted">
            {cohort.startDate} · {cohort.templateId}
          </AppText>
        </AppCard>

        <AppButton
          label="Re-configure cohort"
          variant="ghost"
          onPress={() => router.push('/setup/start-date')}
        />
      </View>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16 },
  sub: { marginTop: -8 },
  card: { marginTop: 8 },
});
