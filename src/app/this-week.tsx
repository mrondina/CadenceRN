import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { PillarChip } from '@/components/session/PillarChip';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { useAppSettingsStore } from '@/stores/appSettingsStore';
import { SchedulerService } from '@/domain/scheduler/SchedulerService';
import { getCurrentSession, addCalendarDays } from '@/domain/cohort/CohortBuilder';
import type {
  Cohort,
  ContentItem,
  CourseInstance,
  ItemMemoryState,
} from '@/domain/types';
import type { DBContextValue } from '@/context/DBContext';

const scheduler = new SchedulerService();

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekItemRow {
  item: ContentItem;
  introduced: boolean;
}

interface CourseWeekData {
  course: CourseInstance;
  thisWeek: WeekItemRow[];
  nextWeek: ContentItem[];  // pull-ahead candidates
  hasContent: boolean;      // false when course has no content packs
}

// ─── Unlock timing label ──────────────────────────────────────────────────────

// Returns "Unlocks Mon" style label — weekday name, boundary-agnostic.
function unlockLabel(targetWeek: number, sessionStartDate: string): string {
  const daysOffset = (targetWeek - 1) * 7;
  const unlockDateStr = addCalendarDays(sessionStartDate, daysOffset);
  const [y, m, d] = unlockDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `Unlocks ${day}`;
}

// ─── Data loader ──────────────────────────────────────────────────────────────

async function loadThisWeekData(
  cohort: Cohort,
  db: DBContextValue,
  now: Date,
): Promise<{
  sessionLabel: string;
  weekIndex: number;
  sessionStartDate: string;
  courseData: CourseWeekData[];
  unlockedNotIntroduced: number;
  lockedWeeks: { week: number; label: string; count: number }[];
}> {
  const { session: currentSession, weekIndex } = getCurrentSession(cohort, now);

  const allMemStates = await db.memStateRepo.findAll();
  const introducedIds = new Set(allMemStates.map((s: ItemMemoryState) => s.itemId));

  const courseData: CourseWeekData[] = [];
  let totalUnlockedNotIntroduced = 0;

  // Locked weeks: weeks weekIndex+1 through 8, count items per week
  const lockedWeekMap = new Map<number, number>();

  for (const course of currentSession.courses) {
    if (course.contentPackIds.length === 0) {
      courseData.push({ course, thisWeek: [], nextWeek: [], hasContent: false });
      continue;
    }

    const allCourseItems: ContentItem[] = [];
    for (const packId of course.contentPackIds) {
      const items = await db.contentItemRepo.findByPack(packId);
      allCourseItems.push(...items);
    }

    // Only items within the current session
    const sessionItems = allCourseItems.filter(
      i => i.releaseGate.sessionIndex === currentSession.sessionIndex,
    );

    const thisWeek: WeekItemRow[] = sessionItems
      .filter(i => i.releaseGate.week === weekIndex)
      .map(i => ({ item: i, introduced: introducedIds.has(i.id) }));

    const nextWeek: ContentItem[] = weekIndex < 8
      ? sessionItems.filter(i => i.releaseGate.week === weekIndex + 1)
      : [];

    // Locked weeks (week+2 through 8)
    for (let w = weekIndex + 2; w <= 8; w++) {
      const cnt = sessionItems.filter(i => i.releaseGate.week === w).length;
      if (cnt > 0) {
        lockedWeekMap.set(w, (lockedWeekMap.get(w) ?? 0) + cnt);
      }
    }

    const unlockedNotIntro = thisWeek.filter(r => !r.introduced).length;
    totalUnlockedNotIntroduced += unlockedNotIntro;

    courseData.push({ course, thisWeek, nextWeek, hasContent: true });
  }

  const lockedWeeks = [...lockedWeekMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, count]) => ({
      week,
      label: unlockLabel(week, currentSession.startDate),
      count,
    }));

  return {
    sessionLabel: `${currentSession.label} · Week ${weekIndex}`,
    weekIndex,
    sessionStartDate: currentSession.startDate,
    courseData,
    unlockedNotIntroduced: totalUnlockedNotIntroduced,
    lockedWeeks,
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ThisWeekScreen() {
  const router = useRouter();
  const { colors, space, radius } = useAppTheme();
  const db = useDBContext();
  const { cohort } = useCohortStore();
  const newItemCap = useAppSettingsStore(s => s.newItemCap);

  const [loading, setLoading] = useState(true);
  const [sessionLabel, setSessionLabel] = useState('');
  const [weekIndex, setWeekIndex] = useState(1);
  const [sessionStartDate, setSessionStartDate] = useState('');
  const [courseData, setCourseData] = useState<CourseWeekData[]>([]);
  const [unlockedNotIntroduced, setUnlockedNotIntroduced] = useState(0);
  const [lockedWeeks, setLockedWeeks] = useState<{ week: number; label: string; count: number }[]>([]);
  const [pullingAhead, setPullingAhead] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!db || !cohort) return;
    setLoading(true);
    try {
      const result = await loadThisWeekData(cohort, db, new Date());
      setSessionLabel(result.sessionLabel);
      setWeekIndex(result.weekIndex);
      setSessionStartDate(result.sessionStartDate);
      setCourseData(result.courseData);
      setUnlockedNotIntroduced(result.unlockedNotIntroduced);
      setLockedWeeks(result.lockedWeeks);
    } finally {
      setLoading(false);
    }
  }, [db, cohort]);

  useEffect(() => { load(); }, [load]);

  async function handlePullAhead(item: ContentItem) {
    if (!db || pullingAhead.has(item.id)) return;
    setPullingAhead(prev => new Set([...prev, item.id]));
    try {
      const now = new Date();
      const fsrs = scheduler.createInitialState(item.id, now);
      const state: ItemMemoryState = {
        itemId: item.id,
        fsrs,
        relearnStreak: 0,
        graduated: false,
        lastQualifyingDate: null,
        updatedAt: now.toISOString(),
      };
      await db.memStateRepo.insertPullAhead(state);
      await load(); // refresh view
    } catch {
      setPullingAhead(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  if (!cohort || !db) return null;

  return (
    <AppSafeArea>
      <ScrollView contentContainerStyle={[styles.content, { padding: space[4], gap: space[4] }]}>

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="title">This Week</AppText>
            {!loading && <AppText variant="caption" color="inkMuted">{sessionLabel}</AppText>}
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Close"
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <AppText variant="label" color="primary">Done</AppText>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {/* Cap note — appears when unlocked new items exceed the daily cap */}
            {unlockedNotIntroduced > newItemCap && (
              <AppCard variant="alt" style={{ gap: space[1] }}>
                <AppText variant="label" color="inkMuted">
                  {unlockedNotIntroduced} items unlocked this week · {newItemCap} introduced per day
                </AppText>
                <Pressable
                  onPress={() => { router.back(); router.push('/settings'); }}
                  accessibilityRole="link">
                  <AppText variant="caption" color="primary">
                    Adjust daily cap in Settings
                  </AppText>
                </Pressable>
              </AppCard>
            )}

            {/* Per-course rows */}
            {courseData.map(cd => (
              <View key={cd.course.id} style={{ gap: space[2] }}>
                <AppText variant="label">{cd.course.title}</AppText>

                {!cd.hasContent ? (
                  <AppText variant="caption" color="inkMuted">No study content yet.</AppText>
                ) : cd.thisWeek.length === 0 ? (
                  <AppText variant="caption" color="inkMuted">No new items this week.</AppText>
                ) : (
                  <AppCard style={{ gap: space[2] }}>
                    {cd.thisWeek.map(row => (
                      <View key={row.item.id} style={styles.itemRow}>
                        <PillarChip pillar={row.item.pillar} />
                        <View style={{ flex: 1 }}>
                          <AppText variant="caption" numberOfLines={2}>
                            {itemSummary(row.item)}
                          </AppText>
                        </View>
                        <AppText
                          variant="caption"
                          color={row.introduced ? 'success' : 'inkMuted'}>
                          {row.introduced ? 'Active' : 'Not yet'}
                        </AppText>
                      </View>
                    ))}
                  </AppCard>
                )}

                {/* Pull-ahead: next week's items */}
                {cd.nextWeek.length > 0 && (
                  <View style={{ gap: space[1] }}>
                    <AppText variant="caption" color="inkMuted">
                      Next week — {unlockLabel(weekIndex + 1, sessionStartDate)}
                    </AppText>
                    {cd.nextWeek.map(item => (
                      <Pressable
                        key={item.id}
                        onPress={() => handlePullAhead(item)}
                        disabled={pullingAhead.has(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Introduce ${itemSummary(item)} now`}
                        style={({ pressed }) => [
                          styles.pullAheadRow,
                          {
                            borderColor: colors.border,
                            borderRadius: radius.sm,
                            padding: space[3],
                            opacity: pressed || pullingAhead.has(item.id) ? 0.5 : 1,
                          },
                        ]}>
                        <PillarChip pillar={item.pillar} />
                        <View style={{ flex: 1 }}>
                          <AppText variant="caption" numberOfLines={2} color="inkMuted">
                            {itemSummary(item)}
                          </AppText>
                        </View>
                        <AppText variant="caption" color="primary">
                          {pullingAhead.has(item.id) ? 'Adding…' : 'Start now'}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {/* Locked future weeks */}
            {lockedWeeks.length > 0 && (
              <View style={{ gap: space[2] }}>
                <AppText variant="label" color="inkMuted">Coming up</AppText>
                {lockedWeeks.map(lw => (
                  <View
                    key={lw.week}
                    style={[
                      styles.lockedRow,
                      { borderColor: colors.border, borderRadius: radius.sm, padding: space[3] },
                    ]}>
                    <AppText variant="caption" color="inkMuted">Week {lw.week}</AppText>
                    <AppText variant="caption" color="inkMuted">
                      {lw.label} · {lw.count} item{lw.count === 1 ? '' : 's'}
                    </AppText>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </AppSafeArea>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function itemSummary(item: ContentItem): string {
  const { body } = item;
  switch (body.type) {
    case 'cloze':      return body.front.replace('{{', '').replace('}}', '___');
    case 'mcq':        return body.stem;
    case 'free_recall':return body.prompt;
    case 'numeric':    return body.problem;
    case 'sequence':   return body.prompt;
    default:           return item.id;
  }
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pullAheadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
  },
  lockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
});
