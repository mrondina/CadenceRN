import { useState, useRef, useEffect } from 'react';
import { View, ScrollView, Modal, Pressable, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { uuidv7 } from 'uuidv7';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { useWizardStore } from '@/stores/wizardStore';
import {
  getCurrentSession,
  ALL_TEMPLATE_COURSES,
} from '@/domain/cohort/CohortBuilder';
import type { Cohort, CourseInstance } from '@/domain/types';

const TEMPLATE_TITLES = new Set(ALL_TEMPLATE_COURSES.map(c => c.title));

export default function ConfirmCoursesScreen() {
  const router = useRouter();
  const { colors, space, radius, type: { scale } } = useAppTheme();
  const db = useDBContext();
  const { setCohort } = useCohortStore();
  const { draft, clearDraft } = useWizardStore();

  // completedRef suppresses the !draft redirect after clearDraft() runs on
  // successful completion — same pattern as exam-dates fix (57aca37).
  const completedRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [otherTitle, setOtherTitle] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);

  // Initialize editedCourses from draft before any conditional return.
  const sessionResult = draft ? getCurrentSession(draft, new Date()) : null;
  const [editedCourses, setEditedCourses] = useState<CourseInstance[]>(
    () => sessionResult?.session.courses ?? [],
  );

  useEffect(() => {
    if (!draft && !completedRef.current) router.replace('/setup/start-date');
  }, [draft, router]);

  if (!draft) return null;

  const { session: currentSession, weekIndex } = getCurrentSession(draft, new Date());
  const sessionLabel = `Session ${currentSession.sessionIndex}, Week ${weekIndex}`;

  async function handleConfirm(courses: CourseInstance[]) {
    if (!db || saving) return;
    setSaving(true);

    const now = new Date().toISOString();
    const finalCohort: Cohort = {
      ...draft,
      updatedAt: now,
      sessions: draft.sessions.map(s =>
        s.id === currentSession.id
          ? { ...s, courses, updatedAt: now }
          : s,
      ),
    };

    try {
      await db.cohortRepo.saveAndReplace(finalCohort);
      setCohort(finalCohort);
      completedRef.current = true;
      router.replace('/');
      clearDraft();
    } catch {
      setSaving(false);
    }
  }

  function removeCourse(id: string) {
    setEditedCourses(prev => prev.filter(c => c.id !== id));
  }

  function addCourse(title: string, contentPackIds: string[]) {
    const now = new Date().toISOString();
    setEditedCourses(prev => [
      ...prev,
      { id: uuidv7(), sessionId: currentSession.id, title, contentPackIds, examDates: [], updatedAt: now },
    ]);
    setPickerVisible(false);
    setOtherTitle('');
    setShowOtherInput(false);
  }

  const availableTemplateCourses = ALL_TEMPLATE_COURSES.filter(
    tc => !editedCourses.some(ec => ec.title === tc.title),
  );

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
    flex: 1,
  };

  return (
    <AppSafeArea>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: space[4], gap: space[4] }]}
        keyboardShouldPersistTaps="handled">

        <View style={{ gap: space[1] }}>
          <AppText variant="title">Confirm your courses</AppText>
          <AppText variant="caption" color="inkMuted">{sessionLabel}</AppText>
        </View>

        {!editing ? (
          // ── Derive-confirm view ─────────────────────────────────────────────
          <>
            <AppCard style={{ gap: space[2] }}>
              <AppText variant="label">Your courses right now</AppText>
              {currentSession.courses.map(c => (
                <AppText key={c.id} variant="body">{c.title}</AppText>
              ))}
              {currentSession.courses.length === 0 && (
                <AppText variant="caption" color="inkMuted">No courses for this session yet.</AppText>
              )}
            </AppCard>

            <AppButton
              label={saving ? 'Saving…' : 'Yes, start studying'}
              variant="primary"
              onPress={() => handleConfirm(currentSession.courses)}
              fullWidth
              disabled={saving}
            />
            <AppButton
              label="Not quite"
              variant="ghost"
              onPress={() => {
                setEditedCourses([...currentSession.courses]);
                setEditing(true);
              }}
              fullWidth
              disabled={saving}
            />
          </>
        ) : (
          // ── Inline edit mode ────────────────────────────────────────────────
          <>
            <AppCard style={{ gap: space[2] }}>
              <AppText variant="label">Current courses</AppText>

              {editedCourses.map(course => {
                const isOther = !TEMPLATE_TITLES.has(course.title);
                return (
                  <View key={course.id} style={styles.courseRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="body">{course.title}</AppText>
                      {isOther && (
                        <AppText variant="caption" color="inkMuted">
                          No study content for this course yet.
                        </AppText>
                      )}
                    </View>
                    <Pressable
                      onPress={() => removeCourse(course.id)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                      accessibilityLabel={`Remove ${course.title}`}
                      hitSlop={8}>
                      <AppText variant="caption" color="danger">Remove</AppText>
                    </Pressable>
                  </View>
                );
              })}

              {editedCourses.length === 0 && (
                <AppText variant="caption" color="inkMuted">No courses added yet.</AppText>
              )}
            </AppCard>

            <AppButton
              label="Add a course"
              variant="ghost"
              onPress={() => {
                setShowOtherInput(false);
                setOtherTitle('');
                setPickerVisible(true);
              }}
              fullWidth
            />

            <AppButton
              label={saving ? 'Saving…' : 'Done'}
              variant="primary"
              onPress={() => handleConfirm(editedCourses)}
              fullWidth
              disabled={saving}
            />
          </>
        )}
      </ScrollView>

      {/* ── Course picker modal ──────────────────────────────────────────────── */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayDismiss} onPress={() => setPickerVisible(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, padding: space[4], gap: space[3], shadowColor: colors.ink }]}>
            <AppText variant="label">Add a course</AppText>

            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: space[2] }}>
                {availableTemplateCourses.map(tc => (
                  <Pressable
                    key={tc.title}
                    onPress={() => addCourse(tc.title, tc.contentPackIds)}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      {
                        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                        borderColor: colors.border,
                        borderRadius: radius.sm,
                        padding: space[3],
                      },
                    ]}
                    accessibilityLabel={tc.title}>
                    <AppText variant="body">{tc.title}</AppText>
                  </Pressable>
                ))}

                {/* Other course */}
                {!showOtherInput ? (
                  <Pressable
                    onPress={() => setShowOtherInput(true)}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      {
                        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                        borderColor: colors.border,
                        borderRadius: radius.sm,
                        padding: space[3],
                      },
                    ]}>
                    <AppText variant="body" color="inkMuted">Other…</AppText>
                  </Pressable>
                ) : (
                  <View style={{ gap: space[2] }}>
                    <View style={styles.otherRow}>
                      <TextInput
                        style={[inputStyle, { borderRadius: radius.sm }]}
                        placeholder="Course name"
                        placeholderTextColor={colors.inkMuted}
                        value={otherTitle}
                        onChangeText={setOtherTitle}
                        autoFocus
                        accessibilityLabel="Other course name"
                      />
                      <AppButton
                        label="Add"
                        variant="primary"
                        onPress={() => {
                          if (otherTitle.trim()) addCourse(otherTitle.trim(), []);
                        }}
                        disabled={!otherTitle.trim()}
                      />
                    </View>
                    <AppText variant="caption" color="inkMuted">
                      No study content for this course yet.
                    </AppText>
                  </View>
                )}
              </View>
            </ScrollView>

            <AppButton
              label="Cancel"
              variant="ghost"
              onPress={() => setPickerVisible(false)}
              fullWidth
            />
          </View>
        </View>
      </Modal>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayDismiss: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  pickerRow: {
    borderWidth: 1,
  },
  otherRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
});
