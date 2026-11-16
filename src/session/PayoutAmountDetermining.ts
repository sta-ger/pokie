/** Optional exact signed wallet settlement for the last accepted play, distinct from a
 * mathematical win banked by a feature. Undefined preserves custom accounting.
 * Implementations must cover all composed debit/credit effects, not just mathematical win;
 * inheriting a built-in provider does not certify custom execution. */
export interface PayoutAmountDetermining {
    getPayoutAmount(): number | undefined;
}
