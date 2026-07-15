// What an ExternalDeploymentTarget needs from whatever content (ExternalDeploymentModeInput[]) is being
// deployed to it, checked by ExternalDeploymentCompatibilityValidator before any artifact is generated. All
// fields are optional and default to the most permissive reading (no minimum version, any symbol alphabet, no
// cross-mode homogeneity requirement) when omitted, the same "opt-in, permissive by default" convention as
// ExternalDeploymentTarget's own optional collaborators.
export type ExternalDeploymentRequirements = {
    // Lowest RoundArtifactProvenance.pokieVersion this target's own format/generator is known to understand,
    // compared against every deployed mode's own provenance.pokieVersion (major.minor.patch only — see
    // internal/compareSemverLite). Omit when the target has no known minimum.
    readonly minPokieVersion?: string;

    // "numeric" requires every screen/step symbol (the generic T in RoundArtifact<T>) across every deployed
    // outcome to be a `number`, never a string — for a target whose own external format only has a concept of
    // numeric reel/symbol ids (mirrors the same T-as-number convention RoundArtifact<T> itself supports).
    // "any" (the default when omitted) places no constraint on T.
    readonly symbolAlphabet?: "numeric" | "any";

    // When true (the default when omitted), every ExternalDeploymentModeInput in one deployment must share the
    // same game id/version, configHash, and pokieVersion — the same cross-mode provenance check
    // StakeEngineExportValidator already runs (see StakeEngineExportValidator's own provenanceKeyOf), since a
    // target's own manifest/index typically assumes "one deployment, one game build" the same way Stake's does.
    // Set to false only for a target that's deliberately designed to accept content from unrelated game builds
    // in a single deployment.
    readonly requiresHomogeneousProvenance?: boolean;
};
