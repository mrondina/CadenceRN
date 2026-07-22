# Next Content — B1 Decision Record & Interleaved Authoring Sequence

**Created:** 2026-07-11
**Decides:** NEXT.md B1 (difficulty ramp) · unblocks B3 (cc2 weeks 2–5, 112 items) and `s4-mental-health` authoring (216 items)
**Peer docs:** `docs/PLAN.md`, `docs/CONTENT-PLAN.md`, `content/topic-map/s4-complex-care-2.md`, `content/topic-map/s4-mental-health.md`

---

## 1. B1 Decision Record — design (ii), chained items

**Decision (2026-07-11):** the difficulty ramp is implemented as **chained separate items**, not multi-body items.

**Rationale (summary):** FSRS models one cue→response pair; separate items per tier keep stability estimates honest (a miss on an applied stem must not reset a fact whose recognition form is intact, and recognition stability must not inflate predicted retrievability for the applied form — both would silently corrupt the debt meter and exam compressor under design (i)). Migration cost is asymmetric: the 44 shipped cc2 items need zero rework under (ii) — they become the application tier of chains whose lower tiers are authored later. Authoring is incremental, which the dual-course exam calendar demands.

### Sub-rules (locked with the decision)

1. **Chains are opt-in per fact.** Only high-yield facts get chains — as a starting heuristic, the free-recall-candidate topics already flagged in both topic maps (cc2: CT disorders, spinal cord, stroke/ICP, cirrhosis/hepatitis, AKI/CKD; MH: therapeutic relationships, trauma/crisis, mood/suicide, personality, substance-use, eating disorders). Everything else stays a standalone item at its authored tier.
2. **Chain shape:** 2–3 items per chained fact — tier-1 recognition/cloze → tier-2 cued recall → tier-3 application stem or free-recall. Some facts top out at tier 2; that is a valid chain.
3. **No target inflation.** Chain tiers are authored *within* each topic's existing `item_count_target` (216 MH / 156 cc2 totals stand). A chained fact spends 2–3 of the topic's item budget instead of 1.
4. **Promotion gate:** tier N+1 enters scheduling only when tier N has graduated relearning (3 study days, existing `RELEARN_GRADUATION_N`) **and** tier N stability ≥ 7 days. Reuses graduation machinery; gate check parallels `ReleaseGate`.
5. **Retirement rule:** when tier N+1 is introduced, tier N is retired — excluded from scheduling, FSRS state preserved (for audit and potential demotion later). Without this, chains ~2× daily load.
6. **Linkage:** chain membership rides `graphLinks` with a new link type (`rampChain`) plus a `tier` marker. **This touches `types.ts` (frozen contract) — announced amendment required before implementation, per Session Protocol.**

### Draft amendment text (for PLAN.md)

> **Amendment (n) — Difficulty ramp, design (ii):** `types.ts` gains a `rampChain` graphLink type and per-item `rampTier?: 1 | 2 | 3`. New `ChainGate` module (pattern: `ReleaseGate`) admits tier N+1 when tier N is graduated and stability ≥ 7d, and retires tier N on promotion (excluded from `QueueBuilder` due-set, state preserved). No change to FSRS state semantics; one state per item.

### Engineering prerequisite (small, before or alongside first batch)

- `ChainGate` + retirement exclusion + tests.
- **Pair with A1 pillar re-tag** (NEXT.md) — same content-file session. Settle the small A1 sub-decision first: dosage as fifth pillar value vs. stays folded.
- Chains degrade gracefully: until `ChainGate` ships, tier-1 items simply schedule as normal standalone items — authoring is not blocked on the engineering.

---

## 2. Authoring sequence — interleaved, curriculum order

**Decisions:** interleave both courses (amendment-(l) skew watch); author in **curriculum order**, not exam-first. Accepted consequence: MH module exams on 07/16 and 07/23 arrive before their topics are authored — MH coverage serves the ATI proctored (08/06) and cumulative final (08/14), not each weekly exam. cc2's curriculum order happens to align with its exam order, so cc2 exams *are* served on time.

### Combined exam calendar

| Date | Assessment | Feeds from batch |
|------|------------|------------------|
| 07/16 | MH Exam 2 (anxiety/trauma/mood) | — (pre-dates coverage; accepted) |
| 07/21 | cc2 Exam 2 (spinal cord, neuro) | Batch 2 |
| 07/23 | MH Exam 3 (psychosis/somatic/personality) | — (accepted) |
| 07/30 | MH Exam 4 (neurocog/grief/substance) | Batch 8 (partial runway) |
| 08/04 | cc2 Exam 3 (GI, enteral/parenteral, hepatobiliary) | Batches 4, 6 |
| 08/06 | MH ATI Proctored | All MH batches |
| 08/13 | cc2 Final (renal, reproductive) | Batch 9 |
| 08/14 | MH Final + ATI 2nd attempt | All |

### Batch order

| # | Course | Topic-map rows | Items | Target author date | Serves |
|---|--------|----------------|-------|--------------------|--------|
| 1 | MH | Week 1 — foundations, theories, nursing process, psychopharm basics | 40 | 07/12–13 | ramp base; ATI + final |
| 2 | cc2 | Wk 2 spinal cord + wk 3 neuro I & II | 38 | 07/14–15 | **cc2 Exam 2 (07/21)** |
| 3 | MH | Week 2 + 2–3 rows — settings, legal/ethical, therapeutic rel., abuse/violence, stress, sexual dysfunction | 50 | 07/16–18 | ATI + final (Exam 1 material) |
| 4 | cc2 | Wk 3 upper + lower GI | 22 | 07/20 | **cc2 Exam 3 (08/04)** |
| 5 | MH | Week 3 — anxiety/OCD, trauma/crisis, mood/suicide | 38 | 07/22 | ATI + final |
| 6 | cc2 | Wk 4 enteral/parenteral + hepatobiliary | 20 | 07/24 | **cc2 Exam 3 (08/04)** |
| 7 | MH | Week 4 — psychosis, somatic/dissociative, personality | 32 | 07/25–27 | ATI + final |
| 8 | MH | Week 5 — neurocognitive, grief, substance | 28 | 07/28 | MH Exam 4 (07/30, thin runway) + ATI |
| 9 | cc2 | Wk 5 renal I/II + reproductive | 32 | 07/30–31 | **cc2 Final (08/13)** |
| 10 | MH | Week 6 — disruptive, eating, neurodevelopmental | 28 | 08/01–03 | **ATI Proctored (08/06)** |

**Total: 328 items in ~3.5 weeks (~2–3 batches/week).** This is aggressive — the cc2 week-1 batch (44 items) took one full session, so it's feasible but has no slack.

**If pace slips, cut in this order:** Batch 3 first (its exam already passed; it only feeds cumulative review), then trim `item_count_target` on recognition-heavy MH rows. Never cut batches 2, 6, 9 — each is the sole coverage for an upcoming cc2 exam.

### Scheduling reality notes

- **Late-authored items won't surface as exam candidates.** `ExamModeCompressor` excludes New-state items, correctly. Runway between authoring and exam is what makes items useful; where runway is thin (Batch 8 → MH Exam 4), practice mode is Mary's vehicle, not the scheduled queue.
- **Release gates:** both courses' cohort weeks are past the map weeks being authored through mid-plan, so gates are open as batches land. Batch 10 (MH week 6) unlocks 08/03 — matches its author date.
- **Amendment-(l) skew:** alternating batches keeps neither course dominating Mary's introduced pool; the debt meter's per-pillar breakdown is the check. A1 re-tag makes that breakdown meaningful — another reason it rides with the first content session.

---

## 3. Non-blocking open items (proceed without)

1. **MH ATI chapter numbers (map Open Item 2):** ATI Engage module titles are the syllabus's own unit of record — author against them now; backfill `source.chapter` when Mary photographs her Review Module TOC. Ask when handing her the fresh build.
2. **Otterbein casebook (Open Item 4):** two-minute question for Mary; until then the case names remain scenario anchors only, no fabricated citations.
3. **Continuum-of-treatment scope (Open Item 3):** confirm lecture-slide coverage with Mary before Batch 3; if unresolved, hold that row's 6 items and proceed with the rest of the batch.
4. **cc2 SME flags (cc2-017/029/032):** unchanged — Mary's chapter-anchored review, Ch 88/89 first.

## 4. Immediate next actions

1. Mary's fresh build (NEXT.md item 1) — still gates all pilot signal; bundle the ATI-TOC-photo and Otterbein questions into the hand-off.
2. Log Amendment (n) in PLAN.md; update both topic maps' status headers to lift the authoring hold (B1 settled 2026-07-11).
3. One Claude Code session: `ChainGate` + A1 pillar re-tag (decide dosage-pillar sub-question first).
4. Batch 1 (MH week 1, 40 items) — first authoring session, to the chain pattern.
