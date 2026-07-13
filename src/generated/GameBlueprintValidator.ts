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
            issues.push({code: "blueprint-reels-invalid", severity: "error", message: '"reels" must be a positive integer.'});
        } else if ((reels as number) > SUSPICIOUS_REELS_OR_ROWS_THRESHOLD) {
            issues.push({
                code: "blueprint-reels-suspicious",
                severity: "warning",
                message: `"reels" is ${reels}, which is unusually large for a line-pay video slot (most use 3-7 reels) — double-check this is intentional.`,
            });
        }

        const rows = b.rows;
        const rowsValid = typeof rows === "number" && Number.isInteger(rows) && rows >= 1;
        if (!rowsValid) {
            issues.push({code: "blueprint-rows-invalid", severity: "error", message: '"rows" must be a positive integer.'});
        } else if ((rows as number) > SUSPICIOUS_REELS_OR_ROWS_THRESHOLD) {
            issues.push({
                code: "blueprint-rows-suspicious",
                severity: "warning",
                message: `"rows" is ${rows}, which is unusually large for a line-pay video slot (most use 3-7 rows) — double-check this is intentional.`,
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

        const paytableSymbols = this.validatePaytable(b.paytable, symbolSet, symbolsValid, wilds, reels, reelsValid, issues);
        this.validatePaylines(b.paylines, reels, reelsValid, rows, rowsValid, issues);
        const reelStripSymbols = this.validateReelStrips(b.reelStrips, symbolSet, symbolsValid, reels, reelsValid, rows, rowsValid, issues);
        const reelStripGenerationSymbols = this.validateReelStripGeneration(b.reelStripGeneration, symbolSet, symbolsValid, issues);
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

        const regularPayouts = this.validatePaytableQuality(b.paytable, wilds, scatters, reels, reelsValid, issues);
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

        return issues;
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

    private validatePaytable(
        paytable: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        wilds: string[],
        reels: unknown,
        reelsValid: boolean,
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
                const timesValid = Number.isInteger(timesNumber) && timesNumber >= 2 && (!reelsValid || timesNumber <= (reels as number));
                if (!timesValid) {
                    issues.push({
                        code: "blueprint-paytable-invalid-times",
                        severity: "error",
                        message: `"paytable.${symbolId}" has an invalid match-count key "${times}" (expected an integer between 2 and "reels").`,
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

    // Shape-checks reelStripGeneration only: length/seed/symbolCounts-or-symbolWeights/
    // lockedPositions/maxAttempts/policy-enum values, plus a "known constraint type" check on each
    // constraints[] entry. Whether the resulting configuration can actually be *satisfied* is a
    // runtime question ReelStripGenerator itself answers (each constraint class fail-fasts on a
    // nonsensical numeric bound in its own constructor, and unsatisfiable constraints surface as a
    // build-time failure) — see resolveReelStripGeneration.ts and BuildCommand, not here.
    private validateReelStripGeneration(
        reelStripGeneration: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): Set<string> | undefined {
        if (reelStripGeneration === undefined) {
            return undefined;
        }

        if (typeof reelStripGeneration !== "object" || reelStripGeneration === null || Array.isArray(reelStripGeneration)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid",
                severity: "error",
                message: '"reelStripGeneration", if present, must be an object.',
            });
            return undefined;
        }

        const g = reelStripGeneration as Record<string, unknown>;

        if (!(typeof g.length === "number" && Number.isInteger(g.length) && g.length > 0)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-length",
                severity: "error",
                message: '"reelStripGeneration.length" must be a positive integer.',
            });
        }

        if (!(typeof g.seed === "number" && Number.isInteger(g.seed))) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-seed",
                severity: "error",
                message: '"reelStripGeneration.seed" must be an integer — required (not optional) so builds stay deterministic.',
            });
        }

        const hasCounts = g.symbolCounts !== undefined;
        const hasWeights = g.symbolWeights !== undefined;
        if (hasCounts === hasWeights) {
            issues.push({
                code: "blueprint-reelstripgeneration-source-invalid",
                severity: "error",
                message: 'Exactly one of "reelStripGeneration.symbolCounts" or "reelStripGeneration.symbolWeights" must be set.',
            });
        }

        let generatedSymbols: Set<string> | undefined;
        if (hasCounts && !hasWeights) {
            generatedSymbols = this.validateReelStripGenerationCounts(g.symbolCounts, symbolSet, symbolsValid, issues);
        } else if (hasWeights && !hasCounts) {
            generatedSymbols = this.validateReelStripGenerationWeights(g.symbolWeights, symbolSet, symbolsValid, issues);
        }

        if (g.lockedPositions !== undefined) {
            this.validateReelStripGenerationLockedPositions(g.lockedPositions, symbolSet, symbolsValid, issues);
        }

        if (g.constraints !== undefined) {
            this.validateReelStripGenerationConstraints(g.constraints, issues);
        }

        if (g.maxAttempts !== undefined && !(typeof g.maxAttempts === "number" && Number.isInteger(g.maxAttempts) && g.maxAttempts > 0)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-maxattempts",
                severity: "error",
                message: '"reelStripGeneration.maxAttempts", if present, must be a positive integer.',
            });
        }

        if (g.roundingPolicy !== undefined && !REEL_STRIP_ROUNDING_POLICIES.includes(g.roundingPolicy as string)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-roundingpolicy",
                severity: "error",
                message: `"reelStripGeneration.roundingPolicy", if present, must be one of: ${REEL_STRIP_ROUNDING_POLICIES.join(", ")}.`,
            });
        }

        if (g.remainderTieBreakPolicy !== undefined && !REEL_STRIP_TIE_BREAK_POLICIES.includes(g.remainderTieBreakPolicy as string)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-tiebreakpolicy",
                severity: "error",
                message: `"reelStripGeneration.remainderTieBreakPolicy", if present, must be one of: ${REEL_STRIP_TIE_BREAK_POLICIES.join(", ")}.`,
            });
        }

        return generatedSymbols;
    }

    private validateReelStripGenerationCounts(
        symbolCounts: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): Set<string> | undefined {
        if (typeof symbolCounts !== "object" || symbolCounts === null || Array.isArray(symbolCounts)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-symbolcounts",
                severity: "error",
                message: '"reelStripGeneration.symbolCounts", if present, must be an object mapping symbol ids to non-negative counts.',
            });
            return undefined;
        }

        const generatedSymbols = new Set<string>();
        for (const [symbolId, count] of Object.entries(symbolCounts as Record<string, unknown>)) {
            generatedSymbols.add(symbolId);
            if (symbolsValid && !symbolSet.has(symbolId)) {
                issues.push({
                    code: "blueprint-reelstripgeneration-unknown-symbol",
                    severity: "error",
                    message: `"reelStripGeneration.symbolCounts" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                });
            }
            if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-count",
                    severity: "error",
                    message: `"reelStripGeneration.symbolCounts.${symbolId}" must be a non-negative integer.`,
                });
            }
        }
        return generatedSymbols;
    }

    private validateReelStripGenerationWeights(
        symbolWeights: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): Set<string> | undefined {
        if (typeof symbolWeights !== "object" || symbolWeights === null || Array.isArray(symbolWeights)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-symbolweights",
                severity: "error",
                message: '"reelStripGeneration.symbolWeights", if present, must be an object mapping symbol ids to positive weights.',
            });
            return undefined;
        }

        const generatedSymbols = new Set<string>();
        for (const [symbolId, weight] of Object.entries(symbolWeights as Record<string, unknown>)) {
            generatedSymbols.add(symbolId);
            if (symbolsValid && !symbolSet.has(symbolId)) {
                issues.push({
                    code: "blueprint-reelstripgeneration-unknown-symbol",
                    severity: "error",
                    message: `"reelStripGeneration.symbolWeights" references unknown symbol "${symbolId}", which is not listed in "symbols".`,
                });
            }
            if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-weight",
                    severity: "error",
                    message: `"reelStripGeneration.symbolWeights.${symbolId}" must be a positive, finite number.`,
                });
            }
        }
        return generatedSymbols;
    }

    private validateReelStripGenerationLockedPositions(
        lockedPositions: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): void {
        if (typeof lockedPositions !== "object" || lockedPositions === null || Array.isArray(lockedPositions)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-lockedpositions",
                severity: "error",
                message: '"reelStripGeneration.lockedPositions", if present, must be an object mapping position indexes to symbol ids.',
            });
            return;
        }

        for (const [position, symbolId] of Object.entries(lockedPositions as Record<string, unknown>)) {
            if (!Number.isInteger(Number(position)) || Number(position) < 0) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-lockedposition-index",
                    severity: "error",
                    message: `"reelStripGeneration.lockedPositions" has an invalid position key "${position}"; keys must be non-negative integers.`,
                });
            }
            if (typeof symbolId !== "string" || (symbolsValid && !symbolSet.has(symbolId))) {
                issues.push({
                    code: "blueprint-reelstripgeneration-unknown-symbol",
                    severity: "error",
                    message: `"reelStripGeneration.lockedPositions.${position}" references unknown symbol "${symbolId}".`,
                });
            }
        }
    }

    private validateReelStripGenerationConstraints(constraints: unknown, issues: ValidationIssue[]): void {
        if (!Array.isArray(constraints)) {
            issues.push({
                code: "blueprint-reelstripgeneration-invalid-constraints",
                severity: "error",
                message: '"reelStripGeneration.constraints", if present, must be an array of constraint specs.',
            });
            return;
        }

        constraints.forEach((constraint, index) => {
            if (typeof constraint !== "object" || constraint === null || Array.isArray(constraint)) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-constraint",
                    severity: "error",
                    message: `"reelStripGeneration.constraints[${index}]" must be an object with a "type" field.`,
                });
                return;
            }

            const type = (constraint as Record<string, unknown>).type;
            if (typeof type !== "string" || !REEL_STRIP_CONSTRAINT_TYPES.includes(type)) {
                issues.push({
                    code: "blueprint-reelstripgeneration-invalid-constraint-type",
                    severity: "error",
                    message: `"reelStripGeneration.constraints[${index}].type" must be one of: ${REEL_STRIP_CONSTRAINT_TYPES.join(", ")}.`,
                });
            }
        });
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
    private validatePaytableQuality(
        paytable: unknown,
        wilds: string[],
        scatters: string[],
        reels: unknown,
        reelsValid: boolean,
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
                const timesValid =
                    Number.isInteger(timesNumber) && timesNumber >= 2 && (!reelsValid || timesNumber <= (reels as number));
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
            if (entryTier.times === FREQUENT_LOW_MATCH_COUNT) {
                issues.push({
                    code: "blueprint-paytable-frequent-low-match",
                    severity: "warning",
                    message: `"paytable.${symbolId}" pays on just ${FREQUENT_LOW_MATCH_COUNT} matching symbols; for a non-scatter symbol that's very frequent (most line-pay symbols start at 3-of-a-kind) and will inflate hit frequency and RTP.`,
                    suggestion: `Remove the "${FREQUENT_LOW_MATCH_COUNT}" entry from "paytable.${symbolId}", or move "${symbolId}" to "scatters" if it's meant to pay regardless of position.`,
                });
            }

            if (!validPayouts.some((payout) => payout.times === 3) && (!reelsValid || (reels as number) >= 3)) {
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
    // occurrence count across every strip for reelStrips, the counts/weights object as-is for
    // reelStripGeneration (whichever of its own symbolCounts/symbolWeights is set), the weight value
    // itself for symbolWeights. Best-effort: reads through shape errors already reported elsewhere
    // the same way validateReelStrips's own stripSymbols does.
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

        if (typeof reelStripGeneration === "object" && reelStripGeneration !== null && !Array.isArray(reelStripGeneration)) {
            const g = reelStripGeneration as Record<string, unknown>;
            const generationSource = g.symbolCounts ?? g.symbolWeights;
            if (typeof generationSource === "object" && generationSource !== null && !Array.isArray(generationSource)) {
                const weights = new Map<string, number>();
                for (const [symbolId, weight] of Object.entries(generationSource as Record<string, unknown>)) {
                    if (typeof weight === "number" && Number.isFinite(weight) && weight > 0) {
                        weights.set(symbolId, weight);
                    }
                }
                if (weights.size > 0) {
                    return {weights, source: "reelStripGeneration"};
                }
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
