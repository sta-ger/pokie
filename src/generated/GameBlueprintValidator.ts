import type {GameBlueprintValidating} from "./GameBlueprintValidating.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";

const SUSPICIOUS_REELS_OR_ROWS_THRESHOLD = 10;

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
        const weightSymbols = this.validateSymbolWeights(b.symbolWeights, symbolSet, symbolsValid, issues);

        if (b.reelStrips !== undefined && b.symbolWeights !== undefined) {
            issues.push({
                code: "blueprint-reelstrips-and-weights",
                severity: "warning",
                message: 'Both "reelStrips" and "symbolWeights" are set; "reelStrips" takes precedence and "symbolWeights" is ignored.',
            });
        }

        this.validateReachability(paytableSymbols, wilds, scatters, reelStripSymbols, weightSymbols, issues);
        this.validateEverySymbolHasAPayout(symbolList, symbolsValid, paytableSymbols, wilds, scatters, issues);

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
    // "symbolWeights" (when reelStrips is absent) does too — so a symbol that a blueprint pays out on,
    // or marks as wild/scatter, but never places in the explicit reel data can physically never land.
    // Without either field the built-in generator seeds every declared symbol on every reel, so there's
    // nothing to check.
    private validateReachability(
        paytableSymbols: string[],
        wilds: string[],
        scatters: string[],
        reelStripSymbols: Set<string> | undefined,
        weightSymbols: Set<string> | undefined,
        issues: ValidationIssue[],
    ): void {
        const reachable = reelStripSymbols ?? weightSymbols;
        if (reachable === undefined) {
            return;
        }
        const source = reelStripSymbols !== undefined ? "reelStrips" : "symbolWeights";

        const referenced = new Set<string>([...paytableSymbols, ...wilds, ...scatters]);
        for (const symbolId of referenced) {
            if (!reachable.has(symbolId)) {
                issues.push({
                    code: source === "reelStrips" ? "blueprint-reelstrips-missing-symbol" : "blueprint-symbolweights-missing-symbol",
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
}
