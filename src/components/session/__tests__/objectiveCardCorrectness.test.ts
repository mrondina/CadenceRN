import { describe, it, expect } from 'vitest';
import { resolveRating, isCorrectForAccuracy } from '../objectiveCardUtils';
import type { Rating } from '@/domain/types';

// ─── resolveRating ────────────────────────────────────────────────────────────
//
// Regression guard for the core bug: a wrong MCQ/numeric answer must never
// produce a rating >= 3 reaching processRating.

describe('resolveRating', () => {
  it('forces Again (1) for an objective wrong answer regardless of attempted rating', () => {
    // The regression: user pressed Good (3) after a wrong MCQ selection.
    // Before the fix this reached processRating as rating=3; now it must be 1.
    expect(resolveRating(false, 3 as Rating)).toBe(1);
    expect(resolveRating(false, 4 as Rating)).toBe(1);
    expect(resolveRating(false, 2 as Rating)).toBe(1);
    expect(resolveRating(false, 1 as Rating)).toBe(1);
  });

  it('passes through the user rating for objective correct answers', () => {
    expect(resolveRating(true, 1 as Rating)).toBe(1);
    expect(resolveRating(true, 2 as Rating)).toBe(2);
    expect(resolveRating(true, 3 as Rating)).toBe(3);
    expect(resolveRating(true, 4 as Rating)).toBe(4);
  });

  it('passes through the user rating for self-graded formats (cloze, free_recall)', () => {
    expect(resolveRating(null, 1 as Rating)).toBe(1);
    expect(resolveRating(null, 2 as Rating)).toBe(2);
    expect(resolveRating(null, 3 as Rating)).toBe(3);
    expect(resolveRating(null, 4 as Rating)).toBe(4);
  });
});

// ─── isCorrectForAccuracy ─────────────────────────────────────────────────────

describe('isCorrectForAccuracy', () => {
  // Objective wrong: never counts as correct — catches the "100% on wrong answers" bug.
  it('objective wrong answer is never correct regardless of any rating', () => {
    expect(isCorrectForAccuracy(false, 1 as Rating)).toBe(false);
    expect(isCorrectForAccuracy(false, 2 as Rating)).toBe(false);
    expect(isCorrectForAccuracy(false, 3 as Rating)).toBe(false);
    expect(isCorrectForAccuracy(false, 4 as Rating)).toBe(false);
  });

  // Objective correct: always counts as correct regardless of which FSRS rating
  // the user chooses (they got the right answer; how well is theirs to calibrate).
  it('objective correct answer is always correct regardless of chosen rating', () => {
    expect(isCorrectForAccuracy(true, 1 as Rating)).toBe(true);
    expect(isCorrectForAccuracy(true, 2 as Rating)).toBe(true);
    expect(isCorrectForAccuracy(true, 3 as Rating)).toBe(true);
    expect(isCorrectForAccuracy(true, 4 as Rating)).toBe(true);
  });

  // Self-graded (cloze, free_recall): accuracy follows rating, unchanged from
  // pre-fix behavior.
  it('self-graded format: correct when rating >= 3 (Good/Easy)', () => {
    expect(isCorrectForAccuracy(null, 1 as Rating)).toBe(false);
    expect(isCorrectForAccuracy(null, 2 as Rating)).toBe(false);
    expect(isCorrectForAccuracy(null, 3 as Rating)).toBe(true);
    expect(isCorrectForAccuracy(null, 4 as Rating)).toBe(true);
  });
});

// ─── Accuracy counter simulation ──────────────────────────────────────────────
//
// Simulates the correctRef / totalRatedRef accumulation for a mixed session,
// asserting that a session with objective wrong answers cannot report 100%.

describe('accuracy counter: session with one objective miss', () => {
  function runSession(
    cards: Array<{ revealResult: boolean | null; rating: Rating }>,
  ): { accuracy: number; correct: number; total: number } {
    let correct = 0;
    let total = 0;
    for (const { revealResult, rating } of cards) {
      total += 1;
      if (isCorrectForAccuracy(revealResult, rating)) correct += 1;
    }
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { accuracy, correct, total };
  }

  it('8-card session with one objective miss cannot report 100% accuracy', () => {
    const session = [
      { revealResult: false as boolean | null, rating: 1 as Rating }, // objective wrong
      { revealResult: true,  rating: 3 as Rating }, // objective correct
      { revealResult: true,  rating: 3 as Rating },
      { revealResult: true,  rating: 3 as Rating },
      { revealResult: null,  rating: 3 as Rating }, // self-graded correct
      { revealResult: null,  rating: 3 as Rating },
      { revealResult: null,  rating: 3 as Rating },
      { revealResult: null,  rating: 3 as Rating },
    ];
    const { accuracy, correct, total } = runSession(session);
    expect(total).toBe(8);
    expect(correct).toBe(7);
    expect(accuracy).toBe(88); // not 100
    expect(accuracy).toBeLessThan(100);
  });

  it('8-card session of all wrong MCQ/numeric answers reports 0% accuracy', () => {
    const session = Array.from({ length: 8 }, () => ({
      revealResult: false as boolean | null,
      rating: 3 as Rating, // user would have pressed Good — irrelevant now
    }));
    const { accuracy, correct } = runSession(session);
    expect(correct).toBe(0);
    expect(accuracy).toBe(0);
  });
});

// ─── MCQ correctness signal formula ──────────────────────────────────────────
//
// The correctness signal surfaced by MCQCard is: selectedId === body.correctId.
// Tests here verify the formula contract independent of the React component.

describe('MCQCard correctness signal formula', () => {
  function mcqCorrect(selectedId: string, correctId: string): boolean {
    return selectedId === correctId;
  }

  it('returns true when the selected option matches the correct option', () => {
    expect(mcqCorrect('b', 'b')).toBe(true);
  });

  it('returns false when the selected option does not match', () => {
    expect(mcqCorrect('a', 'b')).toBe(false);
    expect(mcqCorrect('c', 'b')).toBe(false);
    expect(mcqCorrect('d', 'b')).toBe(false);
  });
});

// ─── NumericCard correctness signal formula ───────────────────────────────────
//
// The correctness signal surfaced by NumericCard is:
//   Math.abs(parseFloat(input) - answer) <= tolerance
// Tests here verify the formula contract.

describe('NumericCard correctness signal formula', () => {
  function numericCorrect(input: string, answer: number, tolerance: number): boolean {
    return Math.abs(parseFloat(input) - answer) <= tolerance;
  }

  it('returns true when input is exactly correct', () => {
    expect(numericCorrect('200', 200, 0)).toBe(true);
  });

  it('returns true within tolerance band', () => {
    expect(numericCorrect('199', 200, 1)).toBe(true);
    expect(numericCorrect('201', 200, 1)).toBe(true);
  });

  it('returns false when outside tolerance — the 5 mL/hr vs 200 mL/hr case', () => {
    expect(numericCorrect('5', 200, 0)).toBe(false);
    expect(numericCorrect('5', 200, 5)).toBe(false); // even with tolerance=5
  });

  it('returns false for empty / non-numeric input', () => {
    expect(numericCorrect('', 200, 0)).toBe(false); // parseFloat('') = NaN
  });
});
