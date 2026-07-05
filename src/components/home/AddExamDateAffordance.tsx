import { useState } from 'react';
import { View, Modal, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/context/ThemeContext';
import type { CourseInstance } from '@/domain/types';

interface AddExamDateAffordanceProps {
  courses: CourseInstance[];
  onSave: (courseId: string, dateStr: string) => Promise<void>;
}

export function AddExamDateAffordance({ courses, onSave }: AddExamDateAffordanceProps) {
  const { colors, space, radius, type: { scale } } = useAppTheme();
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => ({
          opacity: pressed ? 0.6 : 1,
          paddingVertical: space[2],
        })}
        accessibilityLabel="Add an exam date">
        <AppText variant="caption" color="inkMuted">
          Have an exam coming up? Add the date →
        </AppText>
      </Pressable>

      <AddExamModal
        visible={modalVisible}
        courses={courses}
        onClose={() => setModalVisible(false)}
        onSave={async (courseId, dateStr) => {
          await onSave(courseId, dateStr);
          setModalVisible(false);
        }}
      />
    </>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface AddExamModalProps {
  visible: boolean;
  courses: CourseInstance[];
  onClose: () => void;
  onSave: (courseId: string, dateStr: string) => Promise<void>;
}

function AddExamModal({ visible, courses, onClose, onSave }: AddExamModalProps) {
  const { colors, space, radius, type: { scale } } = useAppTheme();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    courses.length === 1 ? courses[0].id : null,
  );
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setSelectedCourseId(courses.length === 1 ? courses[0].id : null);
    setMonth(''); setDay(''); setYear('');
    setError(null); setSaving(false);
  }

  function parseDate(): string | null {
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    if (isNaN(m) || m < 1 || m > 12) return null;
    if (isNaN(d) || d < 1 || d > 31) return null;
    if (isNaN(y) || y < 2024 || y > 2035) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1) return null;
    const yy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  async function handleSave() {
    if (!selectedCourseId || saving) return;
    const dateStr = parseDate();
    if (!dateStr) {
      setError('Enter a valid date (month 1–12, day 1–31, year 2024–2035).');
      return;
    }
    setSaving(true);
    try {
      await onSave(selectedCourseId, dateStr);
      reset();
    } catch {
      setSaving(false);
      setError('Failed to save. Try again.');
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
    fontSize: scale.sm,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    minHeight: 40,
  };

  const isReady = selectedCourseId !== null && month.length > 0 && day.length > 0 && year.length === 4;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayDismiss} onPress={onClose} />
        <View style={[
          styles.sheet,
          { backgroundColor: colors.surface, padding: space[4], gap: space[3], shadowColor: colors.ink },
        ]}>
          <AppText variant="label">Add exam date</AppText>

          {/* Course selection — only shown when more than one course */}
          {courses.length > 1 && (
            <View style={{ gap: space[1] }}>
              <AppText variant="caption" color="inkMuted">Course</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ gap: space[2] }}>
                <View style={{ flexDirection: 'row', gap: space[2] }}>
                  {courses.map(c => (
                    <Pressable
                      key={c.id}
                      onPress={() => setSelectedCourseId(c.id)}
                      style={({ pressed }) => ({
                        borderWidth: 1,
                        borderColor: selectedCourseId === c.id ? colors.primary : colors.border,
                        borderRadius: radius.pill,
                        paddingHorizontal: space[3],
                        paddingVertical: space[1],
                        backgroundColor: selectedCourseId === c.id ? colors.primarySoft : colors.surface,
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel={`Select ${c.title}`}>
                      <AppText
                        variant="caption"
                        style={{ color: selectedCourseId === c.id ? colors.primary : colors.ink }}>
                        {c.title}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Date input */}
          <View style={{ gap: space[1] }}>
            <AppText variant="caption" color="inkMuted">Exam date</AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="MM"
                placeholderTextColor={colors.inkMuted}
                keyboardType="number-pad"
                maxLength={2}
                value={month}
                onChangeText={setMonth}
                accessibilityLabel="Month"
              />
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                placeholder="DD"
                placeholderTextColor={colors.inkMuted}
                keyboardType="number-pad"
                maxLength={2}
                value={day}
                onChangeText={setDay}
                accessibilityLabel="Day"
              />
              <TextInput
                style={[inputStyle, { flex: 2 }]}
                placeholder="YYYY"
                placeholderTextColor={colors.inkMuted}
                keyboardType="number-pad"
                maxLength={4}
                value={year}
                onChangeText={setYear}
                accessibilityLabel="Year"
              />
            </View>
          </View>

          {error && <AppText variant="caption" color="danger">{error}</AppText>}

          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <AppButton label="Cancel" variant="ghost" onPress={onClose} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton
                label={saving ? 'Saving…' : 'Save'}
                variant="primary"
                onPress={handleSave}
                fullWidth
                disabled={!isReady || saving}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayDismiss: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
});
