import {
    DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG,
    type GameMechanicCompatibilityCatalogEntry,
} from "./GameMechanicCompatibilityCatalog.js";
import type {GameMechanicCompatibilityPolicy} from "./GameMechanicCompatibilityPolicy.js";
import type {GameMechanicFeature} from "./GameMechanicFeature.js";

function toCatalogKey(features: readonly GameMechanicFeature[]): string {
    return [...new Set(features)].sort().join(",");
}

// Backed by an explicit catalog of known-safe feature combinations (see
// GameMechanicCompatibilityCatalog) rather than a single hard-coded rule: a strategy's declared
// features are compatible only if they exactly match one catalog entry (as a set -- order and
// duplicates in "features" don't matter). Defaults to DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG, but
// accepts a narrower or wider catalog for callers who want to be stricter, or who have proven a
// combination this default catalog doesn't yet know about.
export class DefaultGameMechanicCompatibilityPolicy implements GameMechanicCompatibilityPolicy {
    private readonly catalogKeys: ReadonlySet<string>;

    constructor(catalog: readonly GameMechanicCompatibilityCatalogEntry[] = DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG) {
        this.catalogKeys = new Set(catalog.map(toCatalogKey));
    }

    public isCompatible(features: readonly GameMechanicFeature[]): boolean {
        return this.catalogKeys.has(toCatalogKey(features));
    }
}
