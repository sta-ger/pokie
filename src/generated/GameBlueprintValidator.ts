import type {GameBlueprintValidating} from "./GameBlueprintValidating.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";

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
        }

        const rows = b.rows;
        const rowsValid = typeof rows === "number" && Number.isInteger(rows) && rows >= 1;
        if (!rowsValid) {
            issues.push({code: "blueprint-rows-invalid", severity: "error", message: '"rows" must be a positive integer.'});
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
        this.validateSymbolSubset(b.scatters, "scatters", symbolSet, symbolsValid, issues);

        this.validatePaytable(b.paytable, symbolSet, symbolsValid, wilds, reels, reelsValid, issues);
        this.validatePaylines(b.paylines, reels, reelsValid, rows, rowsValid, issues);
        this.validateReelStrips(b.reelStrips, symbolSet, symbolsValid, reels, reelsValid, issues);
        this.validateSymbolWeights(b.symbolWeights, symbolSet, symbolsValid, issues);

        if (b.reelStrips !== undefined && b.symbolWeights !== undefined) {
            issues.push({
                code: "blueprint-reelstrips-and-weights",
                severity: "warning",
                message: 'Both "reelStrips" and "symbolWeights" are set; "reelStrips" takes precedence and "symbolWeights" is ignored.',
            });
        }

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

    private validatePaytable(
        paytable: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        wilds: string[],
        reels: unknown,
        reelsValid: boolean,
        issues: ValidationIssue[],
    ): void {
        if (typeof paytable !== "object" || paytable === null || Array.isArray(paytable)) {
            issues.push({
                code: "blueprint-paytable-missing",
                severity: "error",
                message: '"paytable" must be an object mapping symbol ids to {matchCount: betMultiplier}.',
            });
            return;
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

            for (const [times, multiplier] of Object.entries(payouts as Record<string, unknown>)) {
                const timesNumber = Number(times);
                if (!Number.isInteger(timesNumber) || timesNumber < 2 || (reelsValid && timesNumber > (reels as number))) {
                    issues.push({
                        code: "blueprint-paytable-invalid-times",
                        severity: "error",
                        message: `"paytable.${symbolId}" has an invalid match-count key "${times}" (expected an integer between 2 and "reels").`,
                    });
                }
                if (typeof multiplier !== "number" || multiplier <= 0) {
                    issues.push({
                        code: "blueprint-paytable-invalid-multiplier",
                        severity: "error",
                        message: `"paytable.${symbolId}.${times}" must be a positive number.`,
                    });
                }
            }
        }
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
            }
        });
    }

    private validateReelStrips(
        reelStrips: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        reels: unknown,
        reelsValid: boolean,
        issues: ValidationIssue[],
    ): void {
        if (reelStrips === undefined) {
            return;
        }

        if (!Array.isArray(reelStrips) || (reelsValid && reelStrips.length !== reels)) {
            issues.push({
                code: "blueprint-reelstrips-invalid",
                severity: "error",
                message: '"reelStrips", if present, must contain exactly one strip (array of symbol ids) per reel.',
            });
            return;
        }

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
            }
        });
    }

    private validateSymbolWeights(
        symbolWeights: unknown,
        symbolSet: Set<string>,
        symbolsValid: boolean,
        issues: ValidationIssue[],
    ): void {
        if (symbolWeights === undefined) {
            return;
        }

        if (typeof symbolWeights !== "object" || symbolWeights === null || Array.isArray(symbolWeights)) {
            issues.push({
                code: "blueprint-symbolweights-invalid",
                severity: "error",
                message: '"symbolWeights", if present, must be an object mapping symbol ids to positive counts.',
            });
            return;
        }

        for (const [symbolId, weight] of Object.entries(symbolWeights as Record<string, unknown>)) {
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
    }
}
