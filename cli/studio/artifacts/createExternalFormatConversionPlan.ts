import {
    FormatConversionPlan,
    FormatConversionPlanner,
    OutputFormat,
} from "@fromstan/pokie";

/**
 * Gives selector-backed Studio actions an explicit *unavailable* planner
 * terminal contract. A JSON file or a set of mixed selectors is not a
 * recognized POKIE Outcome Library bundle: it has neither canonical artifact
 * identity nor verified capabilities/provenance. Do not promote its shape to
 * an Outcome Library capability just because a legacy reader can parse it.
 *
 * Callers must resolve a single source through StudioFormatConversionPlanning
 * before they can obtain a planned conversion. This helper is intentionally a
 * recovery boundary, not a second source recognizer.
 */
export function createExternalOutcomeLibraryPlan(
    sourcePath: string | undefined,
    target: OutputFormat,
    destinationPath?: string,
): FormatConversionPlan {
    const planner = new FormatConversionPlanner();
    return planner.planIdentity(
        {
            kind: "outcomeLibrary",
            ...(sourcePath === undefined
                ? {recognitionProvenance: "mixed external Studio selectors"}
                : {canonicalLocation: sourcePath, recognitionProvenance: "external Studio selector"}),
            // An empty capability set is meaningful: the planner returns its
            // structured missing-recognized-source boundary instead of an
            // executable edge fabricated from a selector's filename or JSON
            // structure.
            capabilities: [],
        },
        target,
        destinationPath === undefined ? {} : {destinationPath},
    );
}

/**
 * A runtime loader failure is not project recognition.  Keep the path in the
 * result for recovery, but do not assign package capabilities merely because
 * a legacy runtime reader was asked to load it.
 */
export function createUnresolvedRuntimePlan(
    sourcePath: string,
    target: OutputFormat,
    destinationPath?: string,
): FormatConversionPlan {
    return new FormatConversionPlanner().planIdentity(
        {
            kind: "tsPackage",
            canonicalLocation: sourcePath,
            recognitionProvenance: "unresolved Studio project runtime",
            capabilities: [],
        },
        target,
        destinationPath === undefined ? {} : {destinationPath},
    );
}
