import type {ExternalDeploymentModeInput} from "./ExternalDeploymentModeInput.js";
import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";

// What ExternalDeploymentCompatibilityValidator checks: one target's own requirements/capabilities against a
// specific deployment's content. There is no separate "current pokie version" field — a minPokieVersion
// requirement is checked against the content's own provenance.pokieVersion (the pokie release that actually
// built the RoundArtifacts being deployed), the same way every other provenance fact used here is read off the
// content itself rather than passed in out of band.
export type ExternalDeploymentCompatibilityContext<T extends string | number = string> = {
    readonly target: ExternalDeploymentTarget<T>;
    readonly modes: readonly ExternalDeploymentModeInput<T>[];
};
