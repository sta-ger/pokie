// One saved-design identity policy shared by the optimizer panel and its unit tests. The optimizer's
// request revision is the design *before* Apply; an applied candidate deliberately changes the source,
// so comparing that old revision with the current one would mark every successful Apply as stale.
// After Apply the server records the post-write revision; only a later change to the source makes the
// retained verdict historical.
export type OptimizationResultFreshness = {
    active: boolean;
    /** An authored Apply marker exists (locally or in the retained job). */
    hasApplied: boolean;
    /** Post-Apply source revision, when the server recorded it. */
    appliedRevision?: string;
    /** The current saved-source revision, when the project view has loaded it. */
    currentRevision?: string;
    /** Every revision carried by the optimizer result itself (typically the pre-Apply revision). */
    resultRevisions: readonly string[];
    /** True when the parent reported a saved-source change, even if its revision is not available yet. */
    sourceChangePresent: boolean;
};

export function isOptimizationResultStale(input: OptimizationResultFreshness): boolean {
    if (input.active) return false;
    if (input.hasApplied) {
        // Without a current revision we cannot prove a change; keep the receipt. As soon as the
        // project reports a revision, an unrecorded post-Apply revision is treated as historical
        // rather than presenting an unverifiable number as current.
        if (input.currentRevision === undefined) return false;
        if (input.appliedRevision === undefined) return true;
        return input.appliedRevision !== input.currentRevision;
    }
    if (input.currentRevision !== undefined && input.resultRevisions.some((revision) => revision !== input.currentRevision)) {
        return true;
    }
    // A retained result with no recorded source revision cannot prove it describes the current saved
    // source. Once the project view supplies a current revision, treat it as historical rather than
    // showing an unverifiable verdict as current. This also covers legacy jobs opened after a reload,
    // where the in-memory "source changed" signal no longer exists.
    if (input.currentRevision !== undefined) return input.resultRevisions.length === 0;
    return input.sourceChangePresent;
}
