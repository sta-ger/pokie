import crypto from "crypto";
import type {BetMode} from "../gamepackage/BetMode.js";
import type {GameBlueprint, GameBlueprintManifest, GameBlueprintMechanics, GameBlueprintWinModel} from "../generated/GameBlueprint.js";

// A sha256 hash of exactly the GameBlueprint fields "pokie par export"/"pokie par import" can
// represent (see ParSheetExporter's "no lossy export" preflight — reelStripGeneration/symbolWeights
// can never reach here), over a fixed field order and fixed key order within paytable — NOT
// `JSON.stringify(blueprint)` directly, whose key order follows whatever order the source object
// happened to be built in. That matters here specifically because a round-tripped blueprint is
// reconstructed by ParSheetImporter in its own fixed field order (and PaytableSheetMapper always
// writes match-count rows sorted ascending, regardless of the original JSON's key order) — so hashing
// raw insertion order would report a false "edited" mismatch on every untouched round trip. Array
// element order (symbols, reelStrips, paylines, availableBets, betModes) is left as-is: those are
// semantically order-sensitive, unlike a plain object's own key order.
//
// An empty optional array (e.g. `wilds: []`) and an omitted one hash identically, and likewise an
// empty optional manifest string (`description: ""`) and an omitted one — because ParSheetImporter
// never reconstructs an empty array/string for an optional field (see e.g. ManifestSheetMapper's own
// "blank cell means omit the field" rule), so a source blueprint that used `[]`/`""` instead of
// omitting the field would otherwise report a false "edited" mismatch on an untouched round trip too.
//
// Not a general-purpose "did this blueprint change" hash — see generated/computeGameBlueprintHash.ts's
// own doc comment for why that one exists separately (this one can't represent every GameBlueprint
// field, by design).
export function computeBlueprintHash(blueprint: GameBlueprint): string {
    return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalizeBlueprint(blueprint))).digest("hex")}`;
}

function canonicalizeBlueprint(blueprint: GameBlueprint): Record<string, unknown> {
    const canonical: Record<string, unknown> = {
        manifest: canonicalizeManifest(blueprint.manifest),
        reels: blueprint.reels,
        rows: blueprint.rows,
        symbols: blueprint.symbols,
    };
    setIfNonEmptyArray(canonical, "wilds", blueprint.wilds);
    setIfNonEmptyArray(canonical, "scatters", blueprint.scatters);
    canonical.paytable = canonicalizePaytable(blueprint.paytable);
    setIfNonEmptyArray(canonical, "reelStrips", blueprint.reelStrips);
    setIfNonEmptyArray(canonical, "paylines", blueprint.paylines);
    setIfNonEmptyArray(canonical, "availableBets", blueprint.availableBets);
    if (blueprint.winModel !== undefined) {
        canonical.winModel = canonicalizeWinModel(blueprint.winModel);
    }
    const mechanics = canonicalizeMechanics(blueprint.mechanics);
    if (mechanics !== undefined) {
        canonical.mechanics = mechanics;
    }
    setIfNonEmptyArray(canonical, "betModes", canonicalizeBetModes(blueprint.betModes));
    return canonical;
}

function canonicalizeWinModel(winModel: GameBlueprintWinModel): Record<string, unknown> {
    if (winModel.type === "clusters" && winModel.minimumClusterSize !== undefined) {
        return {type: "clusters", minimumClusterSize: winModel.minimumClusterSize};
    }
    return {type: winModel.type};
}

// mechanics.freeGames is the only sub-field GameBlueprintMechanics declares today — see its own doc
// comment — so an empty-vs-omitted "mechanics" object (`{}` vs. omitted entirely) hashes identically,
// the same "present but empty means omitted" rule the array fields above already follow.
function canonicalizeMechanics(mechanics: GameBlueprintMechanics | undefined): Record<string, unknown> | undefined {
    const freeGames = mechanics?.freeGames;
    if (freeGames === undefined) {
        return undefined;
    }
    const awardsByCount: Record<string, number> = {};
    for (const matches of Object.keys(freeGames.awardsByCount)
        .map(Number)
        .sort((a, b) => a - b)) {
        awardsByCount[String(matches)] = freeGames.awardsByCount[String(matches)];
    }
    return {freeGames: {scatterSymbol: freeGames.scatterSymbol, awardsByCount}};
}

function canonicalizeBetModes(betModes: BetMode[] | undefined): Record<string, unknown>[] | undefined {
    if (betModes === undefined) {
        return undefined;
    }
    return betModes.map((mode) => {
        const canonical: Record<string, unknown> = {id: mode.id};
        if (mode.label) {
            canonical.label = mode.label;
        }
        if (mode.costMultiplier !== undefined) {
            canonical.costMultiplier = mode.costMultiplier;
        }
        // The explicit, opt-in runtime-semantics fields (see gamepackage/BetMode.ts's own doc comment)
        // -- omitted here would mean two blueprints differing only in these fields (e.g. one with a
        // fully wired ante/buy-feature contract, one without) hash identically, hiding a real
        // behavioral change from provenance/diffing.
        if (mode.runtimeType !== undefined) {
            canonical.runtimeType = mode.runtimeType;
        }
        if (mode.isDefault !== undefined) {
            canonical.isDefault = mode.isDefault;
        }
        if (mode.forcedFreeGames !== undefined) {
            canonical.forcedFreeGames = mode.forcedFreeGames;
        }
        return canonical;
    });
}

function setIfNonEmptyArray<T>(canonical: Record<string, unknown>, key: string, value: T[] | undefined): void {
    if (value !== undefined && value.length > 0) {
        canonical[key] = value;
    }
}

function canonicalizeManifest(manifest: GameBlueprintManifest): Record<string, unknown> {
    const canonical: Record<string, unknown> = {id: manifest.id, name: manifest.name, version: manifest.version};
    if (manifest.description) {
        canonical.description = manifest.description;
    }
    if (manifest.author) {
        canonical.author = manifest.author;
    }
    return canonical;
}

function canonicalizePaytable(paytable: GameBlueprint["paytable"]): Record<string, Record<string, number>> {
    const canonical: Record<string, Record<string, number>> = {};
    for (const symbol of Object.keys(paytable).sort()) {
        const payouts = paytable[symbol];
        const canonicalPayouts: Record<string, number> = {};
        for (const matches of Object.keys(payouts).sort((a, b) => Number(a) - Number(b))) {
            canonicalPayouts[matches] = payouts[matches];
        }
        canonical[symbol] = canonicalPayouts;
    }
    return canonical;
}
