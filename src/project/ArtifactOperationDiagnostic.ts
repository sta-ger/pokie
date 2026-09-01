import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";
import type {PokieOperation} from "./PokieOperation.js";
import type {PokieProject} from "./PokieProject.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";

/**
 * The diagnostic retained by an artifact-facing caller after it has resolved
 * the real project it was asked to operate on. It intentionally takes a
 * PokieProject, never an artifact-kind label or arbitrary path, so a caller
 * cannot claim an unavailable boundary without exercising its public resolver.
 */
export type ArtifactOperationDiagnostic = UnsupportedProjectOperationDiagnostic & {
    readonly code: "unsupported-project-operation";
    readonly sharedOwner: "ArtifactOperationDiagnostic";
};

/**
 * Gives CLI and Studio artifact routes the capability diagnostic for their
 * already-resolved source. Capability policy remains owned by
 * describeUnsupportedProjectOperation; this adapter records the artifact
 * operation that reached that policy.
 */
export function describeUnavailableArtifactOperation(
    project: PokieProject,
    operation: PokieOperation,
): ArtifactOperationDiagnostic | undefined {
    const diagnostic = describeUnsupportedProjectOperation(project, operation);
    return diagnostic === undefined ? undefined : {
        ...diagnostic,
        code: "unsupported-project-operation",
        sharedOwner: "ArtifactOperationDiagnostic",
    };
}
