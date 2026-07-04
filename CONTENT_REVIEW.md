# Content Review — SME Sign-off Required

All items flagged below are seed-data placeholders. Each must be reviewed by a licensed RN or nurse educator before the app ships to users. Items are queryable in SQLite via `SELECT * FROM content_items WHERE placeholder = 1`.

---

## Review Status Key
- `[ ]` — Awaiting SME review
- `[~]` — Under review
- `[x]` — Cleared for production

---

## Pharmacology

### Prototype drugs (pending verification)
- [ ] **Propranolol** — mechanism, key assessments, contraindications, dosing ranges. Source: standard pharmacology reference; verify against current Nursing Drug Handbook.
- [ ] **Furosemide** — electrolyte monitoring parameters (K+ threshold for notification), IV rate limits, patient teaching points.
- [ ] **Lisinopril** — first-dose hypotension protocol, pregnancy category, renal monitoring parameters.

### High-alert flags (require independent double-check)
- [ ] All items with `high_alert = 1` must be individually confirmed by SME. Do not clear in bulk.
- [ ] IV insulin concentration and rate items — error-prone category; verify against INS standards.
- [ ] Anticoagulant dosing items (heparin, warfarin) — verify therapeutic ranges and reversal agent facts.

---

## Dosage Calculation

- [ ] All weight-based pediatric dosing drills — verify mg/kg ranges against current Harriet Lane or equivalent.
- [ ] IV rate calculations — verify formula and units against agency-standard dimensional analysis curriculum.
- [ ] Tolerance values on numeric items — confirm acceptable margin of error aligns with nursing exam standards.

---

## Foundations / Assessment

- [ ] Normal vital sign ranges for adults — verify age-differentiated values (geriatric, pregnancy).
- [ ] Lab value reference ranges — confirm against current clinical lab standards (differ by institution; note which reference is used).

---

## Terminology

- [ ] Word-part decomposition items — primarily linguistic; lower clinical risk. Spot-check 10% for anatomical accuracy.

---

## Governance Notes

- Reference source used for seed content: *Saunders Comprehensive Review for the NCLEX-RN* (most recent edition) and public-domain nursing education resources.
- Drug facts: where uncertain, prototype-drug knowledge was used (propranolol, furosemide, lisinopril). Any item with a `?` in its `source_citation` field requires primary-source lookup before clearance.
- Update cadence: pharmacology items should be re-reviewed every 12 months or when a major formulary change is announced.
- **This file must be updated whenever new seed content is added.**
