import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {validateAuthoredMechanics} from "../generated/validateAuthoredMechanics.js";
import type {PackageBlueprintExtractionResult} from "../generated/PackageBlueprintExtraction.js";
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

function projectMechanics(blueprint: GameBlueprint): GameModelProjection["mechanics"] {
    try {
        const issues = validateAuthoredMechanics(blueprint as unknown as Record<string, unknown>)
            .filter(issue => issue.severity === "error");
        return issues.length > 0
            ? {status: "invalid", reason: issues.map(issue => `${issue.code}: ${issue.message}`).join("\n")}
            : available(JSON.parse(JSON.stringify(blueprint.mechanics ?? {})));
    } catch {
        // Keep unexpected validation failures local to mechanics as a defensive boundary,
        // so unrelated sections remain inspectable even if a future rule validator throws.
        return {status: "invalid", reason: "blueprint-mechanics-invalid: mechanics: These rule fields could not be validated. Check their value types."};
    }
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
    // Draft previews deliberately bypass whole-blueprint validation. Mechanics must still satisfy
    // their shared authored contract before a renderer can dereference or display nested fields.
    // Keep the invalid section separate from unavailable sources and from a valid empty rule set;
    // neither the draft nor unrelated inspectable sections are discarded or repaired here.

    return {
        basics: available({...blueprint.manifest}),
        layout: available({
            reels: blueprint.reels,
            rows: blueprint.rows,
            ...(blueprint.screenGeometry ? {screenGeometry: JSON.parse(JSON.stringify(blueprint.screenGeometry))} : {}),
            winModel,
            paylineCount: winModel.type === "lines" ? (blueprint.paylines?.length ?? 0) : undefined,
        }),
        symbols: available(symbols),
        reels: available(buildGameModelReels(blueprint, reelsOptions)),
        paytable: available(flattenPaytable(blueprint.paytable)),
        betsAndModes: available({
            availableBets,
            betModes: (blueprint.betModes ?? []).map((mode) => ({...mode})),
        }),
        mechanics: projectMechanics(blueprint),
        limits: available(deriveLimits(availableBets)),
    };
}


/** Read-only sections consume the same extraction result used by artifact preflight. */
export function buildPackageGameModelProjection(extraction: PackageBlueprintExtractionResult): GameModelProjection {
    const reason = extraction.diagnostics.map(issue => `${issue.path}: ${issue.code}: ${issue.message}`).join("; ") || "No complete public package model is available.";
    const model = extraction.model;
    // An explicitly unsupported custom mechanic blocks generation, but not inspection of unrelated
    // representable sections. Its diagnostics still make the mechanics section unavailable below.
    const valid = model && !new GameBlueprintValidator().validate(model).some(issue => issue.severity === "error" && !(
        issue.code === "blueprint-mechanics-unknown-field" && extraction.diagnostics.some(diagnostic =>
            diagnostic.code === "unsupported-model-field" && diagnostic.path === issue.path,
        )
    ));
    const effective = valid ? {...model, availableBets: model!.availableBets ?? [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100],
        paylines: model!.paylines ?? Array.from({length: model!.screenGeometry?.evaluated.rows ?? model!.rows!}, (_, row) => Array.from({length: model!.reels!}, () => row)),} as GameBlueprint : undefined;
    const projection = valid ? buildGameModelProjection(effective!) : buildGameModelProjection(undefined, {manifest: model?.manifest, reason});
    projection.packageExtraction = extraction;
    if (!valid && model && extraction.status === "partial") {
        if (Number.isInteger(model.reels) && Number.isInteger(model.rows) && model.reels! > 0 && model.rows! > 0) {
            const winModel = model.winModel ?? {type: "lines"};
            projection.layout = available({reels: model.reels, rows: model.rows, screenGeometry: model.screenGeometry, winModel, paylineCount: winModel.type === "lines" ? model.paylines?.length : undefined});
        }
        if (Array.isArray(model.symbols) && model.symbols.every(symbol => typeof symbol === "string")) {
            projection.symbols = available(model.symbols.map(id => ({id, isWild: model.wilds?.includes(id) ?? false, isScatter: model.scatters?.includes(id) ?? false})));
        }
        if (model.availableBets) {
            projection.betsAndModes = available({availableBets: model.availableBets, betModes: model.betModes ?? []});
            projection.limits = available(deriveLimits(model.availableBets));
        }
    }
    const sections: Record<string, keyof Omit<GameModelProjection, "packageExtraction">> = {
        manifest: "basics", reels: "layout", rows: "layout", screenGeometry: "layout", winModel: "layout", paylines: "layout",
        symbols: "symbols", wilds: "symbols", scatters: "symbols", reelStrips: "reels", reelSequences: "reels", paytable: "paytable",
        availableBets: "betsAndModes", betModes: "betsAndModes", mechanics: "mechanics",
    };
    const sectionDiagnostics = new Map<keyof Omit<GameModelProjection, "packageExtraction">, string[]>();
    for (const diagnostic of extraction.diagnostics.filter(issue => issue.severity === undefined || issue.severity === "error")) {
        const section = sections[diagnostic.path.split(".")[0]];
        if (section) {
            const diagnostics = sectionDiagnostics.get(section) ?? [];
            diagnostics.push(`${diagnostic.path}: ${diagnostic.code}: ${diagnostic.message}`);
            sectionDiagnostics.set(section, diagnostics);
        }
    }
    for (const [section, diagnostics] of sectionDiagnostics) {
        projection[section] = unavailable(diagnostics.join("; "));
    }
    return projection;
}
