import type {GameBlueprintValidating} from "./GameBlueprintValidating.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";

const REEL_STRIP_CONSTRAINT_TYPES = [
    "minimumCircularDistance",
    "maximumCircularDistance",
    "maximumConsecutiveOccurrences",
    "forbiddenAdjacency",
    "requiredAdjacency",
    "forbiddenSequence",
    "requiredSequence",
];
const REEL_STRIP_ROUNDING_POLICIES = ["floor", "round", "ceil"];
const REEL_STRIP_TIE_BREAK_POLICIES = ["symbol-id", "declared-order", "largest-weight-first"];

const SUSPICIOUS_REELS_OR_ROWS_THRESHOLD = 10;
// Below this many matching symbols, a non-scatter (line-pay) payout hits so often it behaves more
// like a scatter than a line win — most line-pay symbols start paying at 3-of-a-kind.
const FREQUENT_LOW_MATCH_COUNT = 2;
// A non-scatter symbol's payout at its own lowest configured match count (its "entry tier", usually
// 3-of-a-kind) above this multiplier is unusually generous — most line-pay symbols save bigger
// multipliers for higher match counts, not their most frequent one.
const SUSPICIOUS_ENTRY_TIER_MULTIPLIER = 10;
// A symbol making up more than this share of a reel's weighting will visibly dominate the reels.
const DOMINANT_SYMBOL_WEIGHT_SHARE = 0.4;

type SymbolPayout = {times: number; multiplier: number};

export class GameBlueprintValidator implements GameBlueprintValidating {
    public validate(blueprint: unknown): ValidationIssue[] {
        if (typeof blueprint !== "object" || blueprint === null || Array.isArray(blueprint)) {
            return [
                {code: "blueprint-not-object", severity: "error", message: "The blueprint must be a JSON object."},
            ];
        }

        const issues: ValidationIssue[] = [];
        const b = blueprint as Record<string, unknown>;

        this.validateManifest(b.manifest, issues);

        const reels = b.reels;
        const reelsValid = typeof reels === "number" && Number.isInteger(reels) && reels >= 1;
        if (!reelsValid) {
            issues.push({code: "blueprint-reels-invalid", severity: "error", message: '"reels" must be a positive integer.', path: "reels"});
        } else if ((reels as number) > SUSPICIOUS_REELS_OR_ROWS_THRESHOLD) {
            issues.push({
                code: "blueprint-reels-suspicious",
                severity: "warning",
                message: `"reels" is ${reels}, which is unusually large for a line-pay video slot (most use 3-7 reels) — double-check this is intentional.`,
                path: "reels",
            });
        }

        const rows = b.rows;
        const rowsValid = typeof rows === "number" && Number.isInteger(rows) && rows >= 1;
        if (!rowsValid) {
            issues.push({code: "blueprint-rows-invalid", severity: "error", message: '"rows" must be a positive integer.', path: "rows"});
        } else if ((rows as number) > SUSPICIOUS_REELS_OR_ROWS_THRESHOLD) {
            issues.push({
                code: "blueprint-rows-suspicious",
                severity: "warning",
                message: `"rows" is ${rows}, which is unusually large for a line-pay video slot (most use 3-7 rows) — double-check this is intentional.`,
                path: "rows",
            });
        }

        const symbols = b.symbols;
        const symbolsValid =
            Array.isArray(symbols) && symbols.length > 0 && symbols.every((s) => typeof s === "string" && s.length > 0);
        if (!symbolsValid) {
            issues.push({
                code: "blueprint-symbols-invalid",
                severity: "error",
                message: '"symbols" must be a non-empty array of non-empty strings.',
            });
        }
        const symbolList = symbolsValid ? (symbols as string[]) : [];
        if (symbolsValid && new Set(symbolList).size !== symbolList.length) {
            issues.push({code: "blueprint-symbols-duplicate", severity: "error", message: '"symbols" must not contain duplicate ids.'});
        }
        const symbolSet = new Set(symbolList);

        const wilds = this.validateSymbolSubset(b.wilds, "wilds", symbolSet, symbolsValid, issues);
        const scatters = this.validateSymbolSubset(b.scatters, "scatters", symbolSet, symbolsValid, issues);
        this.validateWildScatterOverlap(wilds, scatters, issues);

        // Line/ways match-counts are bounded by "reels" (a symbol can match on at most one reel each);
        // a cluster's size is bounded by the whole grid ("reels" * "rows") instead, since a cluster can
        // span every cell -- capping cluster paytable keys at "reels" would reject the very sizes a
        // cluster-pay game actually needs to define payouts for.
        const isClustersWinModel = this.isClustersWinModel(b.winModel);
        let maxMatchCount: number | undefined;
        if (isClustersWinModel) {
            maxMatchCount = reelsValid && rowsValid ? (reels as number) * (rows as number) : undefined;
        } else {
            maxMatchCount = reelsValid ? (reels as number) : undefined;
        }
        const paytableSymbols = this.validatePaytable(b.paytable, symbolSet, symbolsValid, wilds, maxMatchCount, issues);
        this.validatePaylines(b.paylines, reels, reelsValid, rows, rowsValid, issues);
        const reelStripSymbols = this.validateReelStrips(b.reelStrips, symbolSet, symbolsValid, reels, reelsValid, rows, rowsValid, issues);
        const reelStripGenerationSymbols = this.validateReelStripGeneration(b.reelStripGeneration, symbolSet, symbolsValid, reels, reelsValid, issues);
        const weightSymbols = this.validateSymbolWeights(b.symbolWeights, symbolSet, symbolsValid, issues);

        if (b.reelStrips !== undefined && b.reelStripGeneration !== undefined) {
            issues.push({
                code: "blueprint-reelstrips-and-generation",
                severity: "error",
                message: 'Both "reelStrips" and "reelStripGeneration" are set; a reel\'s strip must come from exactly one of them.',
                suggestion: 'Remove either "reelStrips" or "reelStripGeneration".',
            });
        }

        if (b.reelStrips !== undefined && b.symbolWeights !== undefined) {
            issues.push({
                code: "blueprint-reelstrips-and-weights",
                severity: "warning",
                message: 'Both "reelStrips" and "symbolWeights" are set; "reelStrips" takes precedence and "symbolWeights" is ignored.',
            });
        }

        if (b.reelStrips === undefined && b.reelStripGeneration !== undefined && b.symbolWeights !== undefined) {
            issues.push({
                code: "blueprint-reelstripgeneration-and-weights",
                severity: "warning",
                message:
                    'Both "reelStripGeneration" and "symbolWeights" are set; "reelStripGeneration" takes precedence and "symbolWeights" is ignored.',
            });
        }

        this.validateReachability(paytableSymbols, wilds, scatters, reelStripSymbols, reelStripGenerationSymbols, weightSymbols, issues);
        this.validateEverySymbolHasAPayout(symbolList, symbolsValid, paytableSymbols, wilds, scatters, issues);

        const regularPayouts = this.validatePaytableQuality(b.paytable, wilds, scatters, maxMatchCount, isClustersWinModel, issues);
        this.validateWeightingQuality(b.reelStrips, b.reelStripGeneration, b.symbolWeights, wilds, scatters, regularPayouts, issues);

        if (b.availableBets !== undefined) {
            const availableBets = b.availableBets;
            if (
                !Array.isArray(availableBets) ||
                availableBets.length === 0 ||
                !availableBets.every((bet) => typeof bet === "number" && bet > 0)
            ) {
                issues.push({
                    code: "blueprint-availablebets-invalid",
                    severity: "error",
                    message: '"availableBets", if present, must be a non-empty array of positive numbers.',
                });
            } else if (new Set(availableBets).size !== availableBets.length) {
                issues.push({
                    code: "blueprint-availablebets-duplicate",
                    severity: "warning",
                    message: '"availableBets" contains duplicate values.',
                });
            }
        }

        this.validateWinModel(b.winModel, b.paylines !== undefined, issues);
        this.validateMechanics(b.mechanics, scatters, issues);
        this.validateBetModes(b.betModes, b.mechanics, issues);

        return issues;
    }

    private validateWinModel(winModel: unknown, paylinesPresent: boolean, issues: ValidationIssue[]): void {
        if (winModel === undefined) {
            return;
        }
        if (typeof winModel !== "object" || winModel === null || Array.isArray(winModel)) {
            issues.push({
                code: "blueprint-winmodel-invalid-type",
                severity: "error",
                message: '"winModel", if present, must be an object with a "type" of "lines", "ways", or "clusters".',
                path: "winModel",
            });
            return;
        }

        const w = winModel as Record<string, unknown>;
        if (w.type !== "lines" && w.type !== "ways" && w.type !== "clusters") {
            issues.push({
                code: "blueprint-winmodel-invalid-type",
                severity: "error",
                message: '"winModel.type" must be one of: lines, ways, clusters.',
                path: "winModel.type",
            });
            return;
        }

        if (w.type === "clusters" && w.minimumClusterSize !== undefined) {
            const size = w.minimumClusterSize;
            if (!(typeof size === "number" && Number.isInteger(size) && size >= 2)) {
                issues.push({
                    code: "blueprint-winmodel-invalid-minimumclustersize",
                    severity: "error",
                    message: '"winModel.minimumClusterSize", if present, must be an integer >= 2.',
                    path: "winModel.minimumClusterSize",
                });
            }
        }

        if ((w.type === "ways" || w.type === "clusters") && paylinesPresent) {
            issues.push({
                code: "blueprint-winmodel-paylines-ignored",
                severity: "warning",
                message: `"paylines" is set, but "winModel.type" is "${w.type}" — ways/cluster wins ignore paylines entirely, so it has no effect.`,
                suggestion: 'Remove "paylines", or set "winModel.type" to "lines" (or omit "winModel") to use it.',
            });
        }
    }

    private validateMechanics(mechanics: unknown, scatters: string[], issues: ValidationIssue[]): void {
        if (mechanics === undefined) {
            return;
        }
        if (typeof mechanics !== "object" || mechanics === null || Array.isArray(mechanics)) {
            issues.push({
                code: "blueprint-mechanics-invalid",
                severity: "error",
                message: '"mechanics", if present, must be an object.',
                path: "mechanics",
            });
            return;
        }

        const m = mechanics as Record<string, unknown>;
        if (m.freeGames !== undefined) {
            this.validateFreeGames(m.freeGames, scatters, issues);
        }
    }

    private validateFreeGames(freeGames: unknown, scatters: string[], issues: ValidationIssue[]): void {
        if (typeof freeGames !== "object" || freeGames === null || Array.isArray(freeGames)) {
            issues.push({
                code: "blueprint-mechanics-freegames-invalid",
                severity: "error",
                message: '"mechanics.freeGames" must be an object with "scatterSymbol" and "awardsByCount".',
                path: "mechanics.freeGames",
            });
            return;
        }

        const f = freeGames as Record<string, unknown>;
        const scatterSymbol = f.scatterSymbol;
        if (typeof scatterSymbol !== "string" || scatterSymbol.length === 0) {
            issues.push({
                code: "blueprint-mechanics-freegames-missing-scatter",
                severity: "error",
                message: '"mechanics.freeGames.scatterSymbol" must be a non-empty symbol id.',
                path: "mechanics.freeGames.scatterSymbol",
            });
        } else if (!scatters.includes(scatterSymbol)) {
            issues.push({
                code: "blueprint-mechanics-freegames-unknown-scatter",
                severity: "error",
                message: `"mechanics.freeGames.scatterSymbol" references "${scatterSymbol}", which is not listed in "scatters".`,
                path: "mechanics.freeGames.scatterSymbol",
            });
        }

        const awardsByCount = f.awardsByCount;
        if (
            typeof awardsByCount !== "object" ||
            awardsByCount === null ||
            Array.isArray(awardsByCount) ||
            Object.keys(awardsByCount).length === 0
        ) {
            issues.push({
                code: "blueprint-mechanics-freegames-empty-awards",
                severity: "error",
                message: '"mechanics.freeGames.awardsByCount" must be a non-empty object mapping match-count to free games awarded.',
                path: "mechanics.freeGames.awardsByCount",
            });
            return;
        }

        for (const [count, awarded] of Object.entries(awardsByCount as Record<string, unknown>)) {
            const countNumber = Number(count);
            if (!(Number.isInteger(countNumber) && countNumber >= 2)) {
                issues.push({
                    code: "blueprint-mechanics-freegames-invalid-count",
                    severity: "error",
                    message: `"mechanics.freeGames.awardsByCount" has an invalid match-count key "${count}" (expected an integer >= 2).`,
                });
            }
            if (!(typeof awarded === "number" && Number.isInteger(awarded) && awarded > 0)) {
                issues.push({
                    code: "blueprint-mechanics-freegames-invalid-award",
                    severity: "error",
                    message: `"mechanics.freeGames.awardsByCount.${count}" must be a positive integer.`,
                });
            }
        }
    }

    private validateBetModes(betModes: unknown, mechanics: unknown, issues: ValidationIssue[]): void {
        if (betModes === undefined) {
            return;
        }
        if (!Array.isArray(betModes)) {
            issues.push({
                code: "blueprint-betmodes-invalid",
                severity: "error",
                message: '"betModes", if present, must be an array of bet mode objects.',
                path: "betModes",
            });
            return;
        }

        const seenIds = new Set<string>();
        const entries: Record<string, unknown>[] = [];
        betModes.forEach((entry, index) => {
            const path = `betModes[${index}]`;
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
                issues.push({code: "blueprint-betmode-invalid-entry", severity: "error", message: `"${path}" must be an object.`, path});
                return;
            }

            const e = entry as Record<string, unknown>;
            entries.push(e);
            if (typeof e.id !== "string" || e.id.length === 0) {
                issues.push({
                    code: "blueprint-betmode-invalid-id",
                    severity: "error",
                    message: `"${path}.id" must be a non-empty string.`,
                    path: `${path}.id`,
                });
            } else if (seenIds.has(e.id)) {
                issues.push({
                    code: "blueprint-betmodes-duplicate-id",
                    severity: "error",
                    message: `"${path}.id" ("${e.id}") is used by more than one bet mode; ids must be unique.`,
                    path: `${path}.id`,
                });
            } else {
                seenIds.add(e.id);
            }

            if (e.label !== undefined && typeof e.label !== "string") {
                issues.push({
                    code: "blueprint-betmode-invalid-label",
                    severity: "error",
                    message: `"${path}.label", if present, must be a string.`,
                    path: `${path}.label`,
                });
            }

            if (e.costMultiplier !== undefined && !(typeof e.costMultiplier === "number" && Number.isFinite(e.costMultiplier) && e.costMultiplier > 0)) {
                issues.push({
                    code: "blueprint-betmode-invalid-costmultiplier",
                    severity: "error",
                    message: `"${path}.costMultiplier", if present, must be a positive, finite number.`,
                    path: `${path}.costMultiplier`,
                });
            }
        });

        this.validateBetModeRuntimeSemantics(entries, mechanics, issues);
    }

    // The explicit, opt-in runtime-semantics contract (see gamepackage/BetMode.ts's own doc comment).
    // "Opt in" means "opt in completely": if ANY mode sets runtimeType, EVERY mode must, and the whole
    // array must validate cleanly under it (exactly one non-buyFeature default; ante/buyFeature both
    // requiring their own specific fields; any number of buyFeature modes -- each with its own
    // costMultiplier/forcedFreeGames, routed at runtime by PerModeForcedFeatureEntryHandler rather than
    // restricted to just one -- but only alongside mechanics.freeGames) -- there is no partial/best-effort
    // reading of this contract, on purpose: renderGeneratedGameModule.ts (see
    // resolveBetModeCodegenWiring.ts) only ever wires VideoSlotWithBetModesSession into a generated
    // session when this entire method reports zero errors, and a caller who left it half-specified
    // almost certainly meant to finish specifying it, not to silently fall back to metadata-only.
    private validateBetModeRuntimeSemantics(entries: Record<string, unknown>[], mechanics: unknown, issues: ValidationIssue[]): void {
        const withRuntimeType = entries.filter((e) => e.runtimeType !== undefined);
        if (withRuntimeType.length === 0) {
            // Nobody opted in -- still validate isDefault/forcedFreeGames aren't used without
            // runtimeType (using either without the other is itself an incomplete opt-in attempt).
            entries.forEach((e, index) => {
                if (e.isDefault !== undefined || e.forcedFreeGames !== undefined) {
                    issues.push({
                        code: "blueprint-betmode-runtimetype-required",
                        severity: "error",
                        message: `"betModes[${index}]" sets isDefault/forcedFreeGames but no "runtimeType" -- ` +
                            'set "runtimeType" on every bet mode to opt into explicit runtime semantics, or remove isDefault/forcedFreeGames entirely.',
                        path: `betModes[${index}]`,
                    });
                }
            });
            return;
        }

        if (withRuntimeType.length !== entries.length) {
            entries.forEach((e, index) => {
                if (e.runtimeType === undefined) {
                    issues.push({
                        code: "blueprint-betmodes-incomplete-runtimetype",
                        severity: "error",
                        message: `"betModes[${index}]" has no "runtimeType", but another bet mode in this array does -- ` +
                            "either every bet mode must set an explicit runtimeType, or none of them may.",
                        path: `betModes[${index}].runtimeType`,
                    });
                }
            });
            return;
        }

        let validSoFar = true;
        const defaults: {entry: Record<string, unknown>; index: number}[] = [];
        const buyFeatureModes: {entry: Record<string, unknown>; index: number}[] = [];

        entries.forEach((e, index) => {
            const path = `betModes[${index}]`;
            const runtimeType = e.runtimeType;
            if (runtimeType !== "base" && runtimeType !== "ante" && runtimeType !== "buyFeature") {
                issues.push({
                    code: "blueprint-betmode-invalid-runtimetype",
                    severity: "error",
                    message: `"${path}.runtimeType" must be one of: base, ante, buyFeature.`,
                    path: `${path}.runtimeType`,
                });
                validSoFar = false;
                return;
            }

            if (e.isDefault !== undefined && typeof e.isDefault !== "boolean") {
                issues.push({
                    code: "blueprint-betmode-invalid-isdefault",
                    severity: "error",
                    message: `"${path}.isDefault", if present, must be a boolean.`,
                    path: `${path}.isDefault`,
                });
                validSoFar = false;
            } else if (e.isDefault === true) {
                defaults.push({entry: e, index});
            }

            if (e.forcedFreeGames !== undefined && !(typeof e.forcedFreeGames === "number" && Number.isInteger(e.forcedFreeGames) && e.forcedFreeGames > 0)) {
                issues.push({
                    code: "blueprint-betmode-invalid-forcedfreegames",
                    severity: "error",
                    message: `"${path}.forcedFreeGames", if present, must be a positive integer.`,
                    path: `${path}.forcedFreeGames`,
                });
                validSoFar = false;
            }

            if (runtimeType === "buyFeature") {
                buyFeatureModes.push({entry: e, index});
                if (e.costMultiplier === undefined) {
                    issues.push({
                        code: "blueprint-betmode-buyfeature-missing-costmultiplier",
                        severity: "error",
                        message: `"${path}" has runtimeType "buyFeature", so "costMultiplier" is required (the buy price).`,
                        path: `${path}.costMultiplier`,
                    });
                    validSoFar = false;
                }
                if (e.forcedFreeGames === undefined) {
                    issues.push({
                        code: "blueprint-betmode-buyfeature-missing-forcedfreegames",
                        severity: "error",
                        message: `"${path}" has runtimeType "buyFeature", so "forcedFreeGames" is required (how many free games it forces entry into).`,
                        path: `${path}.forcedFreeGames`,
                    });
                    validSoFar = false;
                }
            } else if (e.forcedFreeGames !== undefined) {
                issues.push({
                    code: "blueprint-betmode-forcedfreegames-not-buyfeature",
                    severity: "error",
                    message: `"${path}.forcedFreeGames" is only meaningful on a "buyFeature" mode, but "${path}.runtimeType" is "${runtimeType as string}".`,
                    path: `${path}.forcedFreeGames`,
                });
                validSoFar = false;
            }

            if (runtimeType === "ante" && e.costMultiplier === undefined) {
                issues.push({
                    code: "blueprint-betmode-ante-missing-costmultiplier",
                    severity: "error",
                    message: `"${path}" has runtimeType "ante", so "costMultiplier" is required (the always-applied stake multiplier).`,
                    path: `${path}.costMultiplier`,
                });
                validSoFar = false;
            }

            if (runtimeType === "base" && e.costMultiplier !== undefined && e.costMultiplier !== 1) {
                issues.push({
                    code: "blueprint-betmode-base-invalid-costmultiplier",
                    severity: "error",
                    message: `"${path}" has runtimeType "base", so "costMultiplier" must be 1 if present -- a persistent, always-on multiplier belongs on an "ante" mode instead.`,
                    path: `${path}.costMultiplier`,
                });
                validSoFar = false;
            }
        });

        if (!validSoFar) {
            return;
        }

        if (defaults.length === 0) {
            issues.push({
                code: "blueprint-betmodes-missing-default",
                severity: "error",
                message: 'Exactly one bet mode must set "isDefault": true once "runtimeType" is used -- none does.',
                path: "betModes",
            });
        } else if (defaults.length > 1) {
            issues.push({
                code: "blueprint-betmodes-multiple-defaults",
                severity: "error",
                message: `Exactly one bet mode must set "isDefault": true, but ${defaults.length} do (${defaults
                    .map(({index}) => `betModes[${index}]`)
                    .join(", ")}).`,
                path: "betModes",
            });
        } else if (defaults[0].entry.runtimeType === "buyFeature") {
            issues.push({
                code: "blueprint-betmodes-default-is-buyfeature",
                severity: "error",
                message: `"betModes[${defaults[0].index}]" is both the default mode and runtimeType "buyFeature" -- a one-shot purchase can never be a safe default/landing mode.`,
                path: `betModes[${defaults[0].index}]`,
            });
        }

        const hasFreeGamesMechanic =
            typeof mechanics === "object" && mechanics !== null && !Array.isArray(mechanics) && (mechanics as Record<string, unknown>).freeGames !== undefined;
        if (buyFeatureModes.length > 0 && !hasFreeGamesMechanic) {
            issues.push({
                code: "blueprint-betmodes-buyfeature-requires-freegames",
                severity: "error",
                message: `"betModes[${buyFeatureModes[0].index}]" has runtimeType "buyFeature", which forces entry into "mechanics.freeGames", but "mechanics.freeGames" is not configured on this blueprint.`,
                path: "mechanics.freeGames",
            });
        }
    }

    private validateManifest(manifest: unknown, issues: ValidationIssue[]): void {
        if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
            issues.push({
                code: "blueprint-manifest-missing",
                severity: "error",
                message: '"manifest" must be an object with non-empty "id"/"name"/"version" strings.',
            });
            return;
        }

        const m = manifest as Record<string, unknown>;
        for (const field of ["id", "name", "version"] as const) {
            if (typeof m[field] !== "string" || (m[field] as string).trim().length === 0) {
                issues.push({
                    code: `blueprint-manifest-invalid-${field}`,
                    severity: "error",
                    message: `"manifest.${field}" must be a non-empty string.`,
                    path: `manifest.${field}`,
                });
            }
        }
    }

    private validateSymbolSubset(
        value: unknown,
        field: "wilds" | "scatters",
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): string[] {
        if (value === undefined) {
            return [];
        }
        if (!Array.isArray(value) || !value.every((s) => typeof s === "string")) {
            issues.push({
                code: `blueprint-${field}-invalid`,
                severity: "error",
                message: `"${field}", if present, must be an array of symbol ids.`,
            });
            return [];
        }

        const list = value as string[];
        if (new Set(list).size !== list.length) {
            issues.push({
                code: `blueprint-${field}-duplicate`,
                severity: "error",
                message: `"${field}" must not contain the same symbol id more than once.`,
            });
        }

        if (symbolsValid) {
            for (const symbolId of list) {
                if (!symbolSet.has(symbolId)) {
                    issues.push({
                        code: `blueprint-${field}-unknown-symbol`,
                        severity: "error",
                        message: `"${field}" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                    });
                }
            }
        }
        return list;
    }

    private validateWildScatterOverlap(wilds: string[], scatters: string[], issues: ValidationIssue[]): void {
        const scatterSet = new Set(scatters);
        const overlap = new Set(wilds.filter((symbolId) => scatterSet.has(symbolId)));
        for (const symbolId of overlap) {
            issues.push({
                code: "blueprint-wilds-scatters-overlap",
                severity: "error",
                message: `"${symbolId}" is listed in both "wilds" and "scatters" — a symbol cannot be both at once, and the reel generator would place it on the reels twice over.`,
                suggestion: `Remove "${symbolId}" from either "wilds" or "scatters".`,
            });
        }
    }

    private isClustersWinModel(winModel: unknown): boolean {
        return typeof winModel === "object" && winModel !== null && !Array.isArray(winModel) && (winModel as Record<string, unknown>).type === "clusters";
    }

    // "maxMatchCount" is the upper bound a paytable match-count key may use -- "reels" for lines/ways
    // (a symbol matches on at most one reel each), or "reels" * "rows" for clusters (a cluster can span
    // the whole grid). `undefined` means no upper bound (reels/rows weren't valid enough to compute one).
    private validatePaytable(
        paytable: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        wilds: string[],
        maxMatchCount: number | undefined,
        issues: ValidationIssue[],
    ): string[] {
        if (typeof paytable !== "object" || paytable === null || Array.isArray(paytable)) {
            issues.push({
                code: "blueprint-paytable-missing",
                severity: "error",
                message: '"paytable" must be an object mapping symbol ids to {matchCount: betMultiplier}.',
            });
            return [];
        }

        const paytableRecord = paytable as Record<string, unknown>;
        const paytableSymbols = Object.keys(paytableRecord);
        if (paytableSymbols.length === 0) {
            issues.push({code: "blueprint-paytable-empty", severity: "error", message: '"paytable" must define at least one symbol payout.'});
        }

        for (const symbolId of paytableSymbols) {
            if (symbolsValid && !symbolSet.has(symbolId)) {
                issues.push({
                    code: "blueprint-paytable-unknown-symbol",
                    severity: "error",
                    message: `"paytable" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                });
            }
            if (wilds.includes(symbolId)) {
                issues.push({
                    code: "blueprint-paytable-wild-symbol",
                    severity: "warning",
                    message: `"paytable" defines a payout for wild symbol "${symbolId}", but an all-wild line resolves to no winning symbol id — this entry is never looked up.`,
                    suggestion: 'Remove wild symbols from "paytable"; wild wins are paid as whatever symbol they substitute for.',
                });
            }

            const payouts = paytableRecord[symbolId];
            if (typeof payouts !== "object" || payouts === null || Array.isArray(payouts) || Object.keys(payouts).length === 0) {
                issues.push({
                    code: "blueprint-paytable-invalid-payouts",
                    severity: "error",
                    message: `"paytable.${symbolId}" must be a non-empty object mapping match-count to a bet multiplier.`,
                });
                continue;
            }

            const validPayouts: {times: number; multiplier: number}[] = [];
            for (const [times, multiplier] of Object.entries(payouts as Record<string, unknown>)) {
                const timesNumber = Number(times);
                const timesValid = Number.isInteger(timesNumber) && timesNumber >= 2 && (maxMatchCount === undefined || timesNumber <= maxMatchCount);
                if (!timesValid) {
                    issues.push({
                        code: "blueprint-paytable-invalid-times",
                        severity: "error",
                        message: `"paytable.${symbolId}" has an invalid match-count key "${times}" (expected an integer between 2 and ${maxMatchCount ?? '"reels"'}).`,
                    });
                }
                const multiplierValid = typeof multiplier === "number" && multiplier > 0;
                if (!multiplierValid) {
                    issues.push({
                        code: "blueprint-paytable-invalid-multiplier",
                        severity: "error",
                        message: `"paytable.${symbolId}.${times}" must be a positive number.`,
                    });
                }
                if (timesValid && multiplierValid) {
                    validPayouts.push({times: timesNumber, multiplier: multiplier as number});
                }
            }

            validPayouts.sort((a, b) => a.times - b.times);
            for (let i = 1; i < validPayouts.length; i++) {
                const previous = validPayouts[i - 1];
                const current = validPayouts[i];
                if (current.multiplier < previous.multiplier) {
                    issues.push({
                        code: "blueprint-paytable-non-monotonic",
                        severity: "warning",
                        message: `"paytable.${symbolId}" pays less for ${current.times} matches (${current.multiplier}x) than for ${previous.times} matches (${previous.multiplier}x); matching more symbols usually shouldn't pay less.`,
                        suggestion: `Double-check "paytable.${symbolId}" — higher match counts are typically worth at least as much as lower ones.`,
                    });
                }
            }
        }

        return paytableSymbols;
    }

    private validatePaylines(
        paylines: unknown,
        reels: unknown,
        reelsValid: boolean,
        rows: unknown,
        rowsValid: boolean,
        issues: ValidationIssue[],
    ): void {
        if (paylines === undefined) {
            return;
        }

        if (!Array.isArray(paylines) || paylines.length === 0) {
            issues.push({
                code: "blueprint-paylines-invalid",
                severity: "error",
                message: '"paylines", if present, must be a non-empty array of rows-per-reel arrays.',
            });
            return;
        }

        const seenLines = new Map<string, number>();
        paylines.forEach((line, index) => {
            const valid =
                Array.isArray(line) &&
                (!reelsValid || line.length === reels) &&
                line.every(
                    (row) => typeof row === "number" && Number.isInteger(row) && row >= 0 && (!rowsValid || row < (rows as number)),
                );
            if (!valid) {
                issues.push({
                    code: "blueprint-payline-invalid",
                    severity: "error",
                    message: `"paylines[${index}]" must have exactly "reels" row indexes, each between 0 and "rows" - 1.`,
                });
                return;
            }

            const key = JSON.stringify(line);
            const firstIndex = seenLines.get(key);
            if (firstIndex !== undefined) {
                issues.push({
                    code: "blueprint-paylines-duplicate",
                    severity: "warning",
                    message: `"paylines[${index}]" is identical to "paylines[${firstIndex}]"; a duplicate payline pays out twice for what is physically the same line.`,
                });
            } else {
                seenLines.set(key, index);
            }
        });
    }

    private validateReelStrips(
        reelStrips: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        reels: unknown,
        reelsValid: boolean,
        rows: unknown,
        rowsValid: boolean,
        issues: ValidationIssue[],
    ): Set<string> | undefined {
        if (reelStrips === undefined) {
            return undefined;
        }

        if (!Array.isArray(reelStrips) || (reelsValid && reelStrips.length !== reels)) {
            issues.push({
                code: "blueprint-reelstrips-invalid",
                severity: "error",
                message: '"reelStrips", if present, must contain exactly one strip (array of symbol ids) per reel.',
            });
        }

        if (!Array.isArray(reelStrips)) {
            return undefined;
        }

        const stripSymbols = new Set<string>();
        reelStrips.forEach((strip, index) => {
            const valid =
                Array.isArray(strip) &&
                strip.length > 0 &&
                strip.every((s) => typeof s === "string" && (!symbolsValid || symbolSet.has(s)));
            if (!valid) {
                issues.push({
                    code: "blueprint-reelstrip-invalid",
                    severity: "error",
                    message: `"reelStrips[${index}]" must be a non-empty array of known symbol ids.`,
                });
                if (Array.isArray(strip)) {
                    strip.filter((s): s is string => typeof s === "string").forEach((s) => stripSymbols.add(s));
                }
                return;
            }

            strip.forEach((s) => stripSymbols.add(s));
            if (rowsValid && strip.length < (rows as number)) {
                issues.push({
                    code: "blueprint-reelstrip-too-short",
                    severity: "warning",
                    message: `"reelStrips[${index}]" has only ${strip.length} symbol(s), fewer than "rows" (${rows}); a strip shorter than "rows" wraps around and is guaranteed to repeat a symbol within a single spin on that reel.`,
                });
            }
        });

        return stripSymbols;
    }

    // Shape-checks reelStripGeneration only: it must have exactly one entry per reel, and each entry
    // must be a well-formed {type: "literal", strip} or {type: "generated", ...} — for "generated",
    // that means length/seed/symbolCounts-or-symbolWeights/lockedPositions/maxAttempts/policy-enum
    // values, plus a full check of every constraints[] entry's own required fields, types, unknown
    // symbols, and numeric bounds (validateReelStripConstraintSpec below). Whether a "generated"
    // entry's configuration can actually be *satisfied* is a separate, runtime question
    // ReelStripGenerator itself answers (unsatisfiable constraints surface as a build-time failure)
    // — see resolveReelStripGeneration.ts and BuildCommand, not here.
    private validateReelStripGeneration(
        reelStripGeneration: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        reels: unknown,
        reelsValid: boolean,
        issues: ValidationIssue[],
    ): Set<string> | undefined {
        if (reelStripGeneration === undefined) {
            return undefined;
        }

        if (!Array.isArray(reelStripGeneration)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid",
                severity: "error",
                message: '"reelStripGeneration", if present, must be an array with exactly one entry per reel.',
            });
            return undefined;
        }

        if (reelsValid && reelStripGeneration.length !== reels) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid",
                severity: "error",
                message: `"reelStripGeneration" has ${reelStripGeneration.length} entries, but "reels" is ${reels} — it must have exactly one entry per reel.`,
            });
        }

        const generatedSymbols = new Set<string>();
        reelStripGeneration.forEach((entry, index) => {
            this.validateReelStripGenerationEntry(entry, `reelStripGeneration[${index}]`, symbolSet, symbolsValid, generatedSymbols, issues);
        });
        return generatedSymbols;
    }

    private validateReelStripGenerationEntry(
        entry: unknown,
        path: string,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        generatedSymbols: Set<string>,
        issues: ValidationIssue[],
    ): void {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-entry",
                severity: "error",
                message: `"${path}" must be an object with a "type" field.`,
            });
            return;
        }

        const e = entry as Record<string, unknown>;
        if (e.type === "literal") {
            this.validateReelStripGenerationLiteral(e.strip, path, symbolSet, symbolsValid, generatedSymbols, issues);
        } else if (e.type === "generated") {
            this.validateReelStripGenerationGenerated(e, path, symbolSet, symbolsValid, generatedSymbols, issues);
        } else {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-entry-type",
                severity: "error",
                message: `"${path}.type" must be "literal" or "generated".`,
            });
        }
    }

    private validateReelStripGenerationLiteral(
        strip: unknown,
        path: string,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        generatedSymbols: Set<string>,
        issues: ValidationIssue[],
    ): void {
        const valid = Array.isArray(strip) && strip.length > 0 && strip.every((s) => typeof s === "string" && (!symbolsValid || symbolSet.has(s)));
        if (!valid) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-literal",
                severity: "error",
                message: `"${path}.strip" must be a non-empty array of known symbol ids.`,
            });
            if (Array.isArray(strip)) {
                strip.filter((s): s is string => typeof s === "string").forEach((s) => generatedSymbols.add(s));
            }
            return;
        }
        strip.forEach((s: string) => generatedSymbols.add(s));
    }

    private validateReelStripGenerationGenerated(
        entry: Record<string, unknown>,
        path: string,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        generatedSymbols: Set<string>,
        issues: ValidationIssue[],
    ): void {
        const lengthValid = typeof entry.length === "number" && Number.isInteger(entry.length) && entry.length > 0;
        if (!lengthValid) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-length",
                severity: "error",
                message: `"${path}.length" must be a positive integer.`,
            });
        }

        if (!(typeof entry.seed === "number" && Number.isInteger(entry.seed))) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-seed",
                severity: "error",
                message: `"${path}.seed" must be an integer — required (not optional) so builds stay deterministic.`,
            });
        }

        const hasCounts = entry.symbolCounts !== undefined;
        const hasWeights = entry.symbolWeights !== undefined;
        if (hasCounts === hasWeights) {
            issues.push({
                code: "blueprint-reelstripgeneration-source-invalid",
                severity: "error",
                message: `Exactly one of "${path}.symbolCounts" or "${path}.symbolWeights" must be set.`,
            });
        }

        if (hasCounts && !hasWeights) {
            this.validateReelStripGenerationCounts(entry.symbolCounts, path, symbolSet, symbolsValid, generatedSymbols, issues);
        } else if (hasWeights && !hasCounts) {
            this.validateReelStripGenerationWeights(entry.symbolWeights, path, symbolSet, symbolsValid, generatedSymbols, issues);
        }

        if (entry.lockedPositions !== undefined) {
            this.validateReelStripGenerationLockedPositions(
                entry.lockedPositions,
                path,
                symbolSet,
                symbolsValid,
                lengthValid ? (entry.length as number) : undefined,
                issues,
            );
        }

        if (entry.constraints !== undefined) {
            this.validateReelStripGenerationConstraints(entry.constraints, path, symbolSet, symbolsValid, issues);
        }

        if (entry.maxAttempts !== undefined && !(typeof entry.maxAttempts === "number" && Number.isInteger(entry.maxAttempts) && entry.maxAttempts > 0)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-maxattempts",
                severity: "error",
                message: `"${path}.maxAttempts", if present, must be a positive integer.`,
            });
        }

        if (entry.roundingPolicy !== undefined && !REEL_STRIP_ROUNDING_POLICIES.includes(entry.roundingPolicy as string)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-roundingpolicy",
                severity: "error",
                message: `"${path}.roundingPolicy", if present, must be one of: ${REEL_STRIP_ROUNDING_POLICIES.join(", ")}.`,
            });
        }

        if (entry.remainderTieBreakPolicy !== undefined && !REEL_STRIP_TIE_BREAK_POLICIES.includes(entry.remainderTieBreakPolicy as string)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-tiebreakpolicy",
                severity: "error",
                message: `"${path}.remainderTieBreakPolicy", if present, must be one of: ${REEL_STRIP_TIE_BREAK_POLICIES.join(", ")}.`,
            });
        }
    }

    private validateReelStripGenerationCounts(
        symbolCounts: unknown,
        path: string,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        generatedSymbols: Set<string>,
        issues: ValidationIssue[],
    ): void {
        if (typeof symbolCounts !== "object" || symbolCounts === null || Array.isArray(symbolCounts)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-symbolcounts",
                severity: "error",
                message: `"${path}.symbolCounts", if present, must be an object mapping symbol ids to non-negative counts.`,
            });
            return;
        }

        for (const [symbolId, count] of Object.entries(symbolCounts as Record<string, unknown>)) {
            if (symbolsValid && !symbolSet.has(symbolId)) {
                issues.push({
                    code: "blueprint-reelstripgeneration-unknown-symbol",
                    severity: "error",
                    message: `"${path}.symbolCounts" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                });
            }
            if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-count",
                    severity: "error",
                    message: `"${path}.symbolCounts.${symbolId}" must be a non-negative integer.`,
                });
                continue;
            }
            // A symbol declared with a count of 0 will never actually appear on this reel — it is
            // not "reachable" via reelStripGeneration, exactly like a symbol simply absent from a
            // literal strip isn't reachable via reelStrips either.
            if (count > 0) {
                generatedSymbols.add(symbolId);
            }
        }
    }

    private validateReelStripGenerationWeights(
        symbolWeights: unknown,
        path: string,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        generatedSymbols: Set<string>,
        issues: ValidationIssue[],
    ): void {
        if (typeof symbolWeights !== "object" || symbolWeights === null || Array.isArray(symbolWeights)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-symbolweights",
                severity: "error",
                message: `"${path}.symbolWeights", if present, must be an object mapping symbol ids to positive weights.`,
            });
            return;
        }

        for (const [symbolId, weight] of Object.entries(symbolWeights as Record<string, unknown>)) {
            if (symbolsValid && !symbolSet.has(symbolId)) {
                issues.push({
                    code: "blueprint-reelstripgeneration-unknown-symbol",
                    severity: "error",
                    message: `"${path}.symbolWeights" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                });
            }
            if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-weight",
                    severity: "error",
                    message: `"${path}.symbolWeights.${symbolId}" must be a positive, finite number.`,
                });
                continue;
            }
            // Unlike symbolCounts, a weight of 0 is already rejected above (weights must be
            // positive), so every entry that reaches here is reachable.
            generatedSymbols.add(symbolId);
        }
    }

    private validateReelStripGenerationLockedPositions(
        lockedPositions: unknown,
        path: string,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        length: number | undefined,
        issues: ValidationIssue[],
    ): void {
        if (typeof lockedPositions !== "object" || lockedPositions === null || Array.isArray(lockedPositions)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-lockedpositions",
                severity: "error",
                message: `"${path}.lockedPositions", if present, must be an object mapping position indexes to symbol ids.`,
            });
            return;
        }

        for (const [position, symbolId] of Object.entries(lockedPositions as Record<string, unknown>)) {
            const positionNumber = Number(position);
            if (!Number.isInteger(positionNumber) || positionNumber < 0 || (length !== undefined && positionNumber >= length)) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-lockedposition-index",
                    severity: "error",
                    message: `"${path}.lockedPositions" has an invalid position key "${position}"; keys must be non-negative integers below "${path}.length".`,
                });
            }
            if (typeof symbolId !== "string" || (symbolsValid && !symbolSet.has(symbolId))) {
                issues.push({
                    code: "blueprint-reelstripgeneration-unknown-symbol",
                    severity: "error",
                    message: `"${path}.lockedPositions.${position}" references unknown symbol "${symbolId}".`,
                });
            }
        }
    }

    private validateReelStripGenerationConstraints(
        constraints: unknown,
        path: string,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): void {
        if (!Array.isArray(constraints)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-constraints",
                severity: "error",
                message: `"${path}.constraints", if present, must be an array of constraint specs.`,
            });
            return;
        }

        constraints.forEach((constraint, index) => {
            this.validateReelStripConstraintSpec(constraint, `${path}.constraints[${index}]`, symbolSet, symbolsValid, issues);
        });
    }

    // Full validation of one constraint spec: a recognized "type", every field that type requires,
    // correct JS types for each field, unknown-symbol checks against symbolSet, and numeric bounds
    // (positive/non-negative integers, min <= max) — mirroring each constraint class's own
    // constructor validation, but reported as a blueprint ValidationIssue instead of a thrown Error.
    private validateReelStripConstraintSpec(
        constraint: unknown,
        path: string,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): void {
        if (typeof constraint !== "object" || constraint === null || Array.isArray(constraint)) {
            issues.push({code: "blueprint-reelstripgeneration-invalid-constraint", severity: "error", message: `"${path}" must be an object with a "type" field.`});
            return;
        }

        const c = constraint as Record<string, unknown>;
        if (typeof c.type !== "string" || !REEL_STRIP_CONSTRAINT_TYPES.includes(c.type)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-constraint-type",
                severity: "error",
                message: `"${path}.type" must be one of: ${REEL_STRIP_CONSTRAINT_TYPES.join(", ")}.`,
            });
            return;
        }

        switch (c.type) {
            case "minimumCircularDistance":
                this.requirePositiveInteger(c.minimumDistance, `${path}.minimumDistance`, issues);
                this.validateOptionalSymbolIds(c.symbolIds, `${path}.symbolIds`, symbolSet, symbolsValid, issues);
                this.validateOptionalBoolean(c.wrapAround, `${path}.wrapAround`, issues);
                return;
            case "maximumCircularDistance":
                this.requirePositiveInteger(c.maximumDistance, `${path}.maximumDistance`, issues);
                this.validateOptionalSymbolIds(c.symbolIds, `${path}.symbolIds`, symbolSet, symbolsValid, issues);
                this.validateOptionalBoolean(c.wrapAround, `${path}.wrapAround`, issues);
                return;
            case "maximumConsecutiveOccurrences":
                this.requirePositiveInteger(c.maximumConsecutive, `${path}.maximumConsecutive`, issues);
                this.validateOptionalSymbolIds(c.symbolIds, `${path}.symbolIds`, symbolSet, symbolsValid, issues);
                this.validateOptionalBoolean(c.wrapAround, `${path}.wrapAround`, issues);
                return;
            case "forbiddenAdjacency":
            case "requiredAdjacency":
                this.validatePairs(c.pairs, `${path}.pairs`, symbolSet, symbolsValid, issues);
                this.validateOptionalBoolean(c.wrapAround, `${path}.wrapAround`, issues);
                this.validateOptionalBoolean(c.directed, `${path}.directed`, issues);
                return;
            case "forbiddenSequence":
                this.validateSequence(c.sequence, `${path}.sequence`, symbolSet, symbolsValid, issues);
                this.validateOptionalNonNegativeInteger(c.maximumOccurrences, `${path}.maximumOccurrences`, issues);
                this.validateOptionalBoolean(c.reversed, `${path}.reversed`, issues);
                this.validateOptionalBoolean(c.wrapAround, `${path}.wrapAround`, issues);
                return;
            case "requiredSequence":
                this.validateSequence(c.sequence, `${path}.sequence`, symbolSet, symbolsValid, issues);
                this.validateOptionalNonNegativeInteger(c.minimumOccurrences, `${path}.minimumOccurrences`, issues);
                this.validateOptionalNonNegativeInteger(c.maximumOccurrences, `${path}.maximumOccurrences`, issues);
                this.validateOptionalBoolean(c.reversed, `${path}.reversed`, issues);
                this.validateOptionalBoolean(c.wrapAround, `${path}.wrapAround`, issues);
                if (
                    typeof c.minimumOccurrences === "number" &&
                    typeof c.maximumOccurrences === "number" &&
                    c.maximumOccurrences < c.minimumOccurrences
                ) {
                    issues.push({
                        code: "blueprint-reelstripgeneration-invalid-occurrences-range",
                        severity: "error",
                        message: `"${path}.maximumOccurrences" must be >= "${path}.minimumOccurrences".`,
                    });
                }
        }
    }

    private requirePositiveInteger(value: unknown, path: string, issues: ValidationIssue[]): void {
        if (!(typeof value === "number" && Number.isInteger(value) && value > 0)) {
            issues.push({code: "blueprint-reelstripgeneration-invalid-constraint-field", severity: "error", message: `"${path}" must be a positive integer.`});
        }
    }

    private validateOptionalNonNegativeInteger(value: unknown, path: string, issues: ValidationIssue[]): void {
        if (value !== undefined && !(typeof value === "number" && Number.isInteger(value) && value >= 0)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-constraint-field",
                severity: "error",
                message: `"${path}", if present, must be a non-negative integer.`,
            });
        }
    }

    private validateOptionalBoolean(value: unknown, path: string, issues: ValidationIssue[]): void {
        if (value !== undefined && typeof value !== "boolean") {
            issues.push({code: "blueprint-reelstripgeneration-invalid-constraint-field", severity: "error", message: `"${path}", if present, must be a boolean.`});
        }
    }

    private validateOptionalSymbolIds(value: unknown, path: string, symbolSet: Set<string>, symbolsValid: boolean, issues: ValidationIssue[]): void {
        if (value === undefined) {
            return;
        }
        if (!Array.isArray(value) || !value.every((s) => typeof s === "string")) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-constraint-field",
                severity: "error",
                message: `"${path}", if present, must be an array of symbol ids.`,
            });
            return;
        }
        if (symbolsValid) {
            for (const symbolId of value) {
                if (!symbolSet.has(symbolId)) {
                    issues.push({
                        code: "blueprint-reelstripgeneration-unknown-symbol",
                        severity: "error",
                        message: `"${path}" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                    });
                }
            }
        }
    }

    private validatePairs(value: unknown, path: string, symbolSet: Set<string>, symbolsValid: boolean, issues: ValidationIssue[]): void {
        if (!Array.isArray(value) || value.length === 0) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-constraint-field",
                severity: "error",
                message: `"${path}" must be a non-empty array of [symbolId, symbolId] pairs.`,
            });
            return;
        }
        value.forEach((pair, index) => {
            if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((s) => typeof s === "string")) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-constraint-field",
                    severity: "error",
                    message: `"${path}[${index}]" must be a [symbolId, symbolId] pair.`,
                });
                return;
            }
            if (symbolsValid) {
                for (const symbolId of pair) {
                    if (!symbolSet.has(symbolId)) {
                        issues.push({
                            code: "blueprint-reelstripgeneration-unknown-symbol",
                            severity: "error",
                            message: `"${path}[${index}]" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                        });
                    }
                }
            }
        });
    }

    private validateSequence(value: unknown, path: string, symbolSet: Set<string>, symbolsValid: boolean, issues: ValidationIssue[]): void {
        if (!Array.isArray(value) || value.length === 0 || !value.every((s) => typeof s === "string")) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-constraint-field",
                severity: "error",
                message: `"${path}" must be a non-empty array of symbol ids.`,
            });
            return;
        }
        if (symbolsValid) {
            for (const symbolId of value) {
                if (!symbolSet.has(symbolId)) {
                    issues.push({
                        code: "blueprint-reelstripgeneration-unknown-symbol",
                        severity: "error",
                        message: `"${path}" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                    });
                }
            }
        }
    }

    private validateSymbolWeights(
        symbolWeights: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): Set<string> | undefined {
        if (symbolWeights === undefined) {
            return undefined;
        }

        if (typeof symbolWeights !== "object" || symbolWeights === null || Array.isArray(symbolWeights)) {
            issues.push({
                code: "blueprint-symbolweights-invalid",
                severity: "error",
                message: '"symbolWeights", if present, must be an object mapping symbol ids to positive counts.',
            });
            return undefined;
        }

        const weightSymbols = new Set<string>();
        for (const [symbolId, weight] of Object.entries(symbolWeights as Record<string, unknown>)) {
            weightSymbols.add(symbolId);
            if (symbolsValid && !symbolSet.has(symbolId)) {
                issues.push({
                    code: "blueprint-symbolweights-unknown-symbol",
                    severity: "error",
                    message: `"symbolWeights" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                });
            }
            if (typeof weight !== "number" || !Number.isInteger(weight) || weight <= 0) {
                issues.push({
                    code: "blueprint-symbolweights-invalid-weight",
                    severity: "error",
                    message: `"symbolWeights.${symbolId}" must be a positive integer.`,
                });
            }
        }
        return weightSymbols;
    }

    // "reelStrips" (when present) fully replaces the engine's default reel generator, and
    // "reelStripGeneration"/"symbolWeights" (in that order, when reelStrips is absent) do too — so a
    // symbol that a blueprint pays out on, or marks as wild/scatter, but never places in the explicit
    // reel data can physically never land. Without any of the three the built-in generator seeds
    // every declared symbol on every reel, so there's nothing to check.
    private validateReachability(
        paytableSymbols: string[],
        wilds: string[],
        scatters: string[],
        reelStripSymbols: Set<string> | undefined,
        reelStripGenerationSymbols: Set<string> | undefined,
        weightSymbols: Set<string> | undefined,
        issues: ValidationIssue[],
    ): void {
        const reachable = reelStripSymbols ?? reelStripGenerationSymbols ?? weightSymbols;
        if (reachable === undefined) {
            return;
        }

        let source: "reelStrips" | "reelStripGeneration" | "symbolWeights";
        let code: string;
        if (reelStripSymbols !== undefined) {
            source = "reelStrips";
            code = "blueprint-reelstrips-missing-symbol";
        } else if (reelStripGenerationSymbols !== undefined) {
            source = "reelStripGeneration";
            code = "blueprint-reelstripgeneration-missing-symbol";
        } else {
            source = "symbolWeights";
            code = "blueprint-symbolweights-missing-symbol";
        }

        const referenced = new Set<string>([...paytableSymbols, ...wilds, ...scatters]);
        for (const symbolId of referenced) {
            if (!reachable.has(symbolId)) {
                issues.push({
                    code,
                    severity: "error",
                    message: `"${symbolId}" is referenced by "paytable"/"wilds"/"scatters" but never appears in "${source}", so it can never land on the reels — any payout for it is impossible to win.`,
                    suggestion: `Add "${symbolId}" to "${source}", or remove references to it from "paytable"/"wilds"/"scatters".`,
                });
            }
        }
    }

    private validateEverySymbolHasAPayout(
        symbolList: string[],
        symbolsValid: boolean,
        paytableSymbols: string[],
        wilds: string[],
        scatters: string[],
        issues: ValidationIssue[],
    ): void {
        if (!symbolsValid) {
            return;
        }
        const paytableSet = new Set(paytableSymbols);
        const specialSet = new Set([...wilds, ...scatters]);
        for (const symbolId of symbolList) {
            if (!specialSet.has(symbolId) && !paytableSet.has(symbolId)) {
                issues.push({
                    code: "blueprint-symbol-missing-payout",
                    severity: "warning",
                    message: `Symbol "${symbolId}" is listed in "symbols" but has no "paytable" entry and isn't a wild or scatter, so it can never produce a win.`,
                    suggestion: `Add a "paytable.${symbolId}" entry, or remove "${symbolId}" from "symbols" if it's intentionally unused.`,
                });
            }
        }
    }

    // Design-quality smells on top of validatePaytable's shape checks — every entry considered here
    // already passed shape validation (invalid times/multipliers are silently skipped, since those are
    // already reported as errors elsewhere). Wild symbols are skipped entirely (their paytable entries
    // are dead data, already flagged by validatePaytable). Scatters are skipped too: their economics are
    // deliberately different (they conventionally start at 2-of-a-kind and pay much bigger multipliers
    // for a rare full-screen hit), so entry-tier/base-payout checks tuned for line-pay symbols don't apply.
    // Returns the per-symbol valid payouts for every considered (non-wild, non-scatter) symbol, so
    // validateWeightingQuality can cross-reference payout against reel weighting without re-parsing.
    // "skipLinePayHeuristics" (true for a clusters winModel) turns off the two smells below that assume
    // reel-based match-count semantics ("most line-pay symbols start at 3-of-a-kind") -- a cluster's
    // match-count is a grid cell count, not a reels-matched count, so those heuristics don't apply.
    private validatePaytableQuality(
        paytable: unknown,
        wilds: string[],
        scatters: string[],
        maxMatchCount: number | undefined,
        skipLinePayHeuristics: boolean,
        issues: ValidationIssue[],
    ): Map<string, SymbolPayout[]> {
        const regularPayouts = new Map<string, SymbolPayout[]>();
        if (typeof paytable !== "object" || paytable === null || Array.isArray(paytable)) {
            return regularPayouts;
        }

        const wildSet = new Set(wilds);
        const scatterSet = new Set(scatters);

        for (const [symbolId, payouts] of Object.entries(paytable as Record<string, unknown>)) {
            if (wildSet.has(symbolId) || typeof payouts !== "object" || payouts === null || Array.isArray(payouts)) {
                continue;
            }

            const validPayouts: SymbolPayout[] = [];
            for (const [times, multiplier] of Object.entries(payouts as Record<string, unknown>)) {
                const timesNumber = Number(times);
                const timesValid = Number.isInteger(timesNumber) && timesNumber >= 2 && (maxMatchCount === undefined || timesNumber <= maxMatchCount);
                const multiplierValid = typeof multiplier === "number" && multiplier > 0;
                if (timesValid && multiplierValid) {
                    validPayouts.push({times: timesNumber, multiplier});
                }
            }
            if (validPayouts.length === 0 || scatterSet.has(symbolId)) {
                continue;
            }
            validPayouts.sort((a, b) => a.times - b.times);

            const entryTier = validPayouts[0];
            if (!skipLinePayHeuristics && entryTier.times === FREQUENT_LOW_MATCH_COUNT) {
                issues.push({
                    code: "blueprint-paytable-frequent-low-match",
                    severity: "warning",
                    message: `"paytable.${symbolId}" pays on just ${FREQUENT_LOW_MATCH_COUNT} matching symbols; for a non-scatter symbol that's very frequent (most line-pay symbols start at 3-of-a-kind) and will inflate hit frequency and RTP.`,
                    suggestion: `Remove the "${FREQUENT_LOW_MATCH_COUNT}" entry from "paytable.${symbolId}", or move "${symbolId}" to "scatters" if it's meant to pay regardless of position.`,
                });
            }

            if (!skipLinePayHeuristics && !validPayouts.some((payout) => payout.times === 3) && (maxMatchCount === undefined || maxMatchCount >= 3)) {
                issues.push({
                    code: "blueprint-paytable-missing-base-payout",
                    severity: "warning",
                    message: `"paytable.${symbolId}" has no 3-of-a-kind payout (only ${validPayouts.map((payout) => payout.times).join(", ")}); most line-pay symbols pay starting at 3 matches.`,
                    suggestion: `Add a "paytable.${symbolId}.3" entry, or confirm "${symbolId}" is intentionally rarer than a normal 3-of-a-kind win.`,
                });
            }

            if (entryTier.multiplier > SUSPICIOUS_ENTRY_TIER_MULTIPLIER) {
                issues.push({
                    code: "blueprint-paytable-generous-entry-payout",
                    severity: "warning",
                    message: `"paytable.${symbolId}.${entryTier.times}" pays ${entryTier.multiplier}x bet, which is unusually generous for a symbol's lowest match count — double-check this isn't a data-entry mistake.`,
                    suggestion: `Most line-pay symbols pay under ${SUSPICIOUS_ENTRY_TIER_MULTIPLIER}x bet at their lowest match count, saving bigger multipliers for higher match counts.`,
                });
            }

            regularPayouts.set(symbolId, validPayouts);
        }

        if (regularPayouts.size >= 2) {
            const topPayouts = new Set([...regularPayouts.values()].map((payouts) => Math.max(...payouts.map((p) => p.multiplier))));
            if (topPayouts.size === 1) {
                issues.push({
                    code: "blueprint-paytable-no-tiering",
                    severity: "warning",
                    message: `Every non-scatter symbol with a payout pays the same top multiplier (${[...topPayouts][0]}x) — there's no low-pay/high-pay distinction, which is unusual for a line-pay slot.`,
                    suggestion: "Give higher-value symbols a bigger payout than filler symbols, or merge symbols that pay identically into one.",
                });
            }
        }

        return regularPayouts;
    }

    // A symbol's "effective weight" on the reels, from whichever of reelStrips/reelStripGeneration/
    // symbolWeights is active (reelStrips takes precedence, mirroring validateReachability) —
    // occurrence count across every strip for reelStrips, the weight value itself for symbolWeights.
    // For reelStripGeneration (a per-reel array), each "literal" entry contributes its own strip's
    // occurrence counts and each "generated" entry contributes its own symbolCounts/symbolWeights
    // values directly, summed together per symbol across every reel — an approximation (literal
    // occurrence counts and generated relative counts/weights aren't quite the same unit), but good
    // enough for these heuristic checks. Best-effort: reads through shape errors already reported
    // elsewhere the same way validateReelStrips's own stripSymbols does.
    private computeEffectiveWeights(
        reelStrips: unknown,
        reelStripGeneration: unknown,
        symbolWeights: unknown,
    ): {weights: Map<string, number>; source: string} | undefined {
        if (Array.isArray(reelStrips)) {
            const counts = new Map<string, number>();
            for (const strip of reelStrips) {
                if (!Array.isArray(strip)) {
                    continue;
                }
                for (const symbolId of strip) {
                    if (typeof symbolId === "string") {
                        counts.set(symbolId, (counts.get(symbolId) ?? 0) + 1);
                    }
                }
            }
            return counts.size > 0 ? {weights: counts, source: "reelStrips"} : undefined;
        }

        if (Array.isArray(reelStripGeneration)) {
            const weights = new Map<string, number>();
            for (const entry of reelStripGeneration) {
                if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
                    continue;
                }
                const e = entry as Record<string, unknown>;
                if (e.type === "literal" && Array.isArray(e.strip)) {
                    for (const symbolId of e.strip) {
                        if (typeof symbolId === "string") {
                            weights.set(symbolId, (weights.get(symbolId) ?? 0) + 1);
                        }
                    }
                } else if (e.type === "generated") {
                    const generationSource = e.symbolCounts ?? e.symbolWeights;
                    if (typeof generationSource === "object" && generationSource !== null && !Array.isArray(generationSource)) {
                        for (const [symbolId, weight] of Object.entries(generationSource as Record<string, unknown>)) {
                            if (typeof weight === "number" && Number.isFinite(weight) && weight > 0) {
                                weights.set(symbolId, (weights.get(symbolId) ?? 0) + weight);
                            }
                        }
                    }
                }
            }
            if (weights.size > 0) {
                return {weights, source: "reelStripGeneration"};
            }
        }

        if (typeof symbolWeights === "object" && symbolWeights !== null && !Array.isArray(symbolWeights)) {
            const weights = new Map<string, number>();
            for (const [symbolId, weight] of Object.entries(symbolWeights as Record<string, unknown>)) {
                if (typeof weight === "number" && Number.isInteger(weight) && weight > 0) {
                    weights.set(symbolId, weight);
                }
            }
            return weights.size > 0 ? {weights, source: "symbolWeights"} : undefined;
        }

        return undefined;
    }

    // Design-quality smells on the reel weighting itself: a symbol so common it dominates the reels, a
    // wild landing at least as often as an average regular symbol (wilds substitute for everything, so
    // should be rarer), and a higher-paying symbol that isn't rarer than a lower-paying one (the exact
    // mismatch that quietly inflates RTP well past what the paytable alone suggests — equal weighting
    // across symbols with different payouts is the most common way to trip this).
    private validateWeightingQuality(
        reelStrips: unknown,
        reelStripGeneration: unknown,
        symbolWeights: unknown,
        wilds: string[],
        scatters: string[],
        regularPayouts: Map<string, SymbolPayout[]>,
        issues: ValidationIssue[],
    ): void {
        const effective = this.computeEffectiveWeights(reelStrips, reelStripGeneration, symbolWeights);
        if (effective === undefined) {
            return;
        }
        const {weights, source} = effective;

        const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
        for (const [symbolId, weight] of weights) {
            if (weight / total > DOMINANT_SYMBOL_WEIGHT_SHARE) {
                issues.push({
                    code: "blueprint-weighting-dominant-symbol",
                    severity: "warning",
                    message: `"${symbolId}" makes up ${Math.round((weight / total) * 100)}% of "${source}" — it will dominate the reels and crowd out other symbols.`,
                    suggestion: `Lower "${symbolId}"'s share of "${source}" relative to the other symbols.`,
                });
            }
        }

        const regularWeights = [...weights.entries()].filter(([symbolId]) => !wilds.includes(symbolId) && !scatters.includes(symbolId));
        if (regularWeights.length > 0) {
            const averageRegularWeight = regularWeights.reduce((sum, [, weight]) => sum + weight, 0) / regularWeights.length;
            for (const wildSymbolId of wilds) {
                const wildWeight = weights.get(wildSymbolId);
                if (wildWeight !== undefined && wildWeight >= averageRegularWeight) {
                    issues.push({
                        code: "blueprint-weighting-wild-too-common",
                        severity: "warning",
                        message: `Wild symbol "${wildSymbolId}" has weight ${wildWeight} in "${source}", at least as common as the average regular symbol (${averageRegularWeight.toFixed(1)}) — wilds substitute for everything, so landing this often will inflate hit frequency and RTP well beyond what the paytable alone suggests.`,
                        suggestion: `Make "${wildSymbolId}" rarer than the regular symbols in "${source}".`,
                    });
                }
            }
        }

        const tieredSymbols = [...regularPayouts.entries()]
            .filter(([symbolId]) => weights.has(symbolId))
            .map(([symbolId, payouts]) => ({
                symbolId,
                weight: weights.get(symbolId) as number,
                topPayout: Math.max(...payouts.map((payout) => payout.multiplier)),
            }))
            .sort((a, b) => b.topPayout - a.topPayout);

        for (let i = 1; i < tieredSymbols.length; i++) {
            const higher = tieredSymbols[i - 1];
            const lower = tieredSymbols[i];
            if (higher.topPayout > lower.topPayout && higher.weight >= lower.weight) {
                issues.push({
                    code: "blueprint-weighting-pay-mismatch",
                    severity: "warning",
                    message: `"${higher.symbolId}" pays more than "${lower.symbolId}" (${higher.topPayout}x vs ${lower.topPayout}x at a full line) but isn't rarer in "${source}" (weight ${higher.weight} vs ${lower.weight}) — a higher-paying symbol landing this often will inflate RTP well beyond what the paytable alone suggests.`,
                    suggestion: `Lower "${higher.symbolId}"'s weight relative to "${lower.symbolId}" in "${source}", or rebalance the paytable so payout roughly tracks rarity.`,
                });
            }
        }
    }
}
