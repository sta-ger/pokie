import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {buildGameModelReels, type BuildGameModelReelsOptions} from "./buildGameModelReels.js";
import type {
    GameModelBasics,
    GameModelLimits,
    GameModelPaytableRow,
    GameModelProjection,
    GameModelSection,
    GameModelSymbol,
    GameModelWinModel,
} from "./GameModelProjection.js";

function available<T>(data: T): GameModelSection<T> {
    return {status: "available", data};
}

function unavailable<T>(reason: string): GameModelSection<T> {
    return {status: "unavailable", reason};
}

// symbolId -> matchCount (string key) -> payout, the exact shape GameBlueprint.paytable is authored in
// (see its own doc comment) -- flattened here, once, into the row shape the Game Model tab actually
// displays, so no downstream caller re-derives this from the nested record itself.
function flattenPaytable(paytable: GameBlueprint["paytable"]): GameModelPaytableRow[] {
    const rows: GameModelPaytableRow[] = [];
    for (const [symbolId, payouts] of Object.entries(paytable)) {
        for (const [matchCount, payout] of Object.entries(payouts)) {
            rows.push({symbolId, matchCount: Number(matchCount), payout});
        }
    }
    return rows.sort((a, b) => (a.symbolId === b.symbolId ? a.matchCount - b.matchCount : a.symbolId.localeCompare(b.symbolId)));
}

// Pure min/max of `availableBets` -- see GameModelLimits' own doc comment for why this never invents a
// number beyond what the blueprint itself already declares.
function deriveLimits(availableBets: number[]): GameModelLimits {
    if (availableBets.length === 0) {
        return {};
    }
    return {minBet: Math.min(...availableBets), maxBet: Math.max(...availableBets)};
}

export type GameModelProjectionFallback = {
    // Best-effort identity for a project whose own tracked source blueprint isn't available (see
    // `reason` below for why) -- typically a build's own recorded manifest (GameBuildInfo.game) or a
    // package.json's name/version/description. Omitted entirely (not merely all-undefined fields) when
    // nothing at all is known, which is what makes `basics` itself "unavailable" too.
    manifest?: GameModelBasics;
    // Why every other section (and `basics`, when `manifest` is also omitted) is "unavailable" -- shown
    // to the user verbatim as that section's own diagnostic.
    reason: string;
};

// The one place a project's GameBlueprint (or the lack of one) is turned into its own canonical read
// model -- see GameModelProjection.ts's own doc comment for why every section is wrapped in an explicit
// available/unavailable status rather than a caller having to guess "empty" from "not introspectable".
// Pure and synchronous: resolving *which* blueprint (if any) applies to the current project is the
// caller's own concern, not this function's.
export function buildGameModelProjection(
    blueprint: GameBlueprint | undefined,
    fallback?: GameModelProjectionFallback,
    reelsOptions?: BuildGameModelReelsOptions,
): GameModelProjection {
    if (blueprint === undefined) {
        const reason = fallback?.reason ?? "This project's game model isn't available.";
        const basics: GameModelSection<GameModelBasics> = fallback?.manifest !== undefined ? available(fallback.manifest) : unavailable(reason);
        return {
            basics,
            layout: unavailable(reason),
            symbols: unavailable(reason),
            reels: unavailable(reason),
            paytable: unavailable(reason),
            betsAndModes: unavailable(reason),
            mechanics: unavailable(reason),
            limits: unavailable(reason),
        };
    }

    const winModel: GameModelWinModel = blueprint.winModel ?? {type: "lines"};
    const symbols: GameModelSymbol[] = blueprint.symbols.map((id) => ({
        id,
        isWild: (blueprint.wilds ?? []).includes(id),
        isScatter: (blueprint.scatters ?? []).includes(id),
    }));
    const availableBets = blueprint.availableBets ?? [];

    return {
        basics: available({...blueprint.manifest}),
        layout: available({
            reels: blueprint.reels,
            rows: blueprint.rows,
            winModel,
            paylineCount: winModel.type === "lines" ? (blueprint.paylines?.length ?? 0) : undefined,
        }),
        symbols: available(symbols),
        reels: available(buildGameModelReels(blueprint, reelsOptions)),
        paytable: available(flattenPaytable(blueprint.paytable)),
        betsAndModes: available({
            availableBets,
            betModes: (blueprint.betModes ?? []).map((mode) => ({id: mode.id, label: mode.label, costMultiplier: mode.costMultiplier, targetRtp: mode.targetRtp})),
        }),
        mechanics: available({freeGames: blueprint.mechanics?.freeGames}),
        limits: available(deriveLimits(availableBets)),
    };
}
