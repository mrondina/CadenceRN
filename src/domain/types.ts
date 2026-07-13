// ─── Primitives ───────────────────────────────────────────────────────────────

export type Pillar = 'pharm' | 'procedures' | 'terminology' | 'concepts' | 'dosage';

export type ItemFormat = 'cloze' | 'mcq' | 'free_recall' | 'numeric' | 'sequence' | 'matrix_row' | 'dropdown_blank';

/** FSRS internal card state. 'New' means never rated. */
export type FsrsState = 'New' | 'Learning' | 'Review' | 'Relearning';

export type ReviewMode = 'daily' | 'exam' | 'drill';

/** 1=Again 2=Hard 3=Good 4=Easy — matches ts-fsrs Rating enum values. */
export type Rating = 1 | 2 | 3 | 4;

// ─── Program structure ────────────────────────────────────────────────────────

export interface Cohort {
  id: string;            // UUIDv7
  startDate: string;     // ISO date YYYY-MM-DD
  templateId: string;    // e.g. 'bellarmine-absn-v1'
  sessions: SessionInstance[];
  createdAt: string;     // ISO datetime
  updatedAt: string;
}

export interface SessionInstance {
  id: string;
  cohortId: string;
  sessionIndex: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;         // e.g. 'Summer A'
  startDate: string;     // ISO date
  endDate: string;
  courses: CourseInstance[];
  updatedAt: string;
}

export interface CourseInstance {
  id: string;
  sessionId: string;
  title: string;         // e.g. 'Applied Pharmacology'
  contentPackIds: string[];
  examDates: string[];   // ISO dates; may be empty
  updatedAt: string;
}

// ─── Graph links ──────────────────────────────────────────────────────────────

/**
 * Typed link from one ContentItem to another via the difficulty-ramp chain.
 * Points from a lower tier to the NEXT tier (tier1→tier2→tier3).
 * When this link exists on item N, item N+1's itemId is targetId.
 */
export interface RampChainLink {
  linkType: 'rampChain';
  targetId: string;  // itemId of the next tier in the chain
}

/**
 * A graph link is either a plain item ID (conceptual association, used by
 * RelatedCard) or a typed RampChainLink (chain-tier pointer, used by ChainGate).
 * All existing content uses plain strings; chain content adds RampChainLink entries.
 */
export type GraphLink = string | RampChainLink;

// ─── Content ──────────────────────────────────────────────────────────────────

/** When content becomes available to the user. */
export interface ReleaseGate {
  sessionIndex: number;  // 1–6
  week: number;          // 1-based within the session
}

export type ItemBody =
  | {
      type: 'cloze';
      front: string;    // sentence with {{blank}} marker
      back: string;     // the hidden word/phrase
      hint?: string;
    }
  | {
      type: 'mcq';
      stem: string;
      choices: { id: string; text: string }[];
      correctId: string;
      explanation: string;
    }
  | {
      type: 'free_recall';
      prompt: string;
      rubric: string[];      // scoring criteria shown after reveal
      modelAnswer: string;
    }
  | {
      type: 'numeric';
      problem: string;
      answer: number;
      unit: string;
      tolerance: number;     // acceptable ± error (same unit as answer)
      workingSteps?: string[];
    }
  | {
      type: 'sequence';
      prompt: string;
      steps: { id: string; text: string }[];
      correctOrder: string[]; // ordered step ids
    }
  | {
      type: 'matrix_row';
      rowLabel: string;
      correctColumn: number;
      rationale: string;
    }
  | {
      type: 'dropdown_blank';
      blankIndex: number;
      options: string[];
      correctIndex: number;
      rationale: string;
    };

export interface ContentItem {
  id: string;            // UUIDv7, stable across content versions
  pillar: Pillar;
  format: ItemFormat;
  difficultyTier: 1 | 2 | 3 | 4;  // recognition → cued → free → applied
  body: ItemBody;
  sourceCitation: string;
  lastReviewedAt: string; // ISO date — content QA date, not user review date
  highAlert: boolean;     // true for medications requiring heightened caution
  graphLinks: GraphLink[];  // conceptual associations (string IDs) and/or chain-tier pointers
  releaseGate: ReleaseGate;
  contentPackId: string;
  contentVersion: number;
  placeholder: boolean;     // true = awaiting SME review; queryable in SQLite
  rampTier?: 1 | 2 | 3;    // absent on standalone items (the overwhelming majority)
  caseId: string | null;    // null for standalone items; set for NGN case-row items
  caseOrder: number | null; // position within the case (1-based), null for standalone items
}

// ─── NGN case container ───────────────────────────────────────────────────────

/**
 * presentationData for 'matrix': columns are the column headers of the ATI
 * matrix grid (e.g. ['Anticipated', 'Contraindicated']).
 * presentationData for 'dropdown_sentence': template is the sentence with
 * {{1}}, {{2}} … blank markers corresponding to dropdown_blank row indices.
 */
export interface MatrixPresentationData {
  columns: string[];
}

export interface DropdownPresentationData {
  template: string; // sentence with {{1}}, {{2}} ... blank markers
}

/**
 * Presentation container for a grouped NGN item set (ATI matrix/grid or
 * drop-down cloze). The case is the presentation unit; its rows (ContentItems
 * with caseId set) are the memory units. A ContentCase never carries an
 * ItemMemoryState — see invariant in PLAN.md amendment (s).
 *
 * session and week mirror the rows' releaseGate.sessionIndex / week:
 * they are redundant denormalisation for navigation/filtering only.
 */
export interface ContentCase {
  caseId: string;
  session: number;             // 1–6, matches ContentItem.releaseGate.sessionIndex
  week: number;
  courseSlug: string;
  pillar: Pillar;
  scenario: string;
  exhibits: { label: string; title: string; body: string }[];
  prompt: string;
  presentation: 'matrix' | 'dropdown_sentence';
  presentationData: MatrixPresentationData | DropdownPresentationData;
  sourceCitation: string;
  contentVersion: number;
  placeholder: boolean;
  lastReviewedAt: string | null; // null until SME review; matches placeholder workflow
}

// ─── Learning state ───────────────────────────────────────────────────────────

/**
 * Mirrors ts-fsrs Card fields; stored as columns in item_memory_states.
 *
 * lastReview is required by ts-fsrs get_retrievability() to compute elapsed
 * days correctly. Without it the forgetting curve calculation is wrong for
 * cards in Learning/Review state. Must round-trip through SQLite.
 *
 * learningSteps is the current step index in the short-term learning sequence
 * (default steps: 1m, 10m). Required for ts-fsrs to place a card correctly
 * within the step progression after a suspend/resume cycle.
 */
export interface FsrsCardState {
  stability: number;
  difficulty: number;
  due: string;            // ISO datetime
  state: FsrsState;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;  // ts-fsrs Card.learning_steps
  reps: number;
  lapses: number;
  lastReview?: string;    // ISO datetime; ts-fsrs Card.last_review (optional on New cards)
}

/**
 * Persisted learning record for one (user, item) pair.
 * Invariant: a row exists here if and only if the item has been introduced —
 * either by explicit pull-ahead tap or by the first actual review rating.
 * Items queued but not yet rated have NO row here.
 */
export interface ItemMemoryState {
  itemId: string;
  fsrs: FsrsCardState;
  relearnStreak: number;  // 0..N; qualifies only on Good/Easy at separate study days
  graduated: boolean;     // true once relearnStreak reaches RELEARN_GRADUATION_N (3)
  lastQualifyingDate: string | null;  // ISO datetime of most recent qualifying Good/Easy review; null until first
  updatedAt: string;      // ISO datetime
}

// ─── Review events (append-only) ─────────────────────────────────────────────

/**
 * Append-only review event. Never updated after insertion.
 *
 * Pre-review snapshot convention (stabilityBefore, difficultyBefore, dueBefore):
 * For a kind='new' first review, record the synthetic initial state's values,
 * NOT nulls. This makes every row in the log self-describing: a replay tool
 * can reconstruct the full scheduling history without special-casing review #1.
 * Because the log is append-only and cannot be retroactively repaired, this
 * convention must be enforced at write time by ReviewEventRepository.recordFirstReview().
 */
export interface ReviewEvent {
  id: string;             // UUIDv7 (time-ordered for sync ordering)
  itemId: string;
  ts: string;             // ISO datetime of the rating
  rating: Rating;
  latencyMs: number;      // card-reveal to rating tap
  mode: ReviewMode;
  // FSRS state snapshot before this review — for parameter re-optimization.
  // Always populated, including on first review (use synthetic initial values).
  stabilityBefore: number;
  difficultyBefore: number;
  dueBefore: string;      // ISO datetime
}

// ─── Queue ────────────────────────────────────────────────────────────────────

/**
 * The in-memory initial FSRS state synthesized by QueueBuilder for items
 * entering the queue for the first time. NOT persisted until the first rating.
 *
 * Invariant: if a session is abandoned before a new-item card is reached,
 * the SyntheticItemState is discarded, no ItemMemoryState is written,
 * and the item reappears as a new candidate in the next session.
 */
export interface SyntheticItemState {
  itemId: string;
  // stability=0, difficulty=0, state='New', learningSteps=0, lastReview=undefined
  // Values match ts-fsrs createEmptyCard() output exactly.
  fsrs: FsrsCardState;
  relearnStreak: 0;
  graduated: false;
}

/**
 * One entry in the session queue.
 *
 * kind='review' — item has a persisted ItemMemoryState; SchedulerService
 *   will UPDATE the row after rating.
 *
 * kind='new' — item has never been rated; the first rating triggers an atomic
 *   transaction that INSERTs both the ReviewEvent and the initial ItemMemoryState.
 *   Uses syntheticState (not from DB) so QueueBuilder needs no DB write.
 */
export type QueueEntry =
  | {
      kind: 'review';
      item: ContentItem;
      memoryState: ItemMemoryState;
      mode: ReviewMode;
    }
  | {
      kind: 'new';
      item: ContentItem;
      syntheticState: SyntheticItemState;
      mode: ReviewMode;
    };

// ─── Scheduler ────────────────────────────────────────────────────────────────

export interface ScheduleResult {
  nextState: FsrsCardState;
  scheduledDays: number;
  retrievability: number;  // 0..1 estimated at next due date
}

export interface ISchedulerService {
  /**
   * Compute the next FSRS card state after a rating.
   * enable_fuzz MUST be false (enforced at construction) — determinism invariant.
   */
  schedule(
    current: FsrsCardState,
    rating: Rating,
    reviewedAt: Date,
    desiredRetention?: number,  // default 0.90
  ): ScheduleResult;

  /** Estimated retrievability of a card at the given moment. */
  getRetrievability(state: FsrsCardState, now: Date): number;

  /**
   * Predicted retrievability at a future date — used by ExamModeCompressor
   * to identify cards that will fall below the target before the exam.
   */
  predictRetrievability(state: FsrsCardState, at: Date): number;

  /** Synthesize the initial FsrsCardState for a brand-new item. */
  createInitialState(itemId: string, now: Date): FsrsCardState;
}

// ─── Queue builder ────────────────────────────────────────────────────────────

export interface IQueueBuilder {
  /**
   * Builds the ordered session queue.
   *
   * dueStates      — items with persisted MemoryState whose fsrs_due ≤ now.
   *                  Includes pull-ahead items (introduced earlier, due: now).
   *                  Pull-ahead items bypass newItemCap — user explicitly requested them.
   *
   * examCandidates — items selected by ExamModeCompressor.getCandidates();
   *                  injected with mode:'exam'. Deduped against dueStates by itemId;
   *                  exam mode wins when an item appears in both.
   *
   * allItems       — ContentItem lookup for dueStates + examCandidates. Caller
   *                  (useQueue) builds this map from ItemRepository. Required because
   *                  MemoryState carries only itemId, not the full ContentItem.
   *
   * newItems       — ContentItems with NO persisted MemoryState (gate satisfied).
   *                  Capped at newItemCap, sorted by (sessionIndex, week, id) so
   *                  curriculum order is preserved and selection is deterministic.
   *                  Sequence-format items are excluded from all three streams (Phase 2).
   */
  buildQueue(params: {
    dueStates: ItemMemoryState[];
    examCandidates: ItemMemoryState[];
    allItems: Map<string, ContentItem>;
    newItems: ContentItem[];
    newItemCap: number;
    now: Date;
    /** Complete ItemMemoryState map from the repository — required for correct
     *  ChainGate evaluation. A tier-N item that is stable but not due must still
     *  unblock its tier-(N+1) successor; a tier-(N+1) introduction must retire
     *  tier-N even when tier-N is not in the current due set. */
    allKnownStates: ItemMemoryState[];
  }): QueueEntry[];
}

// ─── Relearning pipeline ──────────────────────────────────────────────────────

export interface RelearningResult {
  streak: number;
  graduated: boolean;
  lastQualifyingDate: string | null;  // ISO datetime of most recent Good/Easy review
}

export interface IRelearningPipeline {
  /**
   * Advance or reset the relearn streak based on a rating.
   *
   * Qualifying rating: Good (3) or Easy (4) on a study-day different from
   * lastQualifyingDate (using DateBoundaryConfig).
   * Hard (2): neutral — neither advances nor resets the streak.
   * Again (1): resets streak to 0.
   * Graduation: streak reaches RELEARN_GRADUATION_N (3).
   */
  processRating(params: {
    currentStreak: number;
    graduated: boolean;
    rating: Rating;
    reviewDate: Date;
    lastQualifyingDate: string | null;
    boundaryConfig: DateBoundaryConfig;
  }): RelearningResult;
}

/** Number of successful spaced retrievals required to graduate an item. */
export const RELEARN_GRADUATION_N = 3;

/**
 * Minimum FSRS stability (days) a tier-N item must reach — in addition to
 * graduation — before its tier-(N+1) successor is admitted to scheduling.
 */
export const CHAIN_PROMOTION_STABILITY_DAYS = 7;

// ─── Exam mode ────────────────────────────────────────────────────────────────

export interface ActiveExam {
  courseId: string;
  courseTitle: string;
  examDate: string;       // ISO date
  daysRemaining: number;
}

export interface IExamModeCompressor {
  /**
   * Returns elevated desired_retention (0.95) when today falls within the
   * compression window for the given course, else baseline (0.90).
   */
  getRetention(params: {
    courseId: string;
    examDates: string[];
    now: Date;
    windowDays?: number;  // default 10
  }): number;

  /**
   * Returns ItemMemoryStates for course items whose predicted retrievability
   * at examDate is below targetRetention. These are pulled into the queue
   * as early reviews (mode:'exam').
   *
   * Exclusions:
   *  - Items whose natural fsrs_due is already ≤ now (in dueStates; dedup there)
   *  - Items not in courseItemIds
   *  - Items with state='New' (no stability to compute against)
   */
  getCandidates(params: {
    states: ItemMemoryState[];
    courseItemIds: Set<string>;
    examDate: Date;
    now: Date;
    targetRetention: number;  // e.g. 0.95
  }): ItemMemoryState[];

  /** Returns the earliest active exam within any window, for UI display. */
  getActiveExam(
    courses: CourseInstance[],
    now: Date,
    windowDays?: number,
  ): ActiveExam | null;
}

// ─── Debt forecaster ──────────────────────────────────────────────────────────

export interface DayForecast {
  date: string;           // ISO date (study-day adjusted)
  dueCount: number;       // natural dues + exam candidates on day 0
  isWarning: boolean;     // dueCount > 1.5× rolling 7-day median
  isExamWindow: boolean;  // date falls within an active exam compression window
}

export interface ForecastParams {
  states: ItemMemoryState[];
  now: Date;
  days?: number;                       // default 7
  boundaryConfig: DateBoundaryConfig;
  examCandidates?: ItemMemoryState[];  // added to day-0 bucket when window is active
  activeExam?: ActiveExam | null;      // drives isExamWindow annotation
  excludeRetiredIds?: ReadonlySet<string>; // retired chain-tier items; excluded from counts
}

export interface IDebtForecaster {
  /**
   * Projects daily review load for the next N days.
   *
   * Day-0 bucket = natural dues today + examCandidates (if provided).
   * Warning threshold applied to combined count.
   * Future window days: natural dues only; isExamWindow annotated.
   */
  forecast(params: ForecastParams): DayForecast[];
}

// ─── Date boundary ────────────────────────────────────────────────────────────

/**
 * Study-day boundary configuration.
 * Stored in app_state as 'day_boundary_hour'; default 4 (4am local time).
 * Used consistently by RelearningPipeline, DebtForecaster, and streak tracking
 * to prevent phantom day-breaks for students studying past midnight.
 */
export interface DateBoundaryConfig {
  hourOffset: number;  // 0–23; sessions starting before this hour count as previous day
}

export const DEFAULT_DAY_BOUNDARY: DateBoundaryConfig = { hourOffset: 4 };

// ─── Notifications (stub — Phase 2 wiring) ───────────────────────────────────

export interface ProposedReminder {
  scheduledFor: string;   // ISO datetime
  reason: 'daily_review' | 'debt_warning' | 'exam_approaching';
  estimatedDue: number;   // item count at scheduled time
}

export interface INotificationPlanner {
  /**
   * Given a forecast and active exam windows, propose reminder times.
   * Stub returns []; Phase 2 implements with expo-notifications without
   * changing this interface or its callers.
   */
  propose(
    forecast: DayForecast[],
    activeExams: ActiveExam[],
    now: Date,
  ): ProposedReminder[];
}

// ─── Chain gate ───────────────────────────────────────────────────────────────

export type ChainGateStatus = 'active' | 'locked' | 'retired';

export interface IChainGate {
  /**
   * Evaluates an item's position within its difficulty-ramp chain.
   *
   * 'active'  — item may be introduced or reviewed normally. All standalone items
   *             (no rampTier) return 'active' via a fast-path, adding no per-item
   *             cost to the current all-standalone content set.
   *
   * 'locked'  — tier N+1 whose tier-N predecessor has NOT yet met the promotion
   *             gate (graduated AND stability ≥ CHAIN_PROMOTION_STABILITY_DAYS).
   *             Locked items are never introduced as new candidates.
   *
   * 'retired' — tier N whose tier-N+1 successor has been introduced (has any
   *             ItemMemoryState). Retired items are excluded from the due set and
   *             from ExamModeCompressor candidates. Their FSRS state is preserved.
   *
   * @param allStates Complete ItemMemoryState map from the repository — not merely
   *   the current due/exam subset. A tier-N item that is stable but not currently
   *   due must still unlock tier-(N+1); a tier-(N+1) introduction must retire
   *   tier-N even when tier-N has not surfaced as due.
   */
  check(item: ContentItem, allStates: Map<string, ItemMemoryState>): ChainGateStatus;
}

// ─── Release gate ─────────────────────────────────────────────────────────────

export type ReleaseGateStatus = 'unlocked' | 'locked' | 'pull-ahead-available';

export interface IReleaseGate {
  /**
   * Evaluates whether a content item is available in the current cohort state.
   *
   * 'unlocked'             — gate satisfied; item can enter new-item queue.
   * 'locked'               — gate not yet satisfied; item is invisible to user.
   * 'pull-ahead-available' — one session ahead of current; user may explicitly
   *                          unlock by tapping "pull ahead" in This Week view,
   *                          which immediately creates the ItemMemoryState.
   */
  check(item: ContentItem, cohort: Cohort, now: Date): ReleaseGateStatus;
}

// ─── Cohort builder ───────────────────────────────────────────────────────────

export interface ICohortBuilder {
  /**
   * Generates a full Cohort with six SessionInstances from a start date and
   * template. Session dates are calculated from template week lengths.
   */
  build(params: {
    id: string;
    startDate: Date;
    templateId: string;
  }): Cohort;

  /**
   * Returns a new Cohort with updated session dates. Never mutates FSRS state —
   * only re-gates new-content release windows.
   */
  applySessionDateEdit(
    cohort: Cohort,
    sessionIndex: number,
    newStartDate: Date,
    newEndDate: Date,
  ): Cohort;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Thrown by the review session card router when a sequence-format item reaches
 * the renderer. Caught by the session error boundary, logged for analytics,
 * and surfaced as a graceful skip. Sequence cards are Phase 2 (Procedures).
 */
export class UnsupportedCardFormatError extends Error {
  constructor(
    public readonly format: ItemFormat,
    public readonly reason: string,
  ) {
    super(`Card format '${format}' is not supported: ${reason}`);
    this.name = 'UnsupportedCardFormatError';
  }
}

// ─── Dosage drill ─────────────────────────────────────────────────────────────

/**
 * Append-only drill result. Never updated after insertion.
 * Separate from the FSRS queue — dosage drills are a standalone skill track
 * with correct/incorrect logging only (no spaced-repetition scheduling).
 */
export interface DrillResult {
  id: string;             // UUIDv7
  itemId: string;
  ts: string;             // ISO datetime
  correct: boolean;
  latencyMs: number;
  userAnswer: string;     // raw numeric input, preserved for post-session review
}

/**
 * Drill streak state held in the store and persisted in app_state.
 * Streak counts consecutive correct drill sessions (boundary-adjusted days),
 * not individual items — consistent with the recovery-friendly streak design.
 */
export interface DrillStreak {
  currentStreak: number;
  longestStreak: number;
  lastDrillDate: string | null;  // ISO date (study-day adjusted); null if never drilled
}

// ─── Repository transaction types ────────────────────────────────────────────

/**
 * Input to ReviewEventRepository.recordFirstReview().
 * The repository executes both writes in a single SQLite transaction so that
 * a crash between them cannot leave an orphaned event or a MemoryState without
 * a corresponding event.
 */
export interface FirstReviewTransaction {
  event: ReviewEvent;
  initialMemoryState: ItemMemoryState;
}

// ─── Case review transaction (amendment t) ───────────────────────────────────

/**
 * One row in an atomic case submission (amendment t).
 * kind='first': item is new — INSERT event + INSERT state (first introduction).
 * kind='update': item already introduced — INSERT event + UPDATE state.
 */
export type CaseRowWrite =
  | { kind: 'first'; event: ReviewEvent; initialMemoryState: ItemMemoryState }
  | { kind: 'update'; event: ReviewEvent; updatedMemoryState: ItemMemoryState };

/**
 * Input to ReviewEventRepository.recordCaseReview().
 * All N rows commit in a single exclusive transaction — all or none.
 * Invariant: rows.length must equal the number of answered case rows;
 * processCaseRating() enforces this guard before calling recordCaseReview().
 */
export interface CaseReviewTransaction {
  rows: CaseRowWrite[];
}
