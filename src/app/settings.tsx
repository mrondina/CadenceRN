import React, { useState, useRef } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { uuidv7 } from 'uuidv7';

import { AppSafeArea } from '@/components/ui/AppSafeArea';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/context/ThemeContext';
import { useDBContext } from '@/context/DBContext';
import { useCohortStore } from '@/stores/cohortStore';
import { useAppSettingsStore } from '@/stores/appSettingsStore';
import { CohortBuilder, ALL_TEMPLATE_COURSES, toDateStr } from '@/domain/cohort/CohortBuilder';
import type { Cohort, CourseInstance, SessionInstance } from '@/domain/types';

const TEMPLATE_TITLES = new Set(ALL_TEMPLATE_COURSES.map(c => c.title));
const CAP_OPTIONS = [5, 10, 15, 20, 25, 30];
const BOUNDARY_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

// ─── Date parser ──────────────────────────────────────────────────────────────

function parseDate(m: string, d: string, y: string): Date | null {
  const mi = parseInt(m, 10), di = parseInt(d, 10), yi = parseInt(y, 10);
  if (isNaN(mi) || mi < 1 || mi > 12) return null;
  if (isNaN(di) || di < 1 || di > 31) return null;
  if (isNaN(yi) || yi < 2024 || yi > 2035) return null;
  const date = new Date(Date.UTC(yi, mi - 1, di));
  if (date.getUTCMonth() !== mi - 1) return null;
  return date;
}

function formatDateStr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

// ─── Session date editor modal ────────────────────────────────────────────────

interface SessionEditModalProps {
  session: SessionInstance;
  visible: boolean;
  onClose: () => void;
  onSave: (sessionIndex: number, start: Date, end: Date) => void;
}

function SessionEditModal({ session, visible, onClose, onSave }: SessionEditModalProps) {
  const { colors, space, radius, type: { scale } } = useAppTheme();

  const [sm, setSm] = useState('');
  const [sd, setSd] = useState('');
  const [sy, setSy] = useState('');
  const [em, setEm] = useState('');
  const [ed, setEd] = useState('');
  const [ey, setEy] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from session on open
  const prevVisible = useRef(false);
  if (visible && !prevVisible.current) {
    const [y1, m1, d1] = session.startDate.split('-');
    const [y2, m2, d2] = session.endDate.split('-');
    setSm(String(parseInt(m1)));
    setSd(String(parseInt(d1)));
    setSy(y1);
    setEm(String(parseInt(m2)));
    setEd(String(parseInt(d2)));
    setEy(y2);
    setError(null);
  }
  prevVisible.current = visible;

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
    fontSize: scale.base,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    minHeight: 44,
    flex: 1,
  };

  function handleSave() {
    const start = parseDate(sm, sd, sy);
    const end = parseDate(em, ed, ey);
    if (!start) { setError('Invalid start date.'); return; }
    if (!end) { setError('Invalid end date.'); return; }
    if (end <= start) { setError('End date must be after start date.'); return; }
    setError(null);
    onSave(session.sessionIndex, start, end);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayDismiss} onPress={onClose} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, padding: space[4], gap: space[3], shadowColor: colors.ink }]}>
            <AppText variant="label">Edit {session.label}</AppText>

            <View style={{ gap: space[2] }}>
              <AppText variant="caption" color="inkMuted">Start date</AppText>
              <View style={styles.dateRow}>
                <TextInput style={inputStyle} placeholder="M" value={sm} onChangeText={setSm} keyboardType="number-pad" maxLength={2} accessibilityLabel="Start month" placeholderTextColor={colors.inkMuted} />
                <TextInput style={inputStyle} placeholder="D" value={sd} onChangeText={setSd} keyboardType="number-pad" maxLength={2} accessibilityLabel="Start day" placeholderTextColor={colors.inkMuted} />
                <View style={{ flex: 2 }}>
                  <TextInput style={[inputStyle, { flex: undefined }]} placeholder="YYYY" value={sy} onChangeText={setSy} keyboardType="number-pad" maxLength={4} accessibilityLabel="Start year" placeholderTextColor={colors.inkMuted} />
                </View>
              </View>

              <AppText variant="caption" color="inkMuted">End date</AppText>
              <View style={styles.dateRow}>
                <TextInput style={inputStyle} placeholder="M" value={em} onChangeText={setEm} keyboardType="number-pad" maxLength={2} accessibilityLabel="End month" placeholderTextColor={colors.inkMuted} />
                <TextInput style={inputStyle} placeholder="D" value={ed} onChangeText={setEd} keyboardType="number-pad" maxLength={2} accessibilityLabel="End day" placeholderTextColor={colors.inkMuted} />
                <View style={{ flex: 2 }}>
                  <TextInput style={[inputStyle, { flex: undefined }]} placeholder="YYYY" value={ey} onChangeText={setEy} keyboardType="number-pad" maxLength={4} accessibilityLabel="End year" placeholderTextColor={colors.inkMuted} />
                </View>
              </View>
            </View>

            {error && <AppText variant="caption" color="danger">{error}</AppText>}

            <AppText variant="caption" color="inkMuted">
              Editing dates re-gates which content is available. Existing review history is not affected.
            </AppText>

            <View style={styles.modalButtons}>
              <AppButton label="Cancel" variant="ghost" onPress={onClose} />
              <AppButton label="Save" variant="primary" onPress={handleSave} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Exam date editor ─────────────────────────────────────────────────────────

interface ExamDateEditorProps {
  course: CourseInstance;
  onAdd: (courseId: string, date: string) => void;
  onRemove: (courseId: string, date: string) => void;
}

function ExamDateEditor({ course, onAdd, onRemove }: ExamDateEditorProps) {
  const { colors, space, radius, type: { scale } } = useAppTheme();
  const [adding, setAdding] = useState(false);
  const [m, setM] = useState('');
  const [d, setD] = useState('');
  const [y, setY] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  function handleAdd() {
    const date = parseDate(m, d, y);
    if (!date) { setError('Invalid date.'); return; }
    onAdd(course.id, toDateStr(date));
    setM(''); setD(''); setY(''); setError(null); setAdding(false);
  }

  return (
    <View style={{ gap: space[2] }}>
      <AppText variant="caption" color="inkMuted">{course.title}</AppText>

      {course.examDates.length === 0 && !adding && (
        <AppText variant="caption" color="inkMuted">No exam dates.</AppText>
      )}

      {course.examDates.map(dt => (
        <View key={dt} style={styles.examRow}>
          <AppText variant="caption">{formatDateStr(dt)}</AppText>
          <Pressable
            onPress={() => onRemove(course.id, dt)}
            hitSlop={8}
            accessibilityLabel={`Remove exam ${dt}`}>
            <AppText variant="caption" color="danger">Remove</AppText>
          </Pressable>
        </View>
      ))}

      {adding ? (
        <View style={{ gap: space[1] }}>
          <View style={styles.dateRow}>
            <TextInput style={inputStyle} placeholder="M" value={m} onChangeText={setM} keyboardType="number-pad" maxLength={2} placeholderTextColor={colors.inkMuted} accessibilityLabel="Month" />
            <TextInput style={inputStyle} placeholder="D" value={d} onChangeText={setD} keyboardType="number-pad" maxLength={2} placeholderTextColor={colors.inkMuted} accessibilityLabel="Day" />
            <View style={{ flex: 2 }}>
              <TextInput style={[inputStyle, { flex: undefined }]} placeholder="YYYY" value={y} onChangeText={setY} keyboardType="number-pad" maxLength={4} placeholderTextColor={colors.inkMuted} accessibilityLabel="Year" />
            </View>
          </View>
          {error && <AppText variant="caption" color="danger">{error}</AppText>}
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" variant="ghost" onPress={() => { setAdding(false); setError(null); }} />
            <AppButton label="Add" variant="primary" onPress={handleAdd} />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button">
          <AppText variant="caption" color="primary">+ Add exam date</AppText>
        </Pressable>
      )}
    </View>
  );
}

// ─── Course mapping editor ────────────────────────────────────────────────────

interface CourseMappingEditorProps {
  session: SessionInstance;
  onUpdate: (sessionId: string, courses: CourseInstance[]) => void;
}

function CourseMappingEditor({ session, onUpdate }: CourseMappingEditorProps) {
  const { colors, space, radius } = useAppTheme();
  const [courses, setCourses] = useState<CourseInstance[]>(session.courses);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [otherTitle, setOtherTitle] = useState('');
  const [showOther, setShowOther] = useState(false);

  const available = ALL_TEMPLATE_COURSES.filter(tc => !courses.some(c => c.title === tc.title));

  function remove(id: string) {
    const next = courses.filter(c => c.id !== id);
    setCourses(next);
    onUpdate(session.id, next);
  }

  function addCourse(title: string, packIds: string[]) {
    const now = new Date().toISOString();
    const next = [...courses, { id: uuidv7(), sessionId: session.id, title, contentPackIds: packIds, examDates: [], updatedAt: now }];
    setCourses(next);
    onUpdate(session.id, next);
    setPickerVisible(false);
    setOtherTitle('');
    setShowOther(false);
  }

  return (
    <View style={{ gap: space[2] }}>
      {courses.map(c => (
        <View key={c.id} style={styles.courseRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="caption">{c.title}</AppText>
            {!TEMPLATE_TITLES.has(c.title) && (
              <AppText variant="caption" color="inkMuted">No study content yet.</AppText>
            )}
          </View>
          <Pressable onPress={() => remove(c.id)} hitSlop={8} accessibilityLabel={`Remove ${c.title}`}>
            <AppText variant="caption" color="danger">Remove</AppText>
          </Pressable>
        </View>
      ))}

      {courses.length === 0 && (
        <AppText variant="caption" color="inkMuted">No courses.</AppText>
      )}

      <Pressable onPress={() => { setShowOther(false); setOtherTitle(''); setPickerVisible(true); }} accessibilityRole="button">
        <AppText variant="caption" color="primary">+ Add course</AppText>
      </Pressable>

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayDismiss} onPress={() => setPickerVisible(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, padding: space[4], gap: space[3], shadowColor: colors.ink }]}>
            <AppText variant="label">Add a course</AppText>
            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: space[2] }}>
                {available.map(tc => (
                  <Pressable key={tc.title} onPress={() => addCourse(tc.title, tc.contentPackIds)}
                    style={({ pressed }) => [styles.pickerRow, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border, borderRadius: radius.sm, padding: space[3] }]}>
                    <AppText variant="body">{tc.title}</AppText>
                  </Pressable>
                ))}
                {!showOther ? (
                  <Pressable onPress={() => setShowOther(true)}
                    style={({ pressed }) => [styles.pickerRow, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border, borderRadius: radius.sm, padding: space[3] }]}>
                    <AppText variant="body" color="inkMuted">Other…</AppText>
                  </Pressable>
                ) : (
                  <View style={{ gap: space[2] }}>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, color: colors.ink, padding: space[2], minHeight: 40 }}
                      placeholder="Course name"
                      placeholderTextColor={colors.inkMuted}
                      value={otherTitle}
                      onChangeText={setOtherTitle}
                      autoFocus
                      accessibilityLabel="Other course name"
                    />
                    <AppButton label="Add" variant="primary" onPress={() => { if (otherTitle.trim()) addCourse(otherTitle.trim(), []); }} disabled={!otherTitle.trim()} />
                  </View>
                )}
              </View>
            </ScrollView>
            <AppButton label="Cancel" variant="ghost" onPress={() => setPickerVisible(false)} fullWidth />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Main Settings screen ─────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, space, radius } = useAppTheme();
  const db = useDBContext();
  const { cohort, setCohort } = useCohortStore();
  const { dayBoundaryHour, newItemCap, setDayBoundaryHour, setNewItemCap } = useAppSettingsStore();

  const [saving, setSaving] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionInstance | null>(null);

  if (!cohort || !db) {
    return (
      <AppSafeArea>
        <View style={[styles.container, { padding: space[4] }]}>
          <AppText variant="title">Settings</AppText>
          <AppText variant="body" color="inkMuted" style={{ marginTop: space[2] }}>
            Complete setup first.
          </AppText>
          <AppButton label="Close" variant="ghost" onPress={() => router.back()} style={{ marginTop: space[4] }} />
        </View>
      </AppSafeArea>
    );
  }

  async function updateCohort(updated: Cohort) {
    if (saving) return;
    setSaving(true);
    try {
      await db!.cohortRepo.save(updated);
      setCohort(updated);
    } finally {
      setSaving(false);
    }
  }

  function handleSessionDateSave(sessionIndex: number, start: Date, end: Date) {
    const builder = new CohortBuilder();
    const updated = builder.applySessionDateEdit(cohort!, sessionIndex, start, end);
    updateCohort(updated);
    setEditingSession(null);
  }

  function handleCourseUpdate(sessionId: string, courses: CourseInstance[]) {
    const now = new Date().toISOString();
    const updated: Cohort = {
      ...cohort!,
      updatedAt: now,
      sessions: cohort!.sessions.map(s =>
        s.id === sessionId ? { ...s, courses, updatedAt: now } : s,
      ),
    };
    updateCohort(updated);
  }

  function handleExamDateAdd(courseId: string, dateStr: string) {
    const now = new Date().toISOString();
    const updated: Cohort = {
      ...cohort!,
      updatedAt: now,
      sessions: cohort!.sessions.map(s => ({
        ...s,
        courses: s.courses.map(c =>
          c.id === courseId
            ? { ...c, examDates: [...c.examDates, dateStr], updatedAt: now }
            : c,
        ),
      })),
    };
    updateCohort(updated);
  }

  function handleExamDateRemove(courseId: string, dateStr: string) {
    const now = new Date().toISOString();
    const updated: Cohort = {
      ...cohort!,
      updatedAt: now,
      sessions: cohort!.sessions.map(s => ({
        ...s,
        courses: s.courses.map(c =>
          c.id === courseId
            ? { ...c, examDates: c.examDates.filter(d => d !== dateStr), updatedAt: now }
            : c,
        ),
      })),
    };
    updateCohort(updated);
  }

  return (
    <AppSafeArea>
      <ScrollView contentContainerStyle={[styles.container, { padding: space[4], gap: space[4] }]}>

        <View style={styles.headerRow}>
          <AppText variant="title">Settings</AppText>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Close">
            <AppText variant="label" color="primary">Done</AppText>
          </Pressable>
        </View>

        {/* ── Session dates ──────────────────────────────────────────────────── */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Session dates</AppText>
          <AppText variant="caption" color="inkMuted">
            Editing a session's dates re-gates which content is available. Review history is not affected.
          </AppText>
          {cohort.sessions.map(s => (
            <View key={s.id} style={styles.sessionRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="caption">{s.label}</AppText>
                <AppText variant="caption" color="inkMuted">
                  {formatDateStr(s.startDate)} – {formatDateStr(s.endDate)}
                </AppText>
              </View>
              <Pressable
                onPress={() => setEditingSession(s)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${s.label}`}>
                <AppText variant="caption" color="primary">Edit</AppText>
              </Pressable>
            </View>
          ))}
        </AppCard>

        {/* ── Course mapping (current session) ──────────────────────────────── */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Courses by session</AppText>
          {cohort.sessions.map(s => (
            <View key={s.id} style={{ gap: space[2] }}>
              <AppText variant="caption" color="inkMuted">{s.label}</AppText>
              <CourseMappingEditor
                session={s}
                onUpdate={handleCourseUpdate}
              />
            </View>
          ))}
        </AppCard>

        {/* ── Exam dates ────────────────────────────────────────────────────── */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Exam dates</AppText>
          {cohort.sessions.flatMap(s => s.courses).map(course => (
            <ExamDateEditor
              key={course.id}
              course={course}
              onAdd={handleExamDateAdd}
              onRemove={handleExamDateRemove}
            />
          ))}
          {cohort.sessions.flatMap(s => s.courses).length === 0 && (
            <AppText variant="caption" color="inkMuted">No courses configured.</AppText>
          )}
        </AppCard>

        {/* ── New items per day ─────────────────────────────────────────────── */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">New items per day</AppText>
          <AppText variant="caption" color="inkMuted">
            Limits how many new items enter each review session. Items already introduced are unaffected.
          </AppText>
          <View style={styles.optionRow}>
            {CAP_OPTIONS.map(cap => (
              <Pressable
                key={cap}
                onPress={() => setNewItemCap(db.db, cap)}
                accessibilityRole="radio"
                accessibilityState={{ checked: newItemCap === cap }}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: newItemCap === cap ? colors.primary : colors.border,
                  backgroundColor: newItemCap === cap ? colors.primarySoft : colors.surface,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <AppText variant="caption" color={newItemCap === cap ? 'primary' : 'inkMuted'}>
                  {cap}
                </AppText>
              </Pressable>
            ))}
          </View>
        </AppCard>

        {/* ── Day-boundary hour ─────────────────────────────────────────────── */}
        <AppCard style={{ gap: space[3] }}>
          <AppText variant="label">Study-day boundary</AppText>
          <AppText variant="caption" color="inkMuted">
            Reviews before this hour count as the previous study day.
            Default 4 am prevents streak breaks for late-night sessions.
          </AppText>
          <AppText variant="caption" color="inkMuted">
            Changing this may affect streak counts for sessions crossing the old boundary.
            Stored review history is not modified — only future sessions use the new value.
          </AppText>
          <View style={styles.optionRow}>
            {BOUNDARY_OPTIONS.map(h => (
              <Pressable
                key={h}
                onPress={() => setDayBoundaryHour(db.db, h)}
                accessibilityRole="radio"
                accessibilityState={{ checked: dayBoundaryHour === h }}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: dayBoundaryHour === h ? colors.primary : colors.border,
                  backgroundColor: dayBoundaryHour === h ? colors.primarySoft : colors.surface,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <AppText variant="caption" color={dayBoundaryHour === h ? 'primary' : 'inkMuted'}>
                  {h}am
                </AppText>
              </Pressable>
            ))}
          </View>
        </AppCard>

        {/* ── Re-run onboarding ─────────────────────────────────────────────── */}
        <AppCard variant="alt" style={{ gap: space[2] }}>
          <AppText variant="label">Re-run setup</AppText>
          <AppText variant="caption" color="inkMuted">
            Rebuild your cohort from scratch. Existing review history is preserved.
          </AppText>
          <AppButton
            label="Re-configure cohort"
            variant="secondary"
            onPress={() => { router.back(); router.push('/setup/start-date'); }}
          />
        </AppCard>

        <AppButton
          label="Done"
          variant="ghost"
          onPress={() => router.back()}
          fullWidth
        />
      </ScrollView>

      {/* Session date edit modal */}
      {editingSession && (
        <SessionEditModal
          session={editingSession}
          visible={true}
          onClose={() => setEditingSession(null)}
          onSave={handleSessionDateSave}
        />
      )}
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  examRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRow: { flexDirection: 'row', gap: 8 },
  optionRow: { flexDirection: 'row', gap: 6 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
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
  pickerRow: { borderWidth: 1 },
});
