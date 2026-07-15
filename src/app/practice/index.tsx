import { useMemo, useState, useEffect } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { getCurrentSession } from '@/domain/cohort/CohortBuilder';
import { getGateParams } from '@/hooks/useQueue';
import type { Pillar } from '@/domain/types';

// ─── Try-a-Case affordance ────────────────────────────────────────────────────

function TryACaseCard() {
  const router = useRouter();
  const { colors, space, radius } = useAppTheme();
  const db = useDBContext();
  const [hasCases, setHasCases] = useState<boolean | null>(null);  // null = loading

  useEffect(() => {
    if (!db) return;
    db.caseRepo.findAll()
      .then(cases => setHasCases(cases.length > 0))
      .catch(() => setHasCases(false));
  }, [db]);

  // Hidden while loading or when no cases are seeded.
  if (!hasCases) return null;

  return (
    <AppCard
      style={{
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        gap: space[2],
      }}>
      <View style={{ gap: space[1] }}>
        <AppText variant="label">NGN Case Format Preview</AppText>
        <AppText variant="caption" color="inkMuted">
          Preview — doesn't affect your reviews.
        </AppText>
      </View>
      <AppButton
        label="Try a Case →"
        variant="secondary"
        onPress={() => router.push('/practice/case-preview')}
        fullWidth={false}
      />
    </AppCard>
  );
}

// ─── Pillar labels ─────────────────────────────────────────────────────────────

const PILLAR_LABELS: Record<Pillar, string> = {
  pharm:       'Pharm',
  procedures:  'Procedures',
  terminology: 'Terminology',
  concepts:    'Concepts',
  dosage:      'Dosage',
};

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
  const db = useDBContext();
  const cohort = useCohortStore(s => s.cohort);

  const now = useMemo(() => new Date(), []);

  // Derive pack options and defaults from cohort — no DB needed.
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
  const [selectedWeek, setSelectedWeek] = useState<number | undefined>(undefined);
  const [selectedPillar, setSelectedPillar] = useState<Pillar | undefined>(undefined);

  // Available weeks and pillars — derived from content, not hardcoded.
  const [availableWeeks, setAvailableWeeks] = useState<number[]>([]);
  const [availablePillars, setAvailablePillars] = useState<Pillar[]>([]);

  // Load available weeks whenever the selected pack changes.
  // Reset week + pillar selections so stale options cannot persist.
  useEffect(() => {
    if (!db || !selectedPackId) return;
    setSelectedWeek(undefined);
    setSelectedPillar(undefined);
    db.contentItemRepo.findWeeksByPack(selectedPackId)
      .then(weeks => setAvailableWeeks(weeks))
      .catch(() => setAvailableWeeks([]));
  }, [selectedPackId, db]);

  // Load available pillars whenever pack or week changes.
  // Resets pillar so a selection from another scope doesn't persist.
  useEffect(() => {
    if (!db || !selectedPackId) return;
    setSelectedPillar(undefined);
    db.contentItemRepo.findPillarsByPackAndWeek(selectedPackId, selectedWeek)
      .then(pillars => setAvailablePillars(pillars as Pillar[]))
      .catch(() => setAvailablePillars([]));
  }, [selectedPackId, selectedWeek, db]);

  // Week label: marks weeks the student hasn't reached yet.
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

  const canStart = Boolean(selectedPackId);

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

        {/* NGN case preview — gated: hidden until cases are confirmed seeded */}
        <TryACaseCard />

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

        {/* Week picker — only shows weeks that have content in the selected pack */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Weeks</AppText>
          {availableWeeks.length === 0 ? (
            <AppText variant="caption" color="inkMuted">No weeks available</AppText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[styles.chipRow, { flexWrap: 'nowrap' }]}>
                {/* "All weeks" — default */}
                {[undefined, ...availableWeeks].map(w => {
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
          )}
        </AppCard>

        {/* Pillar filter — only shows pillars that exist in the selected pack+week */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Pillar (optional)</AppText>
          {availablePillars.length === 0 ? (
            <AppText variant="caption" color="inkMuted">No pillar filter available</AppText>
          ) : (
            <View style={styles.chipRow}>
              {([undefined, ...availablePillars] as (Pillar | undefined)[]).map(p => {
                const active = selectedPillar === p;
                const label = p === undefined ? 'All pillars' : PILLAR_LABELS[p];
                return (
                  <Pressable
                    key={p ?? 'all'}
                    onPress={() => setSelectedPillar(p)}
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
          )}
        </AppCard>

        <AppText variant="caption" color="inkMuted" style={{ textAlign: 'center' }}>
          Up to 12 items per session
        </AppText>

        <AppButton
          label="Start Practice"
          variant="primary"
          onPress={handleStart}
          disabled={!canStart}
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
