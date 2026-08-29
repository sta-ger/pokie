// What a future ArtifactBuilder.build() resolves to on success: where the produced artifact now lives.
// Deliberately contract-only here, same as ProjectMaterializationResult was in P3-POLISH-02 -- no
// implementation wires a concrete builder to this shape yet (see ArtifactBuilder's own doc comment); this type
// only fixes what a future implementation must report.
/**
 * Describes whether a managed Outcome root belongs to this publication.  A
 * Studio registration rollback must not infer this from a plan-wide reuse
 * decision: a reused library can still be republished into a newly managed
 * root, while a PAR execution allocation can be deliberately transient.
 */
export type ManagedOutcomeProjectOwnership = {
    readonly rootPath: string;
    readonly sourceRootPath: string;
    readonly disposition: "owned" | "borrowed" | "transient";
};

export type ArtifactBuildResult = {
    readonly outputPath: string;
    // A direct Blueprint -> Outcome request may reuse an already registered compatible project instead of
    // producing a second bundle at its requested destination. Both values make that different destination
    // explicit to CLI and Studio callers; outputPath is always the actual opened project root.
    readonly requestedDestinationPath?: string;
    readonly reusedCompatibleProject?: boolean;
    // Registry-owned prerequisite Projects created or opened while producing this artifact.  Consumers
    // that maintain a Project registry (Studio) use this to register/open the actual Outcome Project,
    // instead of trying to rediscover a private path index after the Stake export has completed.
    readonly prerequisiteProjectRoots?: readonly string[];
    // Managed projects created or reopened as this artifact's actual result.  A direct Blueprint -> Outcome
    // request returns its registered Outcome Project here; Stake keeps using prerequisiteProjectRoots for
    // backward-compatible callers that display its generated prerequisite separately.
    readonly managedProjectRoots?: readonly string[];
    /** Per-root publication ownership for managedProjectRoots/prerequisites. */
    readonly managedOutcomeProjectOwnership?: readonly ManagedOutcomeProjectOwnership[];
    // A completed build repeats its up-front estimate so callers can retain an honest job summary after the
    // transient progress callback has gone away.
    readonly preflight?: import("./ArtifactBuildOptions.js").ArtifactBuildPreflight;
    /** Durable PAR import record retained beside this artifact, when it was derived from a workbook. */
    readonly conversionEvidencePath?: string;
    /** Durable imported Blueprint retained with a PAR-derived downstream artifact. */
    readonly importedBlueprintPath?: string;
    /** Stake publication evidence, present only for a successful Stake export. */
    readonly stakeManifest?: import("../stakeengine/StakeEngineManifest.js").StakeEngineManifest;
    readonly stakeFiles?: readonly string[];
};
