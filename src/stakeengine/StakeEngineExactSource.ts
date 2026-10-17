/** Captured Stake payload bytes, encoded as base64. Weights remain decimal CSV text. */
export type StakeEngineExactSource = {
    readonly files: Readonly<Record<string, string>>;
};
