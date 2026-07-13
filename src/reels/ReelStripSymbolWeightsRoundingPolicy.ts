// How each symbol's exact quota (weight / totalWeight * length) is rounded to an initial integer
// count, before the remainder (the gap between the sum of initial counts and `length`) is
// distributed. "floor" (the classic Largest Remainder / Hare-quota method) never overshoots
// `length` on its own, so the remainder is always >= 0; "round"/"ceil" can overshoot, so the
// remainder may be negative (counts get corrected downward instead).
export type ReelStripSymbolWeightsRoundingPolicy = "floor" | "round" | "ceil";
