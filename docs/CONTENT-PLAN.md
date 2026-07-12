# CadenceRN — Content Phase Charter

**Status:** Active  
**Last updated:** 2026-07-08  
**Peer document:** `docs/PLAN.md`

A new content session should read this file before authoring or reviewing any item. Every topic-map row drives a `content/topic-map/` file update; every signed-off chapter unlocks a content pack commit.

---

## 1. Strategy

**One course at a time, starting with Mary's current course.** The pilot cohort's active session determines coverage priority — not Session 1 as a default. If Mary is mid-session 2, session 2's course content ships first; session 1 content is backfill.

**The syllabus is the primary source for week-to-chapter mapping.** The syllabus IS the `releaseGate` data — it defines which week unlocks which topic in `ReleaseGate.check()`. Syllabus PDFs are authoritative for:
- Course-to-session assignment
- Week-by-week topic sequence
- Exam dates (used as `ExamModeCompressor` inputs)

**Textbook TOCs are sourced from public listings by ISBN, not transcribed.** Chapter titles and numbers are keyed from the ISBN record (publisher website, Google Books, WorldCat) and recorded in the topic map as `source.book + source.chapter`. Full text is never copied; textbooks are ground truth for facts and coverage scope, never for wording.

**Every card is original authorship.** Source citations are chapter-level (`sourceCitation: "Potter & Perry 9e ch. 12"`), not quotations. Clinical accuracy derives from the referenced chapter; sentence construction is original. This is both a copyright requirement and a quality requirement — item wording optimized for retrieval beats wording optimized for reading.

---

## 2. Topic Map Schema

One file per course under `content/topic-map/`. Each file is a Markdown table with one row per topic unit (one topic unit ≈ one week's primary subject matter; a week may have multiple rows if it covers distinct subjects).

### File naming

`content/topic-map/<session-id>-<course-slug>.md`

Examples:
- `content/topic-map/s1-terminology.md`
- `content/topic-map/s1-foundations.md`
- `content/topic-map/s1-pharm.md`
- `content/topic-map/s2-pathophysiology.md`

### Row schema

| Column | Values / Notes |
|--------|----------------|
| `session` | `s1` – `s6` |
| `course` | Course slug (e.g., `pharm`, `foundations`, `patho`, `complex-care-1`) |
| `week` | 1–8 |
| `topic` | Short topic label (e.g., "ACE inhibitors", "Oxygenation assessment") |
| `source.book` | Short title + edition (e.g., "Potter & Perry 9e") |
| `source.chapter` | Chapter number + title |
| `methods` | Comma-separated list of question methods assigned to this topic (see below) |
| `item_count_target` | Planned number of items for this topic |
| `item_count_drafted` | Actual items drafted |
| `status` | `unmapped` → `drafted` → `SME-reviewed` → `shipped` |

### Method assignment rules

Follow PLAN.md Evidence Notes for format selection:

| Situation | Method |
|-----------|--------|
| New fact, terminology, classification | `recognition` / `MCQ` |
| Specific value or named relationship | `cloze` |
| Clinical decision ("patient X, what do you do?") | `application-stem MCQ` |
| High-yield item with stability > 30 days | `free-recall` (rationed — see cap below) |
| Dosage, lab values, calculations | `numeric` |
| Phase 3 only: six-skill clinical reasoning | `NGN-case` |

**Free-recall cap:** `FREE_RECALL_CAP = 3` items per session (constant in `QueueBuilder.ts`). Author packs so that free-recall items are ≤ `FREE_RECALL_CAP / 2 ≈ 1–2` per week's topic batch. Over-authoring free-recall items does not increase per-session throughput — excess items are excluded by `QueueBuilder` and deferred. Design for the cap, not against it.

**NGN six-skill cases** (Recognize Cues → Analyze Cues → Prioritize Hypotheses → Generate Solutions → Take Action → Evaluate Outcomes) are reserved for Phase 3. Do not author NGN multi-item unfolding cases in Phase 1 or 2 content packs.

---

## 3. Review Workflow

**SME reviewer is Mary (RN).** Review is chapter-anchored — Mary reviews all items for a given chapter before any item in that chapter flips to `SME-reviewed`. Partial chapter sign-off is not valid.

**Feedback is captured in a running log** at the bottom of each topic-map file. Format:

```
## SME Feedback Log

| Date | Item ID | Feedback | Resolution |
|------|---------|----------|------------|
| 2026-07-10 | pharm-003 | Hold HR should be <55 per Norton protocol | Updated threshold; re-reviewed |
```

**Placeholder flag discipline (per amendment j):** `placeholder: true` means "awaiting SME sign-off." Sign-off sequence per `CONTENT_REVIEW.md` governance:
1. SME reviews chapter-anchored batch
2. Edit item content if needed
3. Set `placeholder: false`, update `lastReviewedAt`, bump `contentVersion`
4. Run `npx vitest run` (seed tests must pass)
5. Remove the row from `CONTENT_REVIEW.md`
6. Update topic-map row status to `SME-reviewed`

**Coverage priority is the pilot cohort's current session, not Session 1.** Session 1 seed content (106 items) is the baseline. New authoring targets Mary's active session. If Mary is between sessions, target the session she will start next.

---

## 4. Pilot v0

**Format:** Single-user field test. Mary runs daily review sessions on a dev build for one week.

**What is being tested:**
- Card accuracy and clinical correctness (primary concern)
- Session feel: is the 5–15 min target realistic for the authored load?
- Interleaver behavior: does the mix feel useful or monotone?
- Format distribution: are MCQ / cloze / free-recall ratios appropriate?

**Feedback collection:** Mary uses the session after each day to flag items. The feedback log in each topic-map file is the triage queue. Each flagged item gets a resolution before the next pilot day where possible.

**Dev-build signing constraint:** iOS dev builds signed with a free Apple Developer account expire after 7 days. Any pilot extending beyond 7 days requires either:
- Re-signing and re-deploying to Mary's device
- Moving to TestFlight (requires a paid Apple Developer Program membership at $99/year)

Before enrolling any user outside Mary, TestFlight + paid developer account are mandatory. This is not optional — ad-hoc distribution to non-developers without TestFlight violates App Store guidelines and the build will expire without notice.

**Pilot v0 success criteria:**
- Mary completes at least 5 of 7 days
- Fewer than 10% of reviewed items flagged for clinical correction
- No high-alert item (pharm-017, 018, 019, dose-015, 016) errors survive sign-off
- Mary's subjective session load: "manageable" or better

---

## 5. Backlog Seeds

These items are not yet scheduled for a specific step but must be tracked for future implementation:

**In-app "report this card" affordance.** Students should be able to flag a card as confusing, incorrect, or out of date without leaving the session. Minimum: tap → select reason (wrong/confusing/outdated/other) → dismiss and continue. Reports queue in SQLite and surface in a developer/SME review screen. This is the post-launch equivalent of the pilot feedback log.

**Topic filter (amendment m — `docs/PLAN.md`).** A per-course/pillar opt-in filter for pre-exam focus mode. Constraints: (1) opt-in per session only, never auto-applied; (2) non-sticky — next session launches mixed unless student re-selects; (3) visually indicated with a persistent banner. Do not implement until the mixed default is validated through pilot.

**Interleaver distribution check (amendment l — `docs/PLAN.md`).** When the introduced pool is heavily skewed toward one pillar (early sessions, pre-content-expansion), verify the accumulated-credit interleaver's proportional output does not feel monotone. Evaluate at Step 17 with pilot session logs. No code change expected; mitigation is the debt meter's per-pillar breakdown if skew causes student fatigue.

---

## Content Coverage Tracker

Track per-session pack status here. Update as packs are authored and signed off.

| Session | Course | Topic Map | Items Drafted | SME-Reviewed | Shipped |
|---------|--------|-----------|---------------|--------------|---------|
| s1 | terminology | — | 26 | [ ] | [ ] |
| s1 | foundations | — | 25 | [ ] | [ ] |
| s1 | pharm | — | 30 | [ ] | [ ] |
| s1 | dosage | — | 25 | [ ] | [ ] |
| s4 | complex-care-2 | ✓ content/topic-map/s4-complex-care-2.md | 44 (week 1, cc2-001–044) | [ ] | [ ] |
| s4 | mental-health | ✓ content/topic-map/s4-mental-health.md | 40 (week 1, mh-001–040) | [ ] | [ ] |
| s2–s3, s5–s6 | all courses | not started | 0 | — | — |

**Note:** All 106 s1 items carry `placeholder: true`. No items are production-ready until Mary's sign-off per the review workflow above.

**Note (2026-07-11):** `mental-health` week 1 (40 items, mh-001–040) authored per approved manifest. All items carry `placeholder: true` pending Mary's SME review. Weeks 2–6 authoring is still gated on the B1 difficulty-ramp decision (PLAN.md Open Questions / Evidence note 1) — do not draft further items until B1 resolves.
