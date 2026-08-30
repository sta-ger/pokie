
/**
 * The interoperability report is deliberately an operation matrix, while
 * ProjectTargetResolver only resolves six project roots.  Keep the negative
 * half of that matrix in one domain owner so CLI, Studio, and the evidence
 * runner do not each manufacture a different explanation for a durable
 * companion that is not an operation input.
 */
export type ArtifactOperationDiagnostic = {
    readonly artifactKind: string;
    readonly operation: string;
    readonly sourcePath: string;
    readonly code: "unsupported-artifact-operation" | "unsupported-project-operation";
    readonly message: string;
    readonly recovery: string;
    readonly sharedOwner: "ArtifactOperationDiagnostic";
};

/**
 * Returns the exact shared diagnostic for an unavailable artifact-operation
 * pair.  A result is intentionally unavailable only when this owner returns
 * one; callers must execute the actual owner rather than retain a prose
 * approximation in evidence.
 */
export function describeUnavailableArtifactOperation(
    artifactKind: string,
    operation: string,
    sourcePath: string,
): ArtifactOperationDiagnostic | undefined {
    // A registry companion (or a project artifact in an operation with no
    // consuming owner) cannot become an input merely because it is durable.
    // This boundary is explicit rather than falling through to an unrelated
    // project parser or a command-local generic error.
    const recovery = `Use the producing workflow recorded for ${artifactKind}, or choose an operation that accepts ${sourcePath} as its input.`;
    return {
        artifactKind,
        operation,
        sourcePath,
        code: "unsupported-artifact-operation",
        message: `${sourcePath} is not an input to the ${operation} operation for ${artifactKind}. Next: ${recovery}`,
        recovery,
        sharedOwner: "ArtifactOperationDiagnostic",
    };
}
