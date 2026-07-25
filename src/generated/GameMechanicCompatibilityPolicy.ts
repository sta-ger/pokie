import type {GameMechanicFeature} from "./GameMechanicFeature.js";

// Guards against a RandomGameBlueprintStrategy combining mechanics that GameBlueprintValidator (or
// the runtime) would reject or warn about together -- checked once, at construction, against the
// full feature set a strategy declares it populates (see RandomGameBlueprintStrategy.features),
// before any of that strategy's output is ever trusted.
export interface GameMechanicCompatibilityPolicy {
    isCompatible(features: readonly GameMechanicFeature[]): boolean;
}
