# CadenceRN — What's Next (Steps 30 and forward)

**Updated:** 2026-07-13
**Status of the build:** Steps 1–29 complete. Domain + persistence + full screen set (steps 1–25) merged; practice mode, miss-feedback, and engine-integrity fixes (interleaver, choice shuffle, queue shuffle). Steps 26–29: ADR-9 case infrastructure shipped — ContentCase schema, QueueBuilder contiguity invariant, CaseBundleCard (MatrixRenderer + DropdownSentenceRenderer), advanceBy, logical progress tracking. 437 tests green; `feat/ngn-cases` pending PR to main.

This document is a decision roadmap, not a build order. It separates **things that only need doing** from **things that need deciding first** — because the most expensive mistake available right now is authoring 112 content items before the difficulty-ramp design is settled.

---

## The one thing blocking everything: get Mary a current build

**Why it's first:** Every fix and feature of the last stretch is on `main` and none of it is on her device. She has been finding real bugs in a stale build; until she's on current code, her feedback re-treads closed ground, and the free-tier signing on her existing build expires without notice (7-day limit).

**The recipe (learned the hard way):**
1. `npx expo start --clear` — clears the Metro transform cache. Skipping this is what caused the multi-hour "shuffle isn't working" false alarm; app-delete + rebuild does **not** invalidate the JS bundle cache.
2. `npx expo run:ios --device` with her iPhone connected.
3. In setup, configure her cohort with a **past start date** for her actual current session, so the release gate opens and the queue is non-empty. A future/default start date lands her on an empty "All caught up" screen that reads as broken.

**Hand-off package:** fresh build + practice mode (new, she asked for it) + the Ch 88/89 review task (see below) + the ATI hypoglycemia NGN case (new, needs her SME review — see Track B below).

**This is not a coding task and it gates all pilot signal. Do it before anything else.**

---

## Track A — Chores (no decisions, do anytime)

These need no product decisions and can ship whenever. Small PRs.

### A1. Pillar re-tag (data quality) — **elevated priority**
Every pack except pharm and terminology is tagged `pillar: 'concepts'` — dosage, foundations, and cc2 all flattened into one pillar. Consequences:
- The practice-mode pillar filter is nearly useless (offers "Concepts" = ⅔ of everything).
- The interleaver has been proportioning against a distorted pillar distribution — this is part of why `concepts` dominates ~63% of the queue.
- Dosage in particular should be its own pillar per the PRD four-pillar model; it currently masquerades as concepts (visible as "Concepts" chip on a dosage-conversion card).

**Work:** re-tag items in the content JSON. No schema change (`pillar` field exists). Re-run seed tests. Verify the interleaver proportions shift correctly afterward.
**Note:** the PRD names four pillars (medications, procedures, terminology, concepts/patho) plus dosage as a distinct track. Decide whether dosage becomes a fifth pillar value or stays folded — that's a *small* decision, flag it before tagging.

### A2. Docs housekeeping
- **PLAN.md process notes:** (1) "merge on the diff, not the PR description" — this failed twice and cost real rework; (2) "format/scope changes to approved items are announced amendments, never silent." Add to Session Protocol #9.
- **Amendment (l) update:** note the two-level interleaver fixed within-pillar pack monotony; the ~63% concepts dominance is a content-balance reality (and will shift after A1), not a bug.
- **DEBUGGING.md (new file):** capture the two lessons that cost hours —
  1. *"When runtime contradicts merged code, clear the Metro cache (`expo start --clear`) before diagnosing. App-delete + rebuild does not invalidate the JS transform cache."*
  2. *"Before diagnosing why a feature 'doesn't work,' add a visible log and confirm it fires. If it doesn't, you're looking at the wrong screen/state, not a broken feature."*
- **GitHub setting:** enable Settings → General → "Automatically delete head branches" so merged branches self-clean.

### A3. cc2 SME review support
The 44 cc2 items are `placeholder: true`, awaiting Mary's chapter-anchored sign-off. Three items carry `_flag`s for her attention:
- **cc2-017** — calcium 1,200 mg + vitamin D 800 IU (confirm vs. ATI text)
- **cc2-029** — uric acid target <6.0 (standard) vs. ACR <5.0 for tophaceous gout
- **cc2-032** — methotrexate hold criteria (institution-variable)

**Suggested review order for Mary:** start Ch 88/89 (CT disorders) — both free-recall items and two of three flags live there, and it's Exam 1 material she just studied, so recall is freshest. Then Ch 71 (osteoporosis, cc2-017).

### A4. Add RNTL; cover case submit-gating and reveal wiring
The N-of-N submit contract is currently proven only as a pure function (`isSubmitEnabled` in `caseBundleUtils.test.ts`). Nothing proves `disabled={!isSubmitEnabled(...)}` is correctly wired in `CaseBundleCard`, and the missing-case `useEffect`-to-`advanceBy` wire in `SessionScreen` is also untestable without RNTL. Add `@testing-library/react-native` and cover: (a) submit button disabled until all rows selected, (b) reveal shown after submit, (c) `advanceBy` called by the missing-case effect.

### A5. Sticky exhibit layout
The current `CaseBundleCard` renders the exhibit and matrix in one scrolling surface; on the ATI hypoglycemia case (5-entry timeline, 6 rows) the exhibit scrolls off-screen before the student reaches row 4, whose answer depends on the 1110 "unresponsive" entry. **Approved approach:** pin the scenario + exhibit block using `stickyHeaderIndices={[0]}` on the case-path `ScrollView`; exhibit body scrollable within the pinned block; height cap ~40% viewport; tab switching must not regress selections. Read Expo SDK 57 docs before touching `ScrollView` props (per AGENTS.md).

---

## Track B — Product decisions (blocked on you, not on code)

Ranked by consequence. B1 is the big one.

### B1. The difficulty ramp — **the thesis-defining gap**
**What it is:** PRD §6.5 specifies a per-item progression: recognition → cued recall → free recall → applied scenario, escalating as an item's stability grows. The furosemide example: "which class?" (wk 1) → "which electrolyte?" (wk 3) → "K+ is 2.9, what do you do?" (month 3+).

**What exists:** nothing. `difficultyTier` is a static label fixed at authoring time. Items never escalate. What you have instead is a static *mix* (cc2 is application-dominant), which is fine for MVP but is not a ramp — a student six months in still sees tier-1 recognition on mastered facts, and a day-one student gets thrown application stems before knowing the facts they build on.

**Why it's the priority decision:** "moves from knowing the data to being able to diagnose" is the entire value proposition over Anki/Quizlet. It's also the thing that **changes how content is authored** — which is why it must be settled before authoring cc2 weeks 2–5 (B3). Author first and you rework 112 items.

**The decision that unlocks the design:** when the PRD says an item progresses through four forms, is that —
- **(i) one fact wearing four costumes** — same underlying fact, escalating question *presentation* (furosemide reading); or
- **(ii) four chained items** — separate authored items at ascending tiers, gated by stability on the prior?

**Partial resolution — ADR-9 (Step 29):** ADR-9's authoring rule establishes that *cases are the applied tier over facts that have standalone coverage*. This is effectively a commitment to design **(ii) chained items** — a case bundle is a set of authored applied-tier items whose authoring precondition is that the underlying facts are already present as standalones. That is chained authoring (separate items, gate condition), not one fact wearing four costumes. B1 is no longer a fully open fork: design (i) is off the table unless a deliberate, announced reversal. The remaining open question is the **gate condition**: when does a student's stability on the standalone items unlock the linked case bundle? That gate logic does not exist yet and is the specific B1 question that remains.

Consequences for design (ii) — already partially decided:
- Author 2–3 linked items per fact (reuse `graphLinks`) + a gate condition promoting the harder item once the easier one is stable.
- `ReleaseGate` is a precedent. Gate logic is new but uses existing structures.
- Cheaper than (i), less elegant in the PRD's framing, but coherent with what ADR-9 already built.

**Also decide:** do all facts *have* a meaningful "applied" form? Some (a lab value, an eponym) may top out at cued recall. The ramp needs a graceful "this fact's ceiling is tier 2" answer, or it forces contrived application stems.

**Next action:** a design conversation, not a prompt. The (i)/(ii) question is answered; now nail the gate condition.

### B2. Cloze-miss feedback — **decision parked pending Mary's use**
Cloze items show nothing explanatory on a miss (only the filled blank). Cloze is Mary's most common terminology format, so this is a real gap. But closing it = `types.ts` amendment (add `explanation?` to cloze body) + authoring explanations for *every* cloze item across all packs — a real content project.

**Why parked:** the diagnosis found that a lot of "understand why" was already sitting dark in `graphLinks`, now surfaced by the Related card. It's plausible the miss-visual + Related card already close most of the gap. **Let Mary use the current build for a few days before deciding.** If cloze misses still feel empty to her, do it; if not, the amendment + content pass isn't worth it.

### B3. cc2 content authoring, weeks 2–5 — **blocked by B1**
112 items: spinal cord, neuro I/II, upper/lower GI, enteral/parenteral, hepatobiliary, renal I/II, reproductive. The topic map is already verified against the ATI 12.0 TOC — no new scans needed; authoring is from clinical knowledge scoped by chapter, per CONTENT-PLAN §1.

**Do not start until B1 is decided.** If the ramp lands on design (ii), these 112 items must be authored to that pattern or they get reworked. Pair this session with A1 (pillar re-tag) since both touch content files.

### B4. Pre-start empty-queue UX
A fresh user who enters their real cohort start date — which for an upcoming session is *in the future* — sees an empty "All caught up" app on day one. This is the PRD's "pre-start admit" persona, currently unserved. Options: show a "your program starts in N days" state, or surface start-agnostic content (terminology, dosage drills) pre-start. **Log it, don't build it yet** — it's real but not pilot-blocking while Mary's cohort is active.

### B5. Amendment (m) — opt-in topic filter on the *scheduled* queue
Distinct from practice mode: (m) filters what's *due* ("only pharm today"), non-sticky, banner-indicated. Practice mode filters items *ignoring* due-ness. They're genuinely separate features. Whether (m) still needs building depends on whether practice mode covers Mary's "focus" need. **Defer until her practice-mode feedback is in.**

### B6. ORDER BY fsrs_due — learning-priority ordering
Deliberately deferred during the shuffle work. Ordering the due set "most-forgotten first" within a session is a scheduling-philosophy choice, not obviously correct (FSRS already picks *what's* due). Its own small decision; low urgency.

---

## Track B — SME flags for Mary (Step 29 dev fixture)

All six rows of `dev-case-hypoglycemia` (`bootstrapDevFixtures` in `runner.ts`) are placeholder content reconstructed from a pilot-user photograph of an ATI assessment item. None should be promoted to a versioned content pack without Mary's sign-off.

- **dev-hypo-row-1:** Regular insulin IV → Contraindicated
- **dev-hypo-row-2:** Glucagon IM → Anticipated
- **dev-hypo-row-3:** Call EMS for transport to nearest E.R. → Anticipated
- **dev-hypo-row-4:** Provide client with oral glucose tablets → Contraindicated *(temporal turn: oral was correct at 1030 when client was conscious and glucose was 50 mg/dL; contraindicated by 1110 when client is unresponsive — aspiration risk. This row tests whether the student applies the 1030 or 1110 clinical state.)*
- **dev-hypo-row-5:** D₅W IV → Anticipated
- **dev-hypo-row-6:** IV for hydration → Anticipated

---

## Recommended sequence

1. **Mary's build** (tonight/tomorrow) — unblocks all pilot signal. Not code.
2. **A5 sticky exhibit** — one approved layout change before the `feat/ngn-cases` PR goes to main; suite must stay green.
3. **Open the `feat/ngn-cases` PR** — after sticky exhibit and suite green.
4. **B1 gate-condition conversation** — the (i)/(ii) fork is closed by ADR-9; now decide the gate. Unblocks 112 items.
5. **A1 + B3 together** — pillar re-tag + author cc2 weeks 2–5 to the ramp pattern, same content session.
6. **A4 RNTL** — add testing infrastructure; cover case submit-gating and useEffect wire.
7. **A2 docs housekeeping** — ride along whenever; clears the trivial pins.
8. **Reassess B2/B5** once Mary's used practice mode + miss-feedback for a few days — her use decides these, not armchair reasoning.
9. **B4, B6** — log and defer; revisit when pilot data warrants.

The through-line: **Mary's actual use drives priority from here.** Three of the last engine bugs came from her, not the test suite. Keep her on current code and let what she hits decide what's next — the speculative features (B2, B5) should wait for that signal rather than being built on a guess.
