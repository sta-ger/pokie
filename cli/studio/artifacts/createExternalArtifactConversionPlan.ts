import {
    ArtifactConversionPlan,
    ArtifactConversionPlanner,
    ArtifactTargetType,
    OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    STAKE_ADAPTER_EXPORT_CAPABILITY,
} from "pokie";

/**
 * Gives selector-backed Studio actions the same explicit planner terminal
 * contract as a resolved POKIE project.  A standalone JSON library is still a
 * legitimate read-only Outcome Library input, but it has no managed-project
 * provenance; mixed selectors have no single source identity and are therefore
 * deliberately unavailable instead of being decorated with the open project.
 */
export function createExternalOutcomeLibraryPlan(
    sourcePath: string | undefined,
    target: ArtifactTargetType,
    destinationPath?: string,
): ArtifactConversionPlan {
    const planner = new ArtifactConversionPlanner();
    return planner.planIdentity(
        {
            kind: "outcomeLibrary",
            ...(sourcePath === undefined
                ? {recognitionProvenance: "mixed external Studio selectors"}
                : {canonicalLocation: sourcePath, recognitionProvenance: "external Studio selector"}),
            capabilities: [OUTCOME_LIBRARY_READ_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY],
        },
        target,
        destinationPath === undefined ? {} : {destinationPath},
    );
}

/** A project root that cannot be resolved still receives a concrete recovery plan. */
export function createUnresolvedRuntimePlan(
    sourcePath: string,
    target: ArtifactTargetType,
    destinationPath?: string,
): ArtifactConversionPlan {
    return new ArtifactConversionPlanner().planIdentity(
        {
            kind: "tsPackage",
            canonicalLocation: sourcePath,
            recognitionProvenance: "unresolved Studio project runtime",
            capabilities: [OUTCOME_LIBRARY_GENERATE_CAPABILITY],
        },
        target,
        destinationPath === undefined ? {} : {destinationPath},
    );
}
