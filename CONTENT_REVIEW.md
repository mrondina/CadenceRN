# CONTENT_REVIEW.md — SME Sign-off Required

All items flagged below are seed-data placeholders (`placeholder: true`). Each must be
reviewed by a licensed RN or nurse educator before the app ships to users.
Query: `SELECT id, content_pack_id FROM content_items WHERE placeholder = 1;`

Step 13 seed: **106 items** across 4 packs (terminology: 26, pharm: 30, foundations: 25, dosage: 25).
All graph links validated against real IDs at commit time (2026-07-04).

Migration 003 seed: **44 items** in complex-care-2-pack (cc2-001 to cc2-044, s4 week 1).
Graph links validated at authoring time (2026-07-08).

---

## Review Status Key

- `[ ]` — Awaiting SME review
- `[~]` — Under review
- `[x]` — Cleared for production

---

## Terminology Pack (26 items — term-001 to term-026)

### Uncertain / verify

| ID | Concern |
|----|---------|
| term-019 (edema) | Explanation attributes edema to "third-spacing" as the mechanism for all edema — accurate for oncotic-driven edema but may need nuancing for obstructive causes. |
| term-023 (bradypnea) | Threshold listed as < 12 RR; some sources use < 10. Confirm threshold your program uses. |
| term-024 (tachypnea) | Threshold listed as > 20 RR; some critical-care texts use > 24. Confirm. |
| term-025 (orthopnea) | Includes 2-pillow vs. 3-pillow detail — verify degree of detail expected at session 1 week 2. |
| term-026 (diaphoresis) | Focuses on sympathetic causes; diaphoresis is also an opioid adverse effect (cholinergic pathway). Appropriate scope for week 2? |

### Bulk sign-off
- [ ] Word-part prefixes/suffixes (term-001 to term-008) — primarily linguistic; spot-check anatomical accuracy.
- [ ] Clinical terms (term-009 to term-026) — verify threshold values and explanations.

---

## Pharm Pack (30 items — pharm-001 to pharm-030)

All pharmacology items use **well-established prototype drugs only** (propranolol, lisinopril,
furosemide, atorvastatin, heparin, warfarin, metformin, amoxicillin, morphine, regular insulin).
Dosage ranges and monitoring parameters are summarised from standard references; institutional
protocols supersede these.

### Uncertain / verify

| ID | Concern |
|----|---------|
| pharm-003 | Hold HR threshold stated as < 60 bpm. Some post-MI protocols use < 55. Confirm your program's hold parameter. |
| pharm-004 | Taper duration stated as "1–2 weeks." Actual range is 7–14 days; confirm language. |
| pharm-007 | First-dose hypotension discussed; may understate ongoing orthostatic risk in volume-depleted patients. |
| pharm-008 | Creatinine rise < 30% labelled acceptable per "some guidelines" — 25–30% threshold varies by institution. |
| pharm-012 | Ototoxicity described as potentially irreversible. Transient vs. permanent distinction should be confirmed. |
| pharm-015 | CK monitoring threshold cited as 10× ULN — a common teaching value; institutional hold criteria vary. |
| pharm-016 | Lists grapefruit/cyclosporine/gemfibrozil interactions. Confirm if CYP3A4 mechanism detail is in scope at week 3. |
| pharm-017 | Therapeutic aPTT stated as 60–100 s (1.5–2.5× control). Actual target is assay- and protocol-specific; item correctly says "verify institutional range." |
| pharm-018 | HIT criteria described as ≥ 50% platelet drop or < 100,000/mcL. 4T score mentioned but not scored. Scope check. |
| pharm-019 | Protamine ratio: 1 mg per 100 units heparin (last 4 hours). Actual dosing is time-dependent and weight-adjusted. Confirm simplification is appropriate. |
| pharm-020 | INR ranges: 2.0–3.0 (most indications), 2.5–3.5 (mechanical valves). Confirm against ACCP/AHA guidance in curriculum. |
| pharm-022 | Contrast dye hold "48 h before and 48 h after" for eGFR < 30 or AKI. Pre-contrast hold is debated; verify teaching points. |
| pharm-028 | RR hold threshold stated as < 12 breaths/min. Some protocols specify < 10 or < 8 for opioid-naive patients. Confirm. |
| pharm-029 | Insulin onset 30–60 min, peak 2–4 hr, duration 6–8 hr (subcutaneous). Values are approximate; verify acceptable for this stage. |
| pharm-030 | Hypoglycemia threshold is < 70 mg/dL only (not ADA Level 1/2 distinction). Confirm simplification is appropriate. |

### High-alert items — require independent double-check

- [ ] pharm-017, pharm-018, pharm-019 (heparin / HIT / protamine)
- [ ] pharm-029, pharm-030 (insulin dosing and hypoglycemia)

---

## Foundations Pack (25 items — fnd-001 to fnd-025)

### Uncertain / verify

| ID | Concern |
|----|---------|
| fnd-002 (normal BP) | Uses 2017 ACC/AHA definition (Normal: < 120/80). JNC 8 and some nursing texts cite < 130/80. Confirm which guideline set your program follows. |
| fnd-004 (normal temp) | Range: 97.8–99.1°F (36.5–37.3°C). Some sources give 98.6°F as a single value. Confirm range vs. point approach. |
| fnd-006 (NRS pain) | States ≥ 4 warrants intervention per "most protocols." Institutional variable — confirm your program's threshold. |
| fnd-013 (creatinine) | Normal range 0.6–1.2 mg/dL; sex/age variation noted. Item says "verify against institution's range" — may be confusing for early learners. |
| fnd-014 (BUN) | Normal 7–25 mg/dL. Some sources cite 8–20 or 10–30. Ranges are institution-specific. |
| fnd-015 (WBC) | Upper normal stated as 11,000/mcL; some sources use 10,000–10,500. Confirm your program's reference range. |
| fnd-016 (hemoglobin — female) | Normal: 12.0–16.0 g/dL. Verify preferred range for your curriculum. |
| fnd-017 (platelet count) | Upper limit stated as 400,000/mcL; some sources cite 450,000. HIT teaching point included — appropriate for week 2 foundations? |
| fnd-021 (bowel sounds) | Normal rate: 5–30/min; some texts say 5–35/min. "Absent = listen 5 min per quadrant" — confirm expected practice. |
| fnd-023 (JVD) | Threshold: > 3–4 cm above sternal angle at 30–45°. Clinical measurement is more qualitative; confirm acceptable detail level. |
| fnd-025 (pulse grading) | Uses 0–4+ scale; some programs use 0–3+. Confirm which scale your program teaches. |

---

## Dosage Pack (25 items — dose-001 to dose-025)

### Uncertain / verify

| ID | Concern |
|----|---------|
| dose-008 (drip rate) | Answer rounds 41.67 → 42 gtts/min. Confirm your program rounds to nearest whole number vs. always rounding up for safety. |
| dose-015 (heparin bolus HIGH ALERT) | Tests the math only (units/kg × weight). Actual protocols round to nearest 100/500 units and use weight bands. Confirm scope. |
| dose-016 (insulin drip HIGH ALERT) | Uses 0.1 units/kg/hr as the teaching starting rate. DKA protocols vary; confirm this rate is your program's standard. |
| dose-017 (dopamine mcg/kg/min) | Dopamine largely replaced by norepinephrine in many ICU protocols but remains a standard dimensional analysis teaching case. Confirm it's still in your curriculum. |
| dose-019 (renal dose adjustment) | 50% reduction heuristic is provided as the calculation input. In practice, adjustments are drug-specific and CrCl-stratified. Confirm simplified approach is appropriate. |
| dose-021 (°F to °C) | Correct formula. Verify whether your program expects formula memorisation or only threshold recognition. |

### High-alert items — require independent double-check

- [ ] dose-015 (heparin bolus calculation)
- [ ] dose-016 (insulin drip rate calculation)

---

## Complex Care 2 Pack — Week 1 (44 items — cc2-001 to cc2-044)

**Source:** ATI RN Adult Medical Surgical Nursing Review Module, Edition 12.0.
All chapter references are 12.0-verified (syllabus ≥ Ch 67 are shifted +1 from prior edition — see topic map).

### Uncertain / verify

| ID | Concern |
|----|---------|
| cc2-017 | Calcium 1,200 mg/day and vitamin D 800 IU/day follow NOF guidance for women >50. ATI 12.0 may cite different thresholds; some sources use 600 IU as the RDA floor. Confirm values your program tests. |
| cc2-029 | Uric acid target < 6.0 mg/dL is the standard NCLEX/ATI value. ACR 2020 recommends < 5.0 mg/dL for tophaceous gout. Confirm which threshold is taught; consider splitting if both are tested. |
| cc2-032 | Methotrexate hold criteria for hepatotoxicity are institution-specific. Common teaching threshold is ALT >2–3× ULN; some programs use >3× or >5× ULN. CBC hold thresholds (WBC, neutrophil count, platelets) also vary across protocols. ACR 2015 monitoring recommendations are a common reference but are not universally adopted. Confirm which values and monitoring intervals your program tests. |

### Bulk sign-off — chapter-anchored batches

- [ ] Acute MSK (cc2-001 to cc2-014) — Ch 68/69/70/72: MSK diagnostics, arthroplasty, amputations, trauma/fractures
- [ ] Chronic MSK (cc2-015 to cc2-024) — Ch 71/73: osteoporosis, osteoarthritis, low-back pain
- [ ] CT disorders (cc2-025 to cc2-034) — Ch 88/89: gout, lupus, fibromyalgia, rheumatoid arthritis
- [ ] Sensory/perception (cc2-035 to cc2-044) — Ch 13/14: eye and ear disorders

---

## Mental Health Pack — Exam 3 Content (30 items — mh-041 to mh-070)

**Source:** PMH Module 5 lecture notes (schizophrenia/psychosis, somatic/dissociative disorders, personality disorders). Original authorship — no verbatim reproduction of source material.
**Release gate:** session 4, week 4 (opened 2026-07-20; Exam 3 date 2026-07-23).

### High-alert items — require independent double-check

- [ ] mh-044 (neuroleptic malignant syndrome recognition) — life-threatening antipsychotic reaction
- [ ] mh-047 (clozapine / agranulocytosis) — black-box warning, mandatory WBC monitoring

### Uncertain / verify

| ID | Concern |
|----|---------|
| mh-043 | DSM-5 schizophrenia duration criteria: ≥2 symptoms × 1 month + 6-month continuous disturbance. Verify this is the exact threshold your program tests (some sources emphasize the active-phase vs. total-duration distinction differently). |
| mh-044 | NMS temperature threshold stated as > 101°F (103°F in stem). Some sources use > 38°C / > 100.4°F as the lower bound for fever. Confirm acceptable range for teaching. |
| mh-051 | AIMS scoring: "any score above zero warrants follow-up" is the standard teaching point. Confirm your program's preferred AIMS threshold and follow-up protocol. |
| mh-052 | TD treatment: valbenazine and deutetrabenazine (VMAT2 inhibitors) cited as FDA-approved. Confirm these are in scope for your course's pharmacology expectations. |
| mh-061 | Free-recall rubric includes grounding techniques; instructor-specific wording may differ. Confirm the nursing approach language matches lecture content. |
| mh-067 | DBT cited as evidence-based treatment for BPD. Confirm whether DBT is explicitly named in lecture or if a more generic "psychotherapy" framing is preferred. |
| mh-070 | Mood stabilizers (valproate, lamotrigine) listed as symptom-targeted adjuncts for personality disorders. Confirm these specific agents are in scope for your course. |

### Bulk sign-off — topic batches

- [ ] Group A: Schizophrenia/psychosis/antipsychotics (mh-041 to mh-052) — 12 items; pharm-heavy; antipsychotic generation discrimination, EPS taxonomy, NMS, clozapine
- [ ] Group B: Somatic and dissociative disorders (mh-053 to mh-061) — 9 items; disorder discrimination, FNSD, factitious, dissociative subtypes, free-recall nursing priority
- [ ] Group C: Personality disorders (mh-062 to mh-070) — 9 items; cluster framework, named mix-ups (schizoid/schizotypal, antisocial/narcissistic), BPD splitting, OCPD/OCD discrimination

---

## Cross-Pack Graph Links

All 106 items' graph links verified programmatically at Step 13 commit (2026-07-04): 0 broken references.
Re-run `src/db/__tests__/seed.test.ts` graph link test after any ID rename.

---

## Governance

- Primary references: *Saunders Comprehensive Review for the NCLEX-RN* (9th ed.); *Fundamentals of Nursing* Potter & Perry (9th ed.); *Dimensional Analysis for Meds* Pickar & Swart (4th ed.); ADA Standards 2024; 2017 ACC/AHA BP Guidelines.
- Update cadence: pharmacology items re-reviewed every 12 months or on major formulary change.
- Sign-off workflow: (1) SME reviews each flagged row above → (2) edit item content if needed → (3) set `placeholder: false`, update `lastReviewedAt`, bump `contentVersion` → (4) run `npx vitest run` → (5) remove the row from this file.
- **This file must be updated whenever new seed content is added.**
- **Content coverage gap (pilot-planning note):** Current seed content covers Session 1 (weeks 1–4, all four packs) and Session 2 (no packs authored yet). Sessions 3–6 have template course definitions but zero content packs. A mid-program adopter who onboards in Session 3 or later will have the correct session shown on the confirm screen, but their queue will be empty — `findUnlocked` gates on session/week, and without pack content there is nothing to unlock. Before the pilot enrolls any student past Session 1, the relevant session packs must be authored and seeded. Mary's spot-check is the first entry point for this work. Track per-session coverage here as packs are completed.
