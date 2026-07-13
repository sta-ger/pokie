// How to deterministically break ties when two or more symbols have an equally-deserving (or
// equally-undeserving) fractional remainder during remainder distribution:
// - "symbol-id" (the default): lexicographically ascending symbol ID, independent of declaration
//   order.
// - "declared-order": the order symbols first appear in `symbolWeights`.
// - "largest-weight-first": the symbol with the larger original weight wins the tie; falls back to
//   "symbol-id" if weights are also equal.
export type ReelStripSymbolWeightsRemainderTieBreakPolicy = "symbol-id" | "declared-order" | "largest-weight-first";
