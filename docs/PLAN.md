# CadenceRN — Build Plan

**Status:** Domain and persistence phases complete. v0.2-persistence tagged (238/238 passing).
**Last updated:** 2026-07-04

A new session should read this file and `docs/PRD.md` before writing any code. Every step ends with a named commit; push at session boundaries minimum.

---

## Architecture Summary

CadenceRN is an offline-first React Native / Expo application structured in five layers. **Domain** contains all scheduling, memory-state, and cohort logic as pure TypeScript — no I/O dependencies, fully unit-testable. **DB** (expo-sqlite, WAL mode) is the single persistence layer; it owns all SQL, migrations, and repository implementations behind interfaces. **Stores** (Zustand) hold derived UI state — session queue, streak, forecast — populated from repositories; they never own ground truth. **Hooks** compose stores and repositories into per-screen data contracts. **UI** (Expo Router, React Native) renders whatever the hooks expose; it never calls repositories or domain logic directly.

```
┌──────────────────────────────────────────────────────┐
│  UI — Expo Router screens + React Native components  │
├──────────────────────────────────────────────────────┤
│  Hooks — per-screen data contracts (useQueue, etc.)  │
├──────────────────────────────────────────────────────┤
│  Stores — Zustand (session queue, streak, forecast)  │
├──────────────────────────────────────────────────────┤
│  DB — expo-sqlite repositories + migrations          │
├──────────────────────────────────────────────────────┤
│  Domain — pure TS: scheduler, cohort, types          │  ← exists as of this writing
└──────────────────────────────────────────────────────┘
```

Only the domain layer exists as of this writing. All higher layers are stubs or not yet created.

---

## Architectural Decision Records

### ADR-1 — expo-sqlite with WAL mode

Use expo-sqlite as the on-device database. Enable WAL (Write-Ahead Logging) mode at DB initialization. Rationale: WAL allows concurrent reads during writes, which matters for the study-path read queries running alongside the background sync write path. SQLite fits the offline-first requirement with no external server; expo-sqlite ships with Expo without additional native config. Alternative considered: WatermelonDB (more complex, adds its own sync layer we don't need at MVP).

### ADR-2 — ts-fsrs wrapper with `enable_fuzz: false` as a hard constant

Wrap ts-fsrs behind `ISchedulerService`. The `enable_fuzz` flag is set to `false` at construction and is not configurable via any parameter — it is burned in as a constant. Rationale: fuzzing introduces non-determinism that makes the acceptance harness unreliable and makes debugging scheduling behavior impossible ("why is this card due Thursday and not Wednesday?"). The Week 8 determinism replay test (two independent 14-day simulations producing byte-identical final state maps) serves as the regression guard: if a future ts-fsrs upgrade changes the default for `enable_fuzz`, the determinism test will fail before any other test catches it.

### ADR-3 — Deterministic weighted round-robin interleaver, no Math.random

`QueueBuilder` interleaves review items across pillars using an accumulated-credit algorithm (integer-scaled weights, alphabetical tie-breaking). No `Math.random` anywhere in domain code. Rationale: a seeded-shuffle feature is planned but not yet implemented; until it is, the interleaver must be deterministic so the harness replay test is meaningful and two users with identical history see identical queues. The algorithm is proportional (larger pillar buckets contribute more items per round) and stable (within-pillar order is arrival order).

### ADR-4 — Exam mode as candidate-selection + retention elevation at queue-construction time; never stored state mutation

Exam mode is implemented as two orthogonal operations applied at queue-build time: (1) `ExamModeCompressor.getRetention()` returns 0.95 inside a 10-day window, 0.90 outside — used as `desiredRetention` in `SchedulerService.schedule()` for exam-mode cards; (2) `ExamModeCompressor.getCandidates()` selects items whose predicted retrievability at the exam date falls below the target retention threshold, pulling them forward as `mode:'exam'` entries. Neither operation writes to the database or mutates `ItemMemoryState`. Consequence: exam compression is stateless — if the user misses a session during the window, nothing is corrupted; the next session recomputes candidates from current FSRS state. Note: `getCandidates` accepts a `now` parameter but does not use it internally; past exam dates do not auto-empty the candidate list via this path. `getActiveExam` returning null is the gate that prevents candidates from flowing into the queue.

### ADR-5 — Seed content via versioned JSON → migration

Content items are authored as versioned JSON files in `content/`. A migration script reads these files and inserts/upserts rows into `content_items` at first run. Content versioning is per-item (`contentVersion` field on `ContentItem`). This keeps content out of the app bundle for large packs while allowing offline-first use after the first sync. Future: differential updates by comparing `contentVersion`.

### ADR-6 — Expo Router for navigation shells

Use Expo Router (file-based routing) for all screen navigation. Rationale: ships with Expo, handles deep linking and native tab navigation without manual wiring, and the file-system convention reduces navigation state bugs. Study sessions are modal presentations over the main tab shell so OS back-gesture aborts a session cleanly.

### ADR-7 — Zustand for UI state; SQLite as domain source of truth

Zustand manages the in-flight session queue, per-session streak counters, and forecast data. It is populated from repositories at session start and invalidated/refreshed after each rating. SQLite (via repositories) is authoritative — if the store and DB disagree, the DB wins and the store is re-seeded. No domain logic runs inside store actions; stores call domain functions then write results through repositories. Rationale: Zustand is minimal (no reducers, no boilerplate), works with React Native without bridging complexity, and the "stores are cache, DB is truth" rule prevents the dual-write bugs that plague heavier state managers.

### ADR-8 — MemoryState created at first rating, atomically with the first ReviewEvent (post-approval correction)

The original design left ambiguous when `ItemMemoryState` rows are created. Corrected decision: a row is created exactly once, atomically with the first `ReviewEvent` in a single SQLite transaction (`FirstReviewTransaction` type in `types.ts`). Before the first rating, the item appears in the queue as `kind:'new'` carrying a `SyntheticItemState` synthesized by `QueueBuilder` — no DB read or write occurs. If the session is abandoned before reaching that card, no row is created and the item reappears in the next session. This invariant is encoded structurally in the `QueueEntry` discriminated union: `kind:'review'` carries `memoryState: ItemMemoryState` (from DB); `kind:'new'` carries `syntheticState: SyntheticItemState` (in-memory only). A caller cannot accidentally treat a synthetic state as persisted because the type system distinguishes them. `ReviewEventRepository.recordFirstReview()` is the only write path for the atomic pair.

---

## Invariants (Never Violate)

- **Append-only review_events.** No `UPDATE` or `DELETE` path exists for `review_events`. Every rating is a new insert. The log enables FSRS parameter re-optimization and event replay; mutating it corrupts both.

- **`enable_fuzz: false` + determinism test.** The flag is a constant in `SchedulerService`, not a parameter. The Week 8 harness test (byte-identical 14-day replay) is the regression guard. If this test starts failing after a dependency update, investigate `ts-fsrs` changelog before anything else.

- **MemoryState exists iff introduced.** An `ItemMemoryState` row exists if and only if the item has been introduced: either by explicit pull-ahead tap (which creates the row immediately) or by the first actual review rating (atomic with the first `ReviewEvent`). Items queued but not yet reached have no row. This is not a soft convention — it is structurally enforced by the `QueueEntry` discriminated union and `FirstReviewTransaction`.

- **Date edits never mutate memory state.** `CohortBuilder.applySessionDateEdit()` returns a new `Cohort` with updated session dates and touches nothing else. FSRS card states, review events, and relearn streaks are unaffected by calendar edits. Only new-content release gates recompute.

- **No network in the study path.** Every operation on the critical path (queue build, rating, state write) must complete entirely from local SQLite. Network is for background sync only.

- **No `Math.random()` or naked `new Date()` in domain code.** `SchedulerService` receives a `reviewedAt: Date` parameter; `QueueBuilder`, `DebtForecaster`, and `ReleaseGate` receive `now: Date`. The acceptance harness injects a `SimClock` that advances deterministically. Violating this makes tests non-deterministic and debugging impossible.

- **Dual-clock separation.** Two distinct time concepts coexist deliberately: (1) _study days_ use the 4am boundary (`DateBoundary.getStudyDay()`, `hourOffset: 4`) — a review at 1am is the previous study day, preventing phantom streak breaks for students studying late; (2) _exam windows_ and _release gates_ use UTC calendar days (midnight boundary) — `ExamModeCompressor` and `ReleaseGate` both use `toDateStr()` / `calendarDaysUntil()`. Never mix them. The `DateBoundaryConfig` type is passed explicitly to every function that uses study days; calendar-day functions take raw `Date` objects.

- **Graduation timing is FSRS-driven.** `RELEARN_GRADUATION_N = 3` means three qualifying retrievals (Good or Easy) on separate study days, at FSRS-chosen spacing. A single relearning step returns a card directly to Review state — ts-fsrs does not use a two-step 10-minute process. The FSRS-scheduled interval after a lapse is typically ~5 days for the first re-review; post-lapse recovery realistically spans weeks for items with prior high stability. The harness uses `tickToNextDue` (read actual `fsrs.due`, ceil to next day) rather than fixed-day increments — never predict FSRS scheduling outcomes.

- **Day-0 forecast folds all overdue.** `DebtForecaster` puts every item whose `fsrs.due` falls before or on today's study day into the day-0 bucket. This is the debt meter's reason for existing: the count is always at least as large as the real obligation, preventing the user from underestimating backlog.

- **Exam-mode candidacy is cadence-relative, not calendar-relative.** Well-retained items correctly produce zero exam candidates. After 8 weeks of consistent review, items develop stability >> 10 days, so `predictRetrievability(examDate+10) > 0.95` — they are not candidates, and this is correct. Candidacy only exists when items are near their natural due date and the exam compresses the window. Banner copy and any onboarding text must not promise visible extra exam cards to diligent students.

---

## Evidence notes — question format & study design

**(1) Effort hierarchy.** Retention gains track retrieval effort: free recall > short answer > cued recall > recognition; application questions > recall questions. Design consequence: the difficulty-ramp (recognition → cued recall → free recall as item stability grows) is evidence-backed and stands as designed.

**(2) Covert retrieval equals or beats overt.** Mental composition is the active ingredient in retrieval practice; typing the answer adds nothing to the retention benefit. Design consequence: reveal-and-self-grade is the correct free-recall mechanic — never add a mandatory typing requirement.

**(3) Free-recall items are high-cost/high-value.** The cognitive load of free recall is disproportionate relative to other formats. Session budget: cap at 2–3 per 20-card session. UI must cue "think it through, then reveal — no typing needed" before the reveal action.

**(4) Interleaving beats blocking for discrimination.** Mixed-pillar queues produce better long-term discrimination than per-topic blocks. Mixed queue stays the default. A per-course/pillar filter is a legitimate opt-in (pre-exam focus) but must be per-session and never sticky — the app must not carry a filter across sessions.

**(5) Content authoring rule: prefer application stems.** "A patient on lisinopril develops a dry cough — what do you tell them?" outperforms "Define ACE inhibitor." This governs all future content packs and the SME review pass; definition stems are reserved for foundational terminology where no clinical context exists.

**(6) Clinical-judgment items follow the NGN six-skill scaffold.** Next Generation NCLEX items are organized around six cognitive skills: Recognize Cues → Analyze Cues → Prioritize Hypotheses → Generate Solutions → Take Action → Evaluate Outcomes. Mini unfolding cases (a patient scenario that evolves across 2–4 linked items) are the Phase 3 vehicle for this format.

---

## Module Table

All modules are in `src/domain/`. The domain contract (all interfaces, types, and constants) lives solely in `src/domain/types.ts`. `src/types/declarations.d.ts` is ambient TypeScript declarations for CSS modules (Expo template files only) — not part of the domain.

| Module                | File                               | Responsibility                                                                                                                                                                                                   | Tests                                             |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `DateBoundary`        | `utils/DateBoundary.ts`            | `getStudyDay(date, config)` → YYYY-MM-DD string shifted back by `hourOffset` hours; used by all streak and forecast logic                                                                                        | `utils/__tests__/DateBoundary.test.ts`            |
| `SchedulerService`    | `scheduler/SchedulerService.ts`    | Wraps ts-fsrs: `schedule()`, `getRetrievability()`, `predictRetrievability()`, `createInitialState()`; `enable_fuzz` burned in as `false`                                                                        | `scheduler/__tests__/SchedulerService.test.ts`    |
| `RelearningPipeline`  | `scheduler/RelearningPipeline.ts`  | `processRating()`: advances/resets relearn streak; Again resets to 0; Hard is neutral; Good/Easy on a new study day increments; graduates at `RELEARN_GRADUATION_N` (3)                                          | `scheduler/__tests__/RelearningPipeline.test.ts`  |
| `QueueBuilder`        | `scheduler/QueueBuilder.ts`        | `buildQueue()`: merges `dueStates` + `examCandidates` (exam mode wins on dedup), caps + curriculum-sorts new items, interleaves by pillar using accumulated-credit algorithm                                     | `scheduler/__tests__/QueueBuilder.test.ts`        |
| `ExamModeCompressor`  | `scheduler/ExamModeCompressor.ts`  | `getRetention()` → 0.95 in window / 0.90 outside; `getCandidates()` → items with `predictRetrievability < targetRetention` at exam date, excluding New-state; `getActiveExam()` → earliest active window or null | `scheduler/__tests__/ExamModeCompressor.test.ts`  |
| `DebtForecaster`      | `scheduler/DebtForecaster.ts`      | `forecast()`: 7-day due-count projection; overdue folds to day-0; exam candidates added to day-0 when `activeExam !== null`; warning at 1.5× median with floor 10; `isExamWindow` annotation                     | `scheduler/__tests__/DebtForecaster.test.ts`      |
| `CohortBuilder`       | `cohort/CohortBuilder.ts`          | `build()` seeds 6 `SessionInstance`s from Bellarmine ABSN template; `applySessionDateEdit()` modifies one session independently, no cascade; exports `toDateStr`, `addCalendarDays`                              | `cohort/__tests__/CohortBuilder.test.ts`          |
| `ReleaseGate`         | `cohort/ReleaseGate.ts`            | `check()` → `'unlocked' \| 'locked' \| 'pull-ahead-available'`; calendar-day resolution; week = `floor(daysSinceSessionStart / 7) + 1`; past sessions always unlocked                                            | `cohort/__tests__/ReleaseGate.test.ts`            |
| `NotificationPlanner` | `scheduler/NotificationPlanner.ts` | `propose()` stub returns `[]`; interface-sealed for Phase 2 expo-notifications wiring without changing callers                                                                                                   | `scheduler/__tests__/NotificationPlanner.test.ts` |

---

## Acceptance Harness

**File:** `src/domain/__tests__/harness.test.ts`

Seven composed integration scenarios exercising the full domain stack. Each scenario calls `makeFreshDeps(cohortDaysAgo)` for a clean isolated fixture — deliberately not one continuous semester. Isolation produces clearer failure messages and makes each scenario independently reproducible. The fixture generates 120 `ContentItem`s (60 per course, session 1 weeks 1–4, 15/week; 30 pharm items — every 4th by index) plus a `SimClock`, in-memory state maps, and composed domain instances.

**Empirical scripting method:** `tickToNextDue` reads actual `fsrs.due` from the state map, computes `ceil((due - clock) / MS_PER_DAY)`, and ticks that many days. Never predict FSRS scheduling outcomes; read them from state and adapt.

**Scenarios (7 tests, 200 total with unit tests):**

1. **Stage 1 — smoke test** (3 days): queue is non-empty; `ItemMemoryState`s created only on first rating, not on queue construction.

2. **Stage 2 Week 1–2 — normal cadence** (14 days, `cohortDaysAgo=21`): cap=20 new/day respected; FSRS interval growth observed on `item-pack-a-000`; graduation at exactly 3 separate study days; abandoned-item check (skipped items have no state, reappear next session); no forecast warnings during ramp-up.

3. **Stage 2 Week 3 — lapse cluster** (`cohortDaysAgo=21`): graduated pharm items rated Again → `graduated=false`, `relearnStreak=0`; recovery scripted through the composed orchestrator (≥5 items × 3 `simulateDay` calls separated by `tickToNextDue`); re-graduation asserted at exactly `RELEARN_GRADUATION_N=3`; three qualifying dates confirmed distinct study days; same-study-day 11pm/1am retry does not double-count.

4. **Stage 2 Week 4 — skipped week** (`cohortDaysAgo=21`): 5-day clock advance with no study; all overdue items fold to day-0 in forecast; warning fires; 3 catch-up `simulateDay` calls drain the queue; `ItemMemoryState` values are not mutated by time passing (state only changes on rating).

5. **Stage 3 Week 6 — exam window** (`cohortDaysAgo=21`): 56-day simulation (all-Good), then `tickToNextDue` advance of 102 days to first pharm due date (clock=2026-12-09, examDate=2026-12-19). **Actuals:** `candidates=30/30` pharm states; `dueStates=20`; `dualMembers=6` organic. All 6 dual members appear exactly once in built queue as `mode='exam'`. `getRetention` → 0.95; `getActiveExam.daysRemaining=10`; day-0 forecast includes candidates; `isExamWindow=true` for all 7 forecast days (all precede exam date); post-exam `getRetention` → 0.90; `getActiveExam` → null. Note on candidacy: after 8 weeks of consistent review, items have stability ~117 days; `predictRetrievability(+10 days)` = 0.97 > 0.95 — zero candidates at +10 days from end of sim. Candidates only exist when items are near their natural due date (elapsed ≈ stability → R ≈ 0.90 < 0.95).

6. **Stage 3 Week 7 — date-edit memory-state immutability** (`cohortDaysAgo=70`): 3-day sim yields 60 states; `snapBefore` taken; Session 2 start moved +7 days via `applySessionDateEdit`; `snapAfter` compared entry-by-entry with `toEqual` (60 states, all byte-identical); session-2 week=2 item flips `'unlocked'→'locked'` at original simStart date; sessions 1 and 3 dates unmoved.

7. **Stage 3 Week 8 — determinism replay** (`cohortDaysAgo=21`): two independent `runSim()` calls (14 days each, separate `makeFreshDeps`); `toSortedJson = JSON.stringify([...m.entries()].sort(...))` applied to both final state maps; **120 states** compared; assertion `pass1 === pass2` passes.

---

## Build Order with Status

| Step    | Description                                                                                                                                                                                                              | Status                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| 1–10    | Domain layer: types contract, 9 modules (DateBoundary, SchedulerService, RelearningPipeline, QueueBuilder, ExamModeCompressor, DebtForecaster, CohortBuilder, ReleaseGate, NotificationPlanner stub)                     | ✅ 193 unit tests            |
| Harness | Acceptance harness: 3 stages, 7 scenarios                                                                                                                                                                                | ✅ 200 tests total           |
| —       | Tagged `v0.1-domain-complete`                                                                                                                                                                                            | ✅                           |
| 11      | DB client: `expo-sqlite` initialization, WAL mode + foreign keys, migration runner; amendments (a) `last_qualifying_date` column and (b) no `fsrs_*` defaults applied to DDL                                             | ✅                           |
| 12      | Five repositories (`ContentItem`, `ItemMemoryState`, `ReviewEvent`, `Cohort`, `DrillResult`); ADR-8 atomic first-review transaction; `runSchemaOnly` extracted for repository test isolation                              | ✅                           |
| 13      | Seed content: 106 items across 4 packs (terminology 26, pharm 30, foundations 25, dosage 25); migration 002 with exclusive-transaction atomicity + self-heal test; `CONTENT_REVIEW.md`                                   | ✅                           |
| —       | Tagged `v0.2-persistence` · 238/238 passing                                                                                                                                                                              | ✅                           |
| 14      | `useQueue` hook: composes `ReleaseGate`, `QueueBuilder`, `ExamModeCompressor`, repositories → `QueueEntry[]`; overlapping-exam integration suite (amendment c); exam-mode retention wiring (amendment d)                 | — `feat/hooks-and-stores`   |
| 15      | `useReviewSession` hook: processes ratings, calls `SchedulerService` + `RelearningPipeline`, writes via repositories; Zustand stores (`sessionStore`, `streakStore`, `forecastStore`)                                     | — `feat/hooks-and-stores`   |
| 16      | Cohort setup wizard screen; This Week view; pull-ahead UI                                                                                                                                                                | — `feat/setup-and-home`     |
| 17      | Review session screen, debt meter, 7-day forecast, exam banner; forecast warning suppression during onboarding (amendment e); exam banner copy (amendment f)                                                              | — `feat/setup-and-home`     |
| 18      | Dosage drill track screen; "today/tomorrow" date-display audit throughout UI (amendment g)                                                                                                                                | — `feat/setup-and-home`     |
| 19      | Streak display screen; settings screen                                                                                                                                                                                   | — `feat/review-session`     |
| 20      | Notifications wiring; `NotificationPlanner` implementation; accessibility pass for review session                                                                                                                        | — `feat/review-session`     |
| 21–25   | Remaining screens: profile, progress reports, advanced settings, background sync, full accessibility audit                                                                                                                | — `feat/remaining-screens`  |
| —       | Hardening: performance, final accessibility audit, App Store prep                                                                                                                                                        | —                           |

**Next immediate step:** Step 14 — `useQueue` hook (`feat/hooks-and-stores` branch, already created).

---

## Amendments Log

Post-approval changes and known gaps. Each item must be addressed before the relevant step ships; none are optional.

**(a) `lastQualifyingDate` must persist in `ItemMemoryState`.** ✅ Resolved in Step 11.
`lastQualifyingDate: string | null` added to `ItemMemoryState` in `types.ts` (formal amendment); `last_qualifying_date TEXT` column added to `item_memory_states` DDL in migration 001; persisted and hydrated by `ItemMemoryStateRepository`. Last qualifying retrieval date survives app restarts; same-day double-advance is guarded.

**(b) DDL fix: drop `DEFAULT` values on all `fsrs_*` columns.** ✅ Resolved in Step 11.
All `DEFAULT` values removed from `fsrs_stability`, `fsrs_difficulty`, and every other `fsrs_*` column in the `item_memory_states` DDL. Partial inserts fail loudly rather than silently writing `difficulty=5, stability=0`. Covered by a dedicated migration gate test.

**(c) `useQueue` integration suite must cover overlapping exam windows.** Open — scheduled for Step 14.
The unit tests for `ExamModeCompressor` and `QueueBuilder` cover single-exam scenarios. The integration test for `useQueue` (Step 14) must include: two active exam windows simultaneously; a shared item below threshold for the nearer exam only → appears exactly once in the queue as `mode:'exam'` for the nearer exam's course. This is the composition seam that no unit test currently reaches.

**(d) Exam-mode retention wiring is required for the feature to be non-inert.** Open — scheduled for Step 14.
`mode:'exam'` on a `QueueEntry` must route to `desiredRetention=0.95` in `SchedulerService.schedule()`; `mode:'daily'` routes to the baseline 0.90. Without this wiring, exam compression adjusts the candidate selection list but does not actually tighten the scheduled intervals. A test asserting that the same card rated at `mode:'exam'` vs. `mode:'daily'` produces different `scheduledDays` values must be part of Step 14 delivery.

**(e) Forecast warning suppression during onboarding (Step 17).** Open — scheduled for Steps 17–18.
During the first week of use, all introduced items are in Learning state. `DebtForecaster` folds Learning cards to day-0 (due date is within hours), making the median 0 and triggering a warning on day-0 even with a normal load. The warning threshold `dueCount > 1.5 × median AND dueCount > WARNING_FLOOR (10)` partially protects against this, but the floor may need raising or the UI may need to suppress/restyle warnings while `>X%` of the active pool is in Learning state. Evaluate at Step 17 with real onboarding data; do not ship red bars to first-week students.

**(f) Exam banner copy must not promise extra cards to diligent students (Step 17).** Open — scheduled for Step 17.
Well-retained items produce zero exam candidates — this is correct behavior. If the banner implies "we'll add extra reviews before your exam," diligent students who see no change will interpret it as a bug. Copy must reflect that exam mode compresses intervals for items that are already due for review, and that the absence of extra cards means the student's memory is in good shape for the exam.

**(g) Every "today/tomorrow" string in the UI must account for the 4am study-day boundary (Steps 18–20).** Open — scheduled for Steps 18–20.
A student studying at 1am is still on the previous study day. Any UI string that reads "today," "tomorrow," "due today," or uses a relative date must compute against `getStudyDay(now, DEFAULT_DAY_BOUNDARY)`, not `new Date()`. Audit all date-display code at each UI step before marking complete.

**(h) Migration 002 atomicity: upsert loop and version bump run inside a single exclusive transaction.** ✅ Shipped in Step 13.
`runMigrations` wraps all 106 `ContentItemRepository.upsert()` calls and the `db_version='2'` write inside one `withExclusiveTransactionAsync` call. Invariant: `db_version` advances to 2 only when every row committed. A crash mid-upsert leaves `db_version=1`; on next launch, `version < 2` is true and all upserts re-run — safe because every upsert is `ON CONFLICT UPDATE` (idempotent). Covered by an explicit self-heal test in `src/db/__tests__/seed.test.ts`.

**(j) `placeholder` flag is workflow metadata, not a runtime gate — by decision.** Open — pilot readiness.
All 106 seeded items have `placeholder: true` (the field means "awaiting SME review," per `types.ts` annotation and the sign-off workflow in `CONTENT_REVIEW.md`). No filter on `placeholder` was ever specced for `findUnlocked`, `QueueBuilder`, or the session screen. Gating on it now would empty the queue entirely (all 106 items flagged) and block all development. Decision: serve placeholder content to developers and internal testers; the flag is a workflow marker for the SME pipeline, not a runtime visibility gate. Pilot readiness requires SME sign-off flipping flags to `false`, update `lastReviewedAt`, bump `contentVersion`, and re-run the suite per `CONTENT_REVIEW.md` governance. Mary's spot-check is the first entry.

**(k) Free-recall session cap + reveal-cue copy.** Shipped — UX punch list commit on `feat/review-session`.
`FREE_RECALL_CAP = 3` is an exported constant in `QueueBuilder.ts`. `buildQueue` applies it as a combined session-level filter: review free_recall entries take priority (forgetting pressure), then new items fill remaining slots up to the cap. Excess free_recall items are excluded from the returned queue — their due state in the DB is unchanged; they surface in the next session. The `FreeRecallCard` pre-reveal cue reads "Think it through, then reveal — no typing needed." See Evidence note 3.

**(l) Interleaver distribution verification when one pillar dominates the introduced pool.** Open — monitor at Step 17.
When the introduced pool is heavily skewed toward one pillar (e.g., early weeks where only one course has released content), the accumulated-credit interleaver correctly concentrates that pillar — proportional behavior, not a bug. Concern to verify at Step 17 or earlier: if skew is extreme (e.g., >80% one pillar) and exam mode adds candidates from the same pillar, the queue may feel monotone. Mitigation: the debt meter and forecast already break down load per-pillar; no code change required unless student feedback indicates fatigue. See Evidence note 4.

**(m) Opt-in topic filter; mixed default protected.** Open — scheduled for a future step.
A per-course/pillar filter (e.g., "show only pharm today") is a legitimate pre-exam study mode. When implemented it must satisfy three constraints: (1) opt-in per session — never auto-applied; (2) non-sticky — next session launches with the full mixed queue unless the student explicitly re-filters; (3) visually indicated — a persistent banner or badge must make the active filter obvious so students do not misread a narrowed queue as system behavior. See Evidence note 4.

**(n) `insertPullAhead` — formal amendment for Step 21 repo extension, announced retroactively.** ✅ Shipped in Step 21.
`ItemMemoryStateRepository.insertPullAhead(state)` was added to realize the pull-ahead tap invariant in UI. It delegates to `this.insert(this.db, state)` — the same shared SQL path used by `ReviewEventRepository.recordFirstReview()` inside its transaction; no duplicate insert logic. State is built via `SchedulerService.createInitialState(itemId, now)`, not hand-built FSRS fields. Consequence: pull-ahead introduces an item with `due = now` and `state='New'`; it arrives via `dueStates` on the next queue build as a `kind='review'` entry and bypasses `newItemCap` — consistent with the QueueBuilder contract.

**(o) Day-boundary change does not recompute stored study-day strings — known MVP limitation.** Open.
Stored strings (`lastQualifyingDate` in `ItemMemoryState`, `lastDrillDate` in the drill streak) are written under the boundary in effect at write time and are not retroactively updated when the user changes `dayBoundaryHour`. A boundary change can locally distort streak/relearn day-adjacency at the transition (e.g., a study session crossing the old cut could look consecutive or non-consecutive under the new boundary). This is acceptable for MVP; revisit if user-facing boundary editing survives to pilot. Future mitigation: rewrite stored dates in a migration function on boundary change. Until then the setting only takes effect on the next queue build; the Settings UI carries a one-line warning.

---

## Session Protocol

1. **Start:** Read `docs/PLAN.md` and `docs/PRD.md` before writing any code.
2. **Versioned docs:** Read Expo docs at `https://docs.expo.dev/versions/v57.0.0/` before writing any Expo-specific code (AGENTS.md standing instruction).
3. **Each step:** Commit with the step name when complete. Push at session boundaries minimum.
4. **FSRS arithmetic:** Never predict scheduling outcomes in your head. Write the code, run it, read actuals from the state map. Use `tickToNextDue` or equivalent whenever a test depends on when an item next becomes due.
5. **Stall protocol:** If >15 minutes of analysis with no file written, or if already-read files are being re-read, expect an interruption and a narrower prompt. Scope down and act.
6. **types.ts amendments:** Any edit to `src/domain/types.ts` must be announced in the step report as a formal amendment. It is a frozen contract; drive-by changes break the DB schema and all consumers.
7. **Test empirically:** Assertion failures get a diagnosis before any fix. If a scripting assumption collides with actual behavior (FSRS scheduling, gate arithmetic), print actuals and adjust the script — never adjust the assertion's meaning to match a wrong script.
8. **Branching (from Step 14):** Work on feature branches named `feat/<step-group>` per the build-order group assignments above. Commit per step on the branch. Push the branch at session end minimum. **Cut from up-to-date main — run `git fetch && git log origin/main` to verify the upstream tip before cutting; local main can silently lag behind.**
9. **PR merge discipline:** Merge to main only via PR, opened when the group's gates pass and the full suite (including the acceptance harness) is green. Main must always pass the full suite — anything on main is a demoable state.
10. **Docs-only changes** may commit directly to main.
