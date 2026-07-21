import type {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";

// What the *most recently played* round's own jackpot involvement actually was — set explicitly by
// JackpotRoundHandler on every single afterRoundPlayed() call, mirroring HoldAndWinRoundOutcome's own
// reasoning (see that type's doc comment): explicit state, never derived after the fact from some other
// flag. Simpler than HoldAndWinRoundOutcome, since a jackpot round never discards/suppresses anything — it
// only ever adds an award on top of whatever the wrapped session's own round already paid, so there's no
// "suppressed" case to represent here.
//
// - "ordinary": no jackpot triggered this round (including every round where jackpot contribution still
//   happened but the trigger simply didn't fire — see JackpotRoundHandler). getWinAmount() forwards straight
//   to the wrapped session; nothing about this round involved the jackpot.
// - "awarded": the round that won a jackpot. "baseWinAmount"/"baseWinEvaluationResult" are the wrapped
//   session's own real, already-applied win for this same round (never discarded, unlike Hold & Win's
//   respins) — getWinAmount() must report baseWinAmount + amount, both components genuinely apply to
//   credits this round (see JackpotRoundHandler.afterRoundPlayed()).
export type JackpotRoundOutcome<T extends string | number | symbol = string> =
    | {readonly kind: "ordinary"}
    | {
          readonly kind: "awarded";
          readonly poolId: string;
          readonly amount: number;
          readonly symbolId: T | undefined;
          readonly baseWinAmount: number;
          readonly baseWinEvaluationResult: WinEvaluationResult<T>;
      };
