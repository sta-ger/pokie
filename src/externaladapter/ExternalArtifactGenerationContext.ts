import type {ExternalRoundProjector} from "./ExternalRoundProjector.js";

// Passed to every ExternalArtifactGenerator.generate() call, carrying the *same* ExternalRoundProjector
// instance its own ExternalDeploymentTarget declares as "roundProjector" — never a second, independently
// constructed one. ExternalDeploymentService always builds this straight from `target.roundProjector` (see that
// class's own doc comment), so a generator implementation has nowhere left to hold a private, possibly-diverged
// default projector of its own: it has no projector at all until it's handed one here, on every call.
export type ExternalArtifactGenerationContext<T extends string | number = string> = {
    readonly roundProjector: ExternalRoundProjector<T>;
};
