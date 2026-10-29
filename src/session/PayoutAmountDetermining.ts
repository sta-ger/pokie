/** Optional exact wallet award for the last accepted play, distinct from a
 * mathematical win banked by a feature. Undefined preserves custom accounting. */
export interface PayoutAmountDetermining {
    getPayoutAmount(): number | undefined;
}
