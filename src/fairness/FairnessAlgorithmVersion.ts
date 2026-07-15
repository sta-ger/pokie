// The one supported deterministic byte-stream algorithm behind every POKIE Provably Fair proof: HMAC-SHA256 in
// counter mode, keyed by the round's revealed serverSeed, over `${clientSeed}:${nonce}:${counter}` (see
// HmacFairnessRandomSource) — reduced to an unbiased integer draw via the same drawUnbiasedInt rejection-
// sampling core every other WeightedOutcomeRandomSource in this codebase already shares. A FairnessRoundProof
// carrying any other value is rejected by FairnessRoundProofValidator rather than guessed at — bump this only
// if the byte-stream construction itself ever changes.
export const POKIE_FAIRNESS_ALGORITHM_VERSION = "pokie-fairness-hmac-sha256-v1";
