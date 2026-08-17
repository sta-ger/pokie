// What a future ArtifactBuilder.build() resolves to on success: where the produced artifact now lives.
// Deliberately contract-only here, same as ProjectMaterializationResult was in P3-POLISH-02 -- no
// implementation wires a concrete builder to this shape yet (see ArtifactBuilder's own doc comment); this type
// only fixes what a future implementation must report.
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
};
