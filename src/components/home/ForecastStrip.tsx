import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/context/ThemeContext';
import type { DayForecast } from '@/domain/types';

interface ForecastStripProps {
  forecast: DayForecast[];
  /** When true, suppress warning colour — pool is early-learning-dominated (amendment e). */
  suppressWarning: boolean;
}

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ForecastStrip({ forecast, suppressWarning }: ForecastStripProps) {
  const { colors, space, radius } = useAppTheme();

  if (forecast.length === 0) return null;

  const max = Math.max(...forecast.map(d => d.dueCount), 1);

  return (
    <View style={styles.container}>
      {forecast.map((day, i) => {
        const dayName = getDayAbbrev(day.date);
        const heightFraction = day.dueCount / max;
        const barHeight = Math.max(Math.round(heightFraction * 48), day.dueCount > 0 ? 4 : 2);

        // Amendment (e): suppress warning state during early-learning dominance.
        const showWarning = day.isWarning && !suppressWarning;

        const barColor =
          showWarning ? colors.warning :
          day.isExamWindow ? colors.info :
          colors.primary;

        return (
          <View key={day.date} style={styles.dayColumn}>
            <View
              style={[
                styles.barTrack,
                { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm },
              ]}>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: barColor,
                    borderRadius: radius.sm,
                  },
                ]}
              />
            </View>
            <AppText
              variant="caption"
              color={i === 0 ? 'ink' : 'inkMuted'}
              style={styles.label}>
              {i === 0 ? 'Now' : dayName}
            </AppText>
            {day.dueCount > 0 && (
              <AppText
                variant="caption"
                color={showWarning ? 'warning' : 'inkMuted'}
                style={styles.count}>
                {day.dueCount}
              </AppText>
            )}
          </View>
        );
      })}
    </View>
  );
}

// Amendment (g): derive day name from the date string directly — no new Date() that
// would anchor to the wall clock and break the 4am study-day boundary for 1am users.
function getDayAbbrev(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Day-of-week from UTC date to match the UTC calendar-day arithmetic used by the forecaster.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return DAY_ABBREVS[dow];
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 4,
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  barTrack: {
    width: '100%',
    height: 48,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
  },
  label: {
    textAlign: 'center',
  },
  count: {
    textAlign: 'center',
  },
});
