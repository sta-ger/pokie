import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {WeightedOutcomeLibraryValidator} from "../weightedoutcome/WeightedOutcomeLibraryValidator.js";
import type {WeightedOutcome} from "../weightedoutcome/WeightedOutcome.js";
import {
    MULTI_MODE_DEPLOYMENT_CAPABILITY,
    ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY,
    ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY,
} from "./ExternalDeploymentCapability.js";
import type {ExternalDeploymentCompatibilityContext} from "./ExternalDeploymentCompatibilityContext.js";
import type {ExternalDeploymentCompatibilityValidating} from "./ExternalDeploymentCompatibilityValidating.js";
import type {ExternalDeploymentModeInput} from "./ExternalDeploymentModeInput.js";
import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";
import {compareSemverLite} from "./internal/compareSemverLite.js";

// A single mode's provenance, read off its library's first outcome — mirrors StakeEngineExportValidator's own
// provenanceKeyOf exactly, so "homogeneous across modes" means the same thing in both places.
type ModeProvenanceKey = {
    gameId: unknown;
    gameVersion: unknown;
    configHash: unknown;
    pokieVersion: unknown;
};

function provenanceKeyOf<T extends string | number>(mode: ExternalDeploymentModeInput<T>): ModeProvenanceKey | undefined {
    const provenance = mode.library.outcomes[0]?.artifact?.provenance;
    if (provenance === undefined) {
        return undefined;
    }
    return {
        gameId: provenance.game?.id,
        gameVersion: provenance.game?.version,
        configHash: provenance.configHash,
        pokieVersion: provenance.pokieVersion,
    };
}

function everyArtifactOf<T extends string | number>(modes: readonly ExternalDeploymentModeInput<T>[]): readonly RoundArtifact<T>[] {
    return modes.flatMap((mode) => mode.library.outcomes.map((outcome: WeightedOutcome<T>) => outcome.artifact));
}

function hasNonNumericSymbol<T extends string | number>(artifact: RoundArtifact<T>): boolean {
    const screens = [artifact.screen, ...artifact.steps.map((step) => step.screen)];
    return screens.some((screen) => screen.some((row) => row.some((symbol) => typeof symbol !== "number")));
}

// Checks one ExternalDeploymentTarget's own requirements/capabilities against a specific deployment's content —
// always run before ExternalArtifactGenerator.generate() is ever called (see docs/external-adapter-sdk.md for
// the intended pipeline: compatibility check -> generate -> ExternalArtifactValidator), so an incompatible
// deployment fails fast instead of wasting a generation pass. Additively runs WeightedOutcomeLibraryValidator
// against every mode's own library first — the same "never treat a malformed library as valid" convention
// StakeEngineExportValidator uses. Never throws.
export class ExternalDeploymentCompatibilityValidator<T extends string | number = string> implements ExternalDeploymentCompatibilityValidating<T> {
    private readonly libraryValidator = new WeightedOutcomeLibraryValidator<T>();

    public validate(context: ExternalDeploymentCompatibilityContext<T>): ValidationIssue[] {
        try {
            return this.validateInternal(context);
        } catch (error) {
            return [
                {
                    code: "external-deployment-compatibility-malformed",
                    severity: "error",
                    message: `External deployment compatibility could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(context: ExternalDeploymentCompatibilityContext<T>): ValidationIssue[] {
        const {target, modes} = context;
        const issues: ValidationIssue[] = [];

        if (modes.length === 0) {
            issues.push({
                code: "external-deployment-modes-empty",
                severity: "error",
                message: `Deployment to target "${target.id}" requires at least one mode.`,
                details: {targetId: target.id},
            });
            return issues;
        }

        modes.forEach((mode) => {
            this.libraryValidator.validate(mode.library).forEach((issue) => {
                issues.push({...issue, message: `mode "${mode.modeName}": ${issue.message}`, details: {...issue.details, modeName: mode.modeName}});
            });
        });

        this.validateModeNames(target.id, modes, issues);

        if (modes.length > 1 && !target.capabilities.includes(MULTI_MODE_DEPLOYMENT_CAPABILITY)) {
            issues.push({
                code: "external-deployment-multi-mode-unsupported",
                severity: "error",
                message: `Target "${target.id}" does not declare the "${MULTI_MODE_DEPLOYMENT_CAPABILITY}" capability, but ${modes.length} modes were given.`,
                details: {targetId: target.id, modeCount: modes.length},
            });
        }

        if (target.requirements.requiresHomogeneousProvenance !== false) {
            this.validateHomogeneousProvenance(target.id, modes, issues);
        }

        const artifacts = everyArtifactOf(modes);
        this.validateMinPokieVersion(target, artifacts, issues);
        this.validateSymbolAlphabet(target, artifacts, issues);
        this.validateFeatureCapabilities(target, artifacts, issues);

        return issues;
    }

    private validateModeNames(targetId: string, modes: readonly ExternalDeploymentModeInput<T>[], issues: ValidationIssue[]): void {
        const seenNames = new Map<string, string>(); // lowercase name -> original name

        modes.forEach((mode, position) => {
            if (typeof mode.modeName !== "string" || mode.modeName.trim().length === 0) {
                issues.push({
                    code: "external-deployment-mode-name-invalid",
                    severity: "error",
                    message: `mode at position ${position} has an invalid modeName (${JSON.stringify(mode.modeName)}); it must be a non-empty string.`,
                    details: {targetId, position, modeName: mode.modeName},
                });
                return;
            }

            const lowerName = mode.modeName.toLowerCase();
            const existing = seenNames.get(lowerName);
            if (existing === undefined) {
                seenNames.set(lowerName, mode.modeName);
                return;
            }

            if (existing === mode.modeName) {
                issues.push({
                    code: "external-deployment-duplicate-mode-name",
                    severity: "error",
                    message: `modeName "${mode.modeName}" is used by more than one mode.`,
                    details: {targetId, modeName: mode.modeName},
                });
            } else {
                issues.push({
                    code: "external-deployment-mode-name-case-collision",
                    severity: "error",
                    message: `modeName "${mode.modeName}" differs only in case from modeName "${existing}"; this target's own generator may produce colliding output for the two.`,
                    details: {targetId, modeName: mode.modeName, collidesWith: existing},
                });
            }
        });
    }

    private validateHomogeneousProvenance(targetId: string, modes: readonly ExternalDeploymentModeInput<T>[], issues: ValidationIssue[]): void {
        let reference: ModeProvenanceKey | undefined;

        modes.forEach((mode) => {
            const current = provenanceKeyOf(mode);
            if (reference === undefined) {
                reference = current;
                return;
            }
            if (
                current !== undefined &&
                (current.gameId !== reference.gameId ||
                    current.gameVersion !== reference.gameVersion ||
                    current.configHash !== reference.configHash ||
                    current.pokieVersion !== reference.pokieVersion)
            ) {
                issues.push({
                    code: "external-deployment-provenance-mismatch",
                    severity: "error",
                    message: `mode "${mode.modeName}" has different provenance (game id/version, configHash, or pokieVersion) than this deployment's other modes; target "${targetId}" requires homogeneous provenance across modes.`,
                    details: {targetId, modeName: mode.modeName},
                });
            }
        });
    }

    private validateMinPokieVersion(target: ExternalDeploymentTarget<T>, artifacts: readonly RoundArtifact<T>[], issues: ValidationIssue[]): void {
        const minVersion = target.requirements.minPokieVersion;
        if (minVersion === undefined) {
            return;
        }

        const seenVersions = new Set(artifacts.map((artifact) => artifact.provenance.pokieVersion));
        seenVersions.forEach((actualVersion) => {
            const comparison = compareSemverLite(actualVersion, minVersion);
            if (comparison === undefined) {
                issues.push({
                    code: "external-deployment-pokie-version-not-comparable",
                    severity: "error",
                    message: `Target "${target.id}" requires minPokieVersion "${minVersion}", but content provenance.pokieVersion "${actualVersion}" could not be parsed as major.minor.patch.`,
                    details: {targetId: target.id, minPokieVersion: minVersion, actualVersion},
                });
            } else if (comparison < 0) {
                issues.push({
                    code: "external-deployment-pokie-version-too-old",
                    severity: "error",
                    message: `Target "${target.id}" requires at least pokieVersion "${minVersion}", but content was built with pokieVersion "${actualVersion}".`,
                    details: {targetId: target.id, minPokieVersion: minVersion, actualVersion},
                });
            }
        });
    }

    private validateSymbolAlphabet(target: ExternalDeploymentTarget<T>, artifacts: readonly RoundArtifact<T>[], issues: ValidationIssue[]): void {
        if (target.requirements.symbolAlphabet !== "numeric") {
            return;
        }

        if (artifacts.some((artifact) => hasNonNumericSymbol(artifact))) {
            issues.push({
                code: "external-deployment-symbol-alphabet-invalid",
                severity: "error",
                message: `Target "${target.id}" requires a numeric symbol alphabet, but at least one deployed RoundArtifact's screen contains a non-numeric symbol.`,
                details: {targetId: target.id},
            });
        }
    }

    private validateFeatureCapabilities(target: ExternalDeploymentTarget<T>, artifacts: readonly RoundArtifact<T>[], issues: ValidationIssue[]): void {
        const usesFeatureEvents = artifacts.some(
            (artifact) => (artifact.featureEvents?.length ?? 0) > 0 || artifact.steps.some((step) => (step.featureEvents?.length ?? 0) > 0),
        );
        if (usesFeatureEvents && !target.capabilities.includes(ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY)) {
            issues.push({
                code: "external-deployment-feature-events-unsupported",
                severity: "error",
                message: `Target "${target.id}" does not declare the "${ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY}" capability, but the deployed content includes feature events.`,
                details: {targetId: target.id},
            });
        }

        const usesDebugMetadata = artifacts.some((artifact) => artifact.debug !== undefined || artifact.steps.some((step) => step.debug !== undefined));
        if (usesDebugMetadata && !target.capabilities.includes(ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY)) {
            issues.push({
                code: "external-deployment-debug-metadata-unsupported",
                severity: "error",
                message: `Target "${target.id}" does not declare the "${ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY}" capability, but the deployed content includes debug metadata.`,
                details: {targetId: target.id},
            });
        }
    }
}
