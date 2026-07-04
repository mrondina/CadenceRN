# **PRD: ABSN Study Companion**

**Version:** 0.1 (Draft) **Author:** Mark **Date:** July 2026 **Status:** Draft for planning-prompt input

---

## **1\. Overview**

A mobile-first learning application for students in Bellarmine University's 12-month Accelerated Bachelor of Science in Nursing (ABSN) program. The app synchronizes a spaced-retrieval learning system to the program's actual term and session structure, so that new material is introduced in step with lectures, labs, and clinicals, while previously learned material is continuously and automatically resurfaced on a scientifically optimized schedule through NCLEX-RN.

The core thesis: ABSN students fail not because material is too hard, but because the pace of the program makes forgetting inevitable under a cram-and-move-on study pattern. A session-aligned spaced-repetition system converts the program's compressed calendar from a liability into a retrieval-practice advantage.

---

## **2\. Problem Statement**

Bellarmine's ABSN compresses \~58–59 credits and 630 clinical hours into 12 months, organized as three semesters (summer, fall, spring), each divided into two 7–8 week sessions — six sessions total. Students face:

1. **Volume \+ velocity:** Each session introduces an entire course's worth of content (e.g., pharmacology, pathophysiology, complex adult care) in 7–8 weeks.  
2. **High stakes:** Students must earn a B or better in nursing and natural science courses to remain in the accelerated track. A single failed course can mean transfer to the traditional (multi-year) track with no readmission to the accelerated track.  
3. **Cumulative endgame:** The program culminates in the NCLEX-RN, which tests everything — including Session 1 content learned 11 months earlier.  
4. **No time:** The program handbook explicitly warns the curriculum is incompatible with full-time work. Study tools must fit into 5–15 minute fragments and work offline (clinical sites, commutes).  
5. **Generic tools don't align:** Anki, Quizlet, and UWorld are either unstructured (student must build/schedule everything) or NCLEX-endgame-only (not aligned to weekly coursework). Nothing maps to *this program's* session calendar.

---

## **3\. Target Users**

### **Primary persona: The ABSN student**

* Second-degree student; already holds a bachelor's in another field.  
* Average age \~32; roughly half are married, many have children.  
* Career changer with high motivation and high anxiety about washing out.  
* Studies in fragments: between clinicals, on commutes, late at night.  
* Cohort-oriented: Bellarmine ABSN cohorts are close-knit and mutually supportive.

### **Secondary personas (later phases)**

* **Pre-start admit:** Admitted student in the 1–4 month gap before cohort start who wants a head start (terminology, dosage calc, prerequisites refresh).  
* **Traditional BSN / other ABSN programs:** The engine and content model generalize; Bellarmine alignment is the wedge, not the ceiling.

---

## **4\. Goals & Success Metrics**

### **Product goals**

1. Every enrolled user retrieves every learned item on a spaced schedule through NCLEX (no content is ever "done and forgotten").  
2. Daily study fits real life: median session length under 12 minutes; fully functional offline.  
3. Content stays synchronized with the student's actual course calendar with less than 10 minutes of setup/maintenance effort per session.

### **Success metrics (MVP)**

* **Activation:** ≥70% of installs complete cohort setup and first review session.  
* **Retention:** ≥40% DAU/MAU during active sessions (study apps live or die on daily habit).  
* **Learning efficacy proxy:** ≥85% average retrievability score maintained across a user's active item pool.  
* **Review debt:** \<20% of active users carry a review backlog \>3 days old.  
* **Outcome (long-term):** self-reported course exam performance; eventually NCLEX first-time pass rate of users vs. program baseline (\~91.4% at Bellarmine).

### **Non-goals (explicitly out of scope for v1)**

* Replacing UWorld/ATI/Kaplan as a full NCLEX question bank.  
* Serving as a clinical reference tool (this is a study aid; see §11 Risks).  
* Instructor/faculty-facing features or LMS integration.  
* Traditional 4-year BSN track support.

---

## **5\. Program Alignment Model (Core Domain Design)**

### **5.1 Structural entities**

* **Program:** Bellarmine ABSN (12-month). Data-driven, not hardcoded — designed so other programs can be added later.  
* **Cohort:** Start month \+ year (e.g., Summer 2027). Cohorts share a default schedule template.  
* **Semester:** Summer, Fall, Spring.  
* **Session:** The atomic scheduling unit. Six sessions of 7–8 weeks each. All content release and pacing keys off the session.  
* **Course:** Mapped to one or more sessions (e.g., Applied Pharmacology, Health Assessment Across Lifespan, Foundations, Pathophysiology, Complex Nursing Care of Adults I/II, Psychiatric Mental Health, Childbearing/Childrearing Families, Population Health, Professional Nursing I–III, Comprehensive NCLEX Review).  
* **Week:** Courses decompose into weekly topic units that gate new-content introduction.

### **5.2 Critical design constraint: configurability**

Bellarmine distributes detailed schedules shortly before classes begin, and course order can shift with clinical resource availability. Therefore:

* Ship a **default Bellarmine template** (best-known course-to-session mapping).  
* Provide a **setup wizard** where students confirm/adjust course order, session dates, and exam dates once their real schedule arrives.  
* Support **mid-program edits** (a course moves, an exam date changes) with automatic rescheduling of new-content release. Spaced-review scheduling of already-learned items is unaffected by calendar edits.

### **5.3 Key calendar-driven behaviors**

* **"This Week" view:** New items unlock in sync with the current course week. Students may pull ahead manually; default pacing protects cognitive load.  
* **Exam Mode:** User enters an exam date for a course → algorithm compresses review intervals for that course's items in the 7–10 days prior, then relaxes back to long-term spacing afterward (interval preservation: exam cramming must not corrupt the long-term memory model).  
* **Clinical Prep Packs:** Night-before bundles keyed to rotation type (med-surg, psych, OB, peds, community): highest-yield meds, lab values, assessments, and safety checks for that unit type.  
* **NCLEX Runway:** In the final session, the system pivots — new-content introduction ends, mixed cumulative retrieval intensifies, and item formats shift toward NCLEX and Next Gen NCLEX styles.

---

## **6\. Learning Science Requirements (The Engine)**

These are product requirements, not implementation suggestions. The engine is the product.

### **6.1 Scheduling: FSRS**

* Use the **FSRS (Free Spaced Repetition Scheduler)** algorithm — per-item memory model (difficulty, stability, retrievability) — rather than legacy SM-2.  
* Target retrievability configurable per context: \~90% default, raised in Exam Mode windows.  
* All four content pillars share one unified scheduling queue (see 6.3 Interleaving).

### **6.2 Retrieval practice as the only mode**

* Every learning interaction is a retrieval attempt. No passive flip-through mode as a default.  
* Item formats: cloze deletion, free-text recall (self-graded with structured rubric), multiple choice with NCLEX-style distractors, ordered-sequence (procedures), matrix/grid (Next Gen NCLEX), image hotspot (assessment findings), and dosage-calculation numeric entry.

### **6.3 Interleaving**

* Daily review sessions deliberately mix pillars (pharm \+ patho \+ terminology \+ procedures) rather than blocking by topic.  
* Rationale: interleaved practice improves discrimination between similar items — directly relevant to NCLEX distractor design (e.g., distinguishing beta-blocker classes, or DKA vs. HHS presentations).  
* User may filter to a single course (e.g., pre-exam), but default is interleaved.

### **6.4 Successive relearning**

* An item is not "learned" after one correct answer. Items must be retrieved correctly across N spaced sessions (default N=3) before graduating to long intervals.  
* Lapsed items re-enter the relearning pipeline automatically.

### **6.5 Desirable difficulty progression**

* Per-item difficulty ramp over time: recognition → cued recall → free recall → applied scenario.  
* Example (furosemide): "Which class?" (week 1\) → "Name the key electrolyte to monitor" (week 3\) → "Your patient on furosemide reports muscle cramps and their K+ is 2.9 — what do you assess and who do you notify?" (month 3+).

### **6.6 Elaborative connection graph**

* Content items are nodes in a knowledge graph: medications ↔ pathophysiology ↔ assessments ↔ interventions ↔ lab values ↔ terminology.  
* Reviews surface connected prompts ("You just reviewed heart failure patho — which two med classes are first-line, and why?").  
* The graph drives scenario generation in later sessions and the NCLEX Runway.

### **6.7 Metacognition & load management**

* **Review-debt meter:** visible forecast of backlog accumulation if today is skipped; predicted daily load for the next 7 days.  
* **Confidence calibration:** periodic "how confident are you?" pre-answer ratings, with calibration feedback (overconfidence on high-alert meds gets flagged).

---

## **7\. Content Model (Four Pillars)**

### **7.1 Medications**

* **Scaffold by class, not by drug.** Prototype-drug approach: learn the prototype (e.g., propranolol), generalize by suffix pattern (-olol, \-pril, \-sartan, \-statin, \-azole, \-cillin…).  
* Card schema: generic/brand, class, one-sentence mechanism, key assessments before/after administration, dangerous interactions, critical labs, patient teaching, high-alert flag.  
* **Dosage calculation** as a distinct, always-available skill track (dimensional analysis drills, IV rates, pediatric weight-based dosing). This is a top wash-out risk area and a daily-drill candidate.  
* Session mapping: introduced with the Pharmacology course; formularies expand per subsequent course (psych meds with Psychiatric Mental Health, OB meds with Childbearing Families, etc.).

### **7.2 Procedures & Techniques**

* Formats: step-sequencing (drag steps into order), critical-point checks ("what must be verified before X"), sterile vs. clean discrimination, contraindication spotting.  
* Aligned to skills-lab schedule; "check-off prep" bundles the night before lab validations.  
* Media: short illustrated step frames (no video dependency in v1 — offline size budget).

### **7.3 Terminology**

* Front-loaded in Session 1: prefix/suffix/root decomposition so unfamiliar terms become decodable rather than memorized ("-ectomy," "brady-," "-emia").  
* After Session 1, terminology is embedded contextually inside other pillars' items rather than maintained as a large standalone deck.

### **7.4 Concepts / Pathophysiology**

* The connective tissue of the graph. Mini case scenarios pull across all pillars and grow in complexity mirroring the program arc: Foundations → Complex Care I → Complex Care II → NCLEX Runway.  
* Next Gen NCLEX case-study format (six-question unfolding cases) introduced in the final two sessions.

### **7.5 Content sourcing & governance**

* v1 content is original, authored against public domain / licensed references; every item carries a source citation and last-reviewed date.  
* Clinical accuracy review workflow required before publishing (SME reviewer role — at minimum one RN/educator reviewer).  
* Drug content pinned to a maintained reference source with an update cadence; stale-content flagging after 12 months.  
* **Explicit product framing: study aid, not a clinical decision tool.** In-app disclaimer at onboarding and on all medication content.

---

## **8\. Feature Requirements by Phase**

### **Phase 1 — MVP (target: usable by a Session 1–2 student)**

| \# | Feature | Notes |
| ----- | ----- | ----- |
| 1.1 | Cohort setup wizard | Start date, course-to-session mapping (Bellarmine default template, editable), exam dates |
| 1.2 | FSRS review engine | Unified queue, interleaved, successive relearning, per-item memory model |
| 1.3 | "This Week" view | Session/week-gated new content release; manual pull-ahead |
| 1.4 | Content: Terminology pillar | Full Session 1 scope (word-part decomposition \+ core vocabulary) |
| 1.5 | Content: Foundations \+ Health Assessment | Aligned to first-session courses |
| 1.6 | Content: Pharmacology core | Class scaffolding \+ top \~100 prototype/high-alert drugs |
| 1.7 | Dosage calculation drill track | Numeric-entry items, dimensional analysis, daily mini-drill |
| 1.8 | Exam Mode | Date-driven interval compression per course |
| 1.9 | Review-debt meter \+ 7-day load forecast | Core habit mechanic |
| 1.10 | Offline-first sync | Full study functionality without connectivity; background sync |
| 1.11 | Streaks \+ session-length design | 5–15 min sessions; resumable mid-session |

### **Phase 2 — Course companion depth**

* Procedures pillar (sequencing, check-off prep packs)  
* Pathophysiology case scenarios (single-concept mini-cases)  
* Clinical Prep Packs by rotation type  
* Audio review mode (TTS retrieval prompts for commutes)  
* Confidence calibration  
* Remaining course formularies (psych, OB/peds, community) as sessions progress

### **Phase 3 — NCLEX Runway \+ community**

* Next Gen NCLEX item types: matrix/grid, extended drag-and-drop, unfolding case studies, bow-tie items  
* Cumulative readiness dashboard (retrievability by NCLEX client-need category)  
* Cohort features: shared cohort space, peer-authored decks (with quality gates), cohort study streaks  
* SME/instructor-verified content badge layer  
* Pre-start admit mode (head-start track for admitted students awaiting cohort start)

---

## **9\. Non-Functional Requirements**

* **Platforms:** iOS \+ Android from day one (React Native or Flutter; decision in tech plan). Cohort skews older/career-changer — assume mixed device ecosystem.  
* **Offline:** All review, drill, and content-browsing functions work fully offline. Sync is eventual; conflict resolution favors the device with the most recent review events (review events are append-only).  
* **Performance:** Review answer-to-next-card latency \<150 ms perceived; cold start \<2.5 s.  
* **Session resilience:** App suspension mid-review loses no more than the current card.  
* **Accessibility:** WCAG 2.2 AA; dynamic type support; audio mode doubles as accessibility feature.  
* **Privacy/compliance:** Student study data is personal but not PHI; no patient data ever enters the system (explicit policy \+ content rules). FERPA posture: app is direct-to-student, no institutional data relationship in v1.  
* **Data model note:** Review history is append-only event log (enables FSRS re-optimization of parameters over time and future per-user parameter fitting).

---

## **10\. Monetization (Directional)**

* **Freemium:** Terminology pillar \+ dosage calc drills free (acquisition \+ pre-start admits); subscription unlocks full course-aligned content and Exam Mode.  
* **Pricing anchor:** Students already pay for UWorld/ATI (\~$100–400 range); a $10–15/mo or \~$99/program-life price point is defensible if the daily-habit value is real.  
* **B2B2C later:** program- or hospital-partner licensing (Bellarmine's Norton Scholars / Baptist Nursing Knowledge partnerships suggest institutional buyers exist in this ecosystem) — not pursued until efficacy data exists.

---

## **11\. Risks & Mitigations**

| Risk | Impact | Mitigation |
| ----- | ----- | ----- |
| Content accuracy (medication errors in study content) | Critical — trust and safety | SME review workflow, source citations, update cadence, "study aid not clinical reference" framing everywhere |
| NCLEX question quality is expensive to author | High | Phase NCLEX-style items to Phase 3; consider licensing a validated item bank vs. building; keep MVP focused on course-level retrieval |
| Bellarmine schedule drift breaks alignment | Medium | Configurable template \+ mid-program edit support (§5.2); community-sourced template updates per cohort |
| Single-program TAM is tiny (\~1–2 cohorts/yr) | Medium (business) | Architecture is program-agnostic from day one; Bellarmine is the design-partner wedge, ABSN category (\~300+ programs nationally) is the market |
| Habit collapse under program stress | High (retention) | Review-debt visibility, tiny-session design, offline access, load forecasting; never punish — always show the recovery path |
| IP/likeness: using Bellarmine's name/course numbers | Medium (legal) | Describe alignment generically ("12-month ABSN template"); no trademarks, logos, or official affiliation claims without agreement |

---

## **12\. Open Questions**

1. Build vs. license for the drug reference backbone (e.g., licensing a drug database vs. original authored content)?  
2. FSRS parameter strategy: ship with default parameters, or plan per-user optimization once ≥1,000 reviews of history exist?  
3. Content authoring pipeline: who is the founding SME reviewer, and what's the authoring tooling (internal CMS vs. structured files in repo)?  
4. React Native vs. Flutter vs. native — offline-first sync and low-latency card rendering are the deciding constraints.  
5. Should cohort features (Phase 3\) include any moderation-sensitive surfaces (chat), or stay limited to shared decks and streaks?  
6. Design-partner motion: recruit 5–10 students from an upcoming Bellarmine cohort for MVP pilot — what's the incentive (free lifetime access)?

---

## **13\. Appendix: Bellarmine ABSN Reference Snapshot (as of July 2026\)**

* 12-month, second-degree program; three semesters (summer/fall/spring), each split into two 7–8 week sessions.  
* \~58–59 credits; 630 clinical hours; mix of class, skills lab, simulation, and clinical.  
* Content arc: health assessment, foundations, pharmacology, pathophysiology (BIOL 300), complex adult care I/II, psychiatric mental health, childbearing/childrearing families, population health, professional nursing I–III, comprehensive NCLEX review.  
* Progression requirement: B or better in nursing/natural science courses to remain in accelerated (NURA) track; failure moves student to traditional track with no accelerated readmission.  
* Detailed schedules distributed shortly before classes begin; course order may shift with clinical resource availability → configurability is mandatory (§5.2).  
* Bellarmine 5-year average NCLEX first-time pass rate: \~91.4%.

