import type {ExactMathScope} from "./exactMathScope";

/**
 * The one exact-math headline Overview can show above the sampled whole-round summary.
 *
 * `rtp` is the exact total when free games make the table whole-round; otherwise it is the exact
 * paid-spin value and `wholeRound` is false. Consumers must never present the paid-spin value as the
 * player's whole-round RTP.
 */
export type ExactMathSummary = {
    readonly rtp: number;
    readonly paidRtp: number;
    readonly freeRtp?: number;
    readonly hitFrequency: number;
    readonly volatility: number;
    readonly maxWin: number;
    readonly outcomes: number;
    readonly scope: ExactMathScope;
    readonly wholeRound: boolean;
};
