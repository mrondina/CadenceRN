import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/context/ThemeContext';
import { useCohortStore } from '@/stores/cohortStore';
import { getCurrentSession } from '@/domain/cohort/CohortBuilder';
import { getGateParams } from '@/hooks/useQueue';
import type { Pillar } from '@/domain/types';

// ─── Pillar labels ─────────────────────────────────────────────────────────────

const PILLAR_LABELS: Record<Pillar, string> = {
  pharm:       'Pharm',
  procedures:  'Procedures',
  terminology: 'Terminology',
  concepts:    'Concepts',
};

const SESSION_WEEKS = 8;

// ─── Pack option ──────────────────────────────────────────────────────────────

interface PackOption {
  packId: string;
  label: string;
  sessionIndex: number;
}

// ─── Scope picker ─────────────────────────────────────────────────────────────

export default function PracticePickerScreen() {
  const router = useRouter();
  const { colors, space, radius } = useAppTheme();
  const cohort = useCohortStore(s => s.cohort);

  const now = useMemo(() => new Date(), []);

  // Derive pack options from cohort
  const { packOptions, currentSessionIndex, currentWeek, defaultPackId } = useMemo(() => {
    if (!cohort) return { packOptions: [], currentSessionIndex: 1, currentWeek: 1, defaultPackId: '' };

    const { session: currentSess, weekIndex } = getCurrentSession(cohort, now);
    const { week } = getGateParams(cohort, now);

    const options: PackOption[] = [];
    for (const s of cohort.sessions) {
      for (const c of s.courses) {
        const multi = c.contentPackIds.length > 1;
        for (const packId of c.contentPackIds) {
          const suffix = multi
            ? ' · ' + packId.replace('-pack', '').replace(/-/g, ' ')
            : '';
          options.push({ packId, label: c.title + suffix, sessionIndex: s.sessionIndex });
        }
      }
    }

    const defaultPack = options.find(o => o.sessionIndex === currentSess.sessionIndex)?.packId
      ?? options[0]?.packId
      ?? '';

    return {
      packOptions: options,
      currentSessionIndex: currentSess.sessionIndex,
      currentWeek: weekIndex > 0 ? week : 1,
      defaultPackId: defaultPack,
    };
  }, [cohort, now]);

  const [selectedPackId, setSelectedPackId] = useState(defaultPackId);
  const [selectedWeek, setSelectedWeek] = useState<number | undefined>(undefined); // undefined = All weeks
  const [selectedPillar, setSelectedPillar] = useState<Pillar | undefined>(undefined);

  // Week label helper — marks future weeks for the selected pack's session
  const selectedPackSession = packOptions.find(p => p.packId === selectedPackId)?.sessionIndex ?? currentSessionIndex;
  function weekLabel(w: number): string {
    if (selectedPackSession > currentSessionIndex) return `Week ${w} (not yet covered)`;
    if (selectedPackSession === currentSessionIndex && w > currentWeek) return `Week ${w} (not yet covered)`;
    return `Week ${w}`;
  }

  function handleStart() {
    if (!selectedPackId) return;
    router.push({
      pathname: '/practice/session',
      params: {
        packId: selectedPackId,
        week: selectedWeek !== undefined ? String(selectedWeek) : '',
        pillar: selectedPillar ?? '',
      },
    });
  }

  if (!cohort) return null;

  return (
    <AppSafeArea edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[4] }]}
        keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.headerRow}>
          <AppText variant="title">Practice</AppText>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <AppText variant="label" color="inkMuted">Cancel</AppText>
          </Pressable>
        </View>
        <AppText variant="caption" color="inkMuted">
          Drill items on demand — no ratings, nothing scheduled.
        </AppText>

        {/* Pack picker */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Course pack</AppText>
          <View style={styles.chipRow}>
            {packOptions.map(opt => {
              const active = opt.packId === selectedPackId;
              return (
                <Pressable
                  key={opt.packId}
                  onPress={() => setSelectedPackId(opt.packId)}
                  style={[
                    styles.chip,
                    {
                      borderRadius: radius.pill,
                      paddingHorizontal: space[3],
                      paddingVertical: space[1],
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primarySoft : colors.surface,
                    },
                  ]}>
                  <AppText
                    variant="caption"
                    style={{ color: active ? colors.primary : colors.ink }}>
                    {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </AppCard>

        {/* Week picker */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Weeks</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={[styles.chipRow, { flexWrap: 'nowrap' }]}>
              {/* "All weeks" option — default */}
              {[undefined, ...Array.from({ length: SESSION_WEEKS }, (_, i) => i + 1)].map(w => {
                const active = selectedWeek === w;
                const label = w === undefined ? 'All weeks' : weekLabel(w);
                return (
                  <Pressable
                    key={w ?? 'all'}
                    onPress={() => setSelectedWeek(w)}
                    style={[
                      styles.chip,
                      {
                        borderRadius: radius.pill,
                        paddingHorizontal: space[3],
                        paddingVertical: space[1],
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primarySoft : colors.surface,
                      },
                    ]}>
                    <AppText
                      variant="caption"
                      style={{ color: active ? colors.primary : colors.ink }}>
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </AppCard>

        {/* Pillar filter (optional) */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Pillar (optional)</AppText>
          <View style={styles.chipRow}>
            {([undefined, 'pharm', 'terminology', 'concepts', 'procedures'] as const).map(p => {
              const active = selectedPillar === p;
              const label = p === undefined ? 'All pillars' : PILLAR_LABELS[p];
              return (
                <Pressable
                  key={p ?? 'all'}
                  onPress={() => setSelectedPillar(p ?? undefined)}
                  style={[
                    styles.chip,
                    {
                      borderRadius: radius.pill,
                      paddingHorizontal: space[3],
                      paddingVertical: space[1],
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primarySoft : colors.surface,
                    },
                  ]}>
                  <AppText
                    variant="caption"
                    style={{ color: active ? colors.primary : colors.ink }}>
                    {label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </AppCard>

        <AppText variant="caption" color="inkMuted" style={{ textAlign: 'center' }}>
          Up to 12 items per session
        </AppText>

        <AppButton
          label="Start Practice"
          variant="primary"
          onPress={handleStart}
          disabled={!selectedPackId}
          fullWidth
        />
      </ScrollView>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    alignSelf: 'flex-start',
  },
});
