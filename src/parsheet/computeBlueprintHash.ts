import crypto from "crypto";
import type {GameBlueprint, GameBlueprintManifest} from "../generated/GameBlueprint.js";

// A sha256 hash of exactly the GameBlueprint fields "pokie par export"/"pokie par import" can
// represent (see ParSheetExporter's "no lossy export" preflight — reelStripGeneration/symbolWeights
// can never reach here), over a fixed field order and fixed key order within paytable — NOT
// `JSON.stringify(blueprint)` directly, whose key order follows whatever order the source object
// happened to be built in. That matters here specifically because a round-tripped blueprint is
// reconstructed by ParSheetImporter in its own fixed field order (and PaytableSheetMapper always
// writes match-count rows sorted ascending, regardless of the original JSON's key order) — so hashing
// raw insertion order would report a false "edited" mismatch on every untouched round trip. Array
// element order (symbols, reelStrips, paylines, availableBets) is left as-is: those are semantically
// order-sensitive, unlike a plain object's own key order.
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
    if (blueprint.wilds !== undefined) {
        canonical.wilds = blueprint.wilds;
    }
    if (blueprint.scatters !== undefined) {
        canonical.scatters = blueprint.scatters;
    }
    canonical.paytable = canonicalizePaytable(blueprint.paytable);
    if (blueprint.reelStrips !== undefined) {
        canonical.reelStrips = blueprint.reelStrips;
    }
    if (blueprint.paylines !== undefined) {
        canonical.paylines = blueprint.paylines;
    }
    if (blueprint.availableBets !== undefined) {
        canonical.availableBets = blueprint.availableBets;
    }
    return canonical;
}

function canonicalizeManifest(manifest: GameBlueprintManifest): Record<string, unknown> {
    const canonical: Record<string, unknown> = {id: manifest.id, name: manifest.name, version: manifest.version};
    if (manifest.description !== undefined) {
        canonical.description = manifest.description;
    }
    if (manifest.author !== undefined) {
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
