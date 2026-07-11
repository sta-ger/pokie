import type {GameBlueprint, GameBlueprintManifest} from "pokie";
import type {GameBlueprintWizarding} from "./GameBlueprintWizarding.js";
import type {PromptAdapting} from "./PromptAdapting.js";
import type {WizardResult} from "./WizardResult.js";

const DEFAULT_VERSION = "0.1.0";
const DEFAULT_REELS = 5;
const DEFAULT_ROWS = 3;
const DEFAULT_AVAILABLE_BETS = [1, 2, 5, 10];

// A dedicated class (rather than a duck-typed "{error: string}") so a valid parsed value that
// happens to look like {error: "..."} — e.g. a symbol literally named "error" — is never mistaken
// for a parse failure.
class WizardParseError {
    public readonly message: string;

    constructor(message: string) {
        this.message = message;
    }
}

type ParseResult<T> = T | WizardParseError;

// Thrown internally by ask() when the user cancels (Ctrl+C / the prompt's input stream ending) and
// caught only in run() — lets the rest of the wizard read as straight-line prompting code instead of
// threading a null check through every question.
class WizardCancelled extends Error {}

// Interactively builds the same GameBlueprint shape "pokie build <config.json>" reads from a file —
// see docs/cli.md#pokie-build-configjson and src/generated/GameBlueprint.ts for the target shape.
// Deliberately asks for the minimal field set for a line-pay video slot (no wilds/scatters yet);
// everything it produces still goes through the same GameBlueprintValidator/GamePackageGenerator as
// the config-driven path, so it's the only place that shape's validation/generation rules live.
export class GameBlueprintWizard implements GameBlueprintWizarding {
    public async run(prompt: PromptAdapting): Promise<WizardResult | null> {
        try {
            console.log("Building a GameBlueprint interactively. Press Ctrl+C at any time to cancel.\n");

            const manifest = await this.askManifest(prompt);
            const reels = await this.askPositiveInt(prompt, `Number of reels [${DEFAULT_REELS}]: `, DEFAULT_REELS);
            const rows = await this.askPositiveInt(prompt, `Number of rows [${DEFAULT_ROWS}]: `, DEFAULT_ROWS);
            const symbols = await this.askSymbols(prompt);
            const availableBets = await this.askAvailableBets(prompt);
            const paylines = await this.askPaylines(prompt, reels, rows);
            const paytable = await this.askPaytable(prompt, symbols);
            const {reelStrips, symbolWeights} = await this.askReelWeighting(prompt, symbols, reels);
            const outDir = await this.askOutDir(prompt, manifest.id);

            const blueprint: GameBlueprint = {
                manifest,
                reels,
                rows,
                symbols,
                paytable,
                ...(paylines !== undefined ? {paylines} : {}),
                ...(reelStrips !== undefined ? {reelStrips} : {}),
                ...(symbolWeights !== undefined ? {symbolWeights} : {}),
                ...(availableBets !== undefined ? {availableBets} : {}),
            };

            return {blueprint, outDir};
        } catch (error) {
            if (error instanceof WizardCancelled) {
                return null;
            }
            throw error;
        }
    }

    private async askManifest(prompt: PromptAdapting): Promise<GameBlueprintManifest> {
        const id = await this.askUntilValid(prompt, "Game id (e.g. crazy-fruits): ", (raw) => {
            if (raw.length === 0) {
                return new WizardParseError("Game id is required.");
            }
            if (raw.includes("/") || raw.includes("\\") || raw === "." || raw === "..") {
                return new WizardParseError('Game id must be a plain name (no slashes), e.g. "crazy-fruits".');
            }
            return raw;
        });

        const defaultName = this.titleCaseFromId(id);
        const name = await this.askWithDefault(prompt, `Game name [${defaultName}]: `, defaultName);
        const version = await this.askWithDefault(prompt, `Version [${DEFAULT_VERSION}]: `, DEFAULT_VERSION);

        return {id, name, version};
    }

    private askPositiveInt(prompt: PromptAdapting, question: string, defaultValue: number): Promise<number> {
        return this.askUntilValid(prompt, question, (raw) => {
            if (raw.length === 0) {
                return defaultValue;
            }
            const value = Number(raw);
            if (!Number.isInteger(value) || value < 1) {
                return new WizardParseError("Enter a positive whole number.");
            }
            return value;
        });
    }

    private askSymbols(prompt: PromptAdapting): Promise<string[]> {
        return this.askUntilValid(prompt, "Symbols, comma-separated (e.g. A,K,Q,J,10): ", (raw) => {
            const symbols = this.splitList(raw);
            if (symbols.length === 0) {
                return new WizardParseError("Enter at least one symbol id.");
            }
            if (new Set(symbols).size !== symbols.length) {
                return new WizardParseError("Symbol ids must be unique.");
            }
            return symbols;
        });
    }

    private askAvailableBets(prompt: PromptAdapting): Promise<number[] | undefined> {
        return this.askUntilValid(
            prompt,
            `Available bets, comma-separated [${DEFAULT_AVAILABLE_BETS.join(",")}] (or "-" for the engine default): `,
            (raw) => {
                if (raw.length === 0) {
                    return DEFAULT_AVAILABLE_BETS;
                }
                if (raw === "-") {
                    return undefined;
                }
                const bets = this.splitList(raw).map(Number);
                if (bets.length === 0 || bets.some((bet) => !Number.isFinite(bet) || bet <= 0)) {
                    return new WizardParseError('Enter positive numbers separated by commas, or "-" to skip.');
                }
                return bets;
            },
        );
    }

    private askPaylines(prompt: PromptAdapting, reels: number, rows: number): Promise<number[][] | undefined> {
        return this.askUntilValid(
            prompt,
            `Paylines — Enter for the default (one horizontal line per row), or ";"-separated lines of ${reels} row ` +
                `indexes each (0-${rows - 1}), e.g. "0,0,0,0,0;1,1,1,1,1": `,
            (raw) => {
                if (raw.length === 0) {
                    return undefined;
                }

                const paylines: number[][] = [];
                for (const line of raw.split(";").map((segment) => segment.trim()).filter((segment) => segment.length > 0)) {
                    const rowIndexes = this.splitList(line).map(Number);
                    const valid =
                        rowIndexes.length === reels &&
                        rowIndexes.every((row) => Number.isInteger(row) && row >= 0 && row < rows);
                    if (!valid) {
                        return new WizardParseError(`Each payline needs exactly ${reels} row indexes between 0 and ${rows - 1}.`);
                    }
                    paylines.push(rowIndexes);
                }
                if (paylines.length === 0) {
                    return new WizardParseError("Enter at least one payline, or leave blank for the default.");
                }
                return paylines;
            },
        );
    }

    private async askPaytable(prompt: PromptAdapting, symbols: string[]): Promise<Record<string, Record<string, number>>> {
        console.log("\nPaytable — for each symbol, enter matchCount:multiplier pairs (e.g. 3:5,4:10,5:20), or Enter to skip it.");

        const paytable: Record<string, Record<string, number>> = {};
        for (const symbol of symbols) {
            const payouts = await this.askUntilValid(prompt, `  "${symbol}": `, (raw) => {
                if (raw.length === 0) {
                    return {};
                }

                const entries: Record<string, number> = {};
                for (const pair of this.splitList(raw)) {
                    const [timesRaw, multiplierRaw] = pair.split(":").map((part) => part.trim());
                    const times = Number(timesRaw);
                    const multiplier = Number(multiplierRaw);
                    if (!Number.isInteger(times) || times < 2 || !Number.isFinite(multiplier) || multiplier <= 0) {
                        return new WizardParseError(`Invalid pair "${pair}" — expected matchCount:multiplier, e.g. "3:5".`);
                    }
                    entries[String(times)] = multiplier;
                }
                return entries;
            });

            if (Object.keys(payouts).length > 0) {
                paytable[symbol] = payouts;
            }
        }
        return paytable;
    }

    private async askReelWeighting(
        prompt: PromptAdapting,
        symbols: string[],
        reels: number,
    ): Promise<{reelStrips?: string[][]; symbolWeights?: Record<string, number>}> {
        const mode = await this.askUntilValid(
            prompt,
            'Reel weighting — "w" for symbol weights, "s" for explicit reel strips, or Enter for the engine default: ',
            (raw) => {
                const normalized = raw.toLowerCase();
                if (normalized === "" || normalized === "w" || normalized === "s") {
                    return normalized;
                }
                return new WizardParseError('Enter "w", "s", or leave blank.');
            },
        );

        if (mode === "w") {
            const symbolWeights = await this.askUntilValid(
                prompt,
                `Symbol weights as symbol:count pairs, comma-separated (e.g. ${symbols[0]}:8): `,
                (raw) => {
                    const pairs = this.splitList(raw);
                    if (pairs.length === 0) {
                        return new WizardParseError("Enter at least one symbol:count pair.");
                    }

                    const weights: Record<string, number> = {};
                    for (const pair of pairs) {
                        const [symbol, countRaw] = pair.split(":").map((part) => part.trim());
                        const count = Number(countRaw);
                        if (!symbol || !Number.isInteger(count) || count <= 0) {
                            return new WizardParseError(`Invalid pair "${pair}" — expected symbol:count, e.g. "A:8".`);
                        }
                        weights[symbol] = count;
                    }
                    return weights;
                },
            );
            return {symbolWeights};
        }

        if (mode === "s") {
            const reelStrips: string[][] = [];
            for (let reelIndex = 0; reelIndex < reels; reelIndex++) {
                const strip = await this.askUntilValid(
                    prompt,
                    `  Reel ${reelIndex + 1}/${reels} strip, comma-separated symbol ids: `,
                    (raw) => {
                        const stripSymbols = this.splitList(raw);
                        return stripSymbols.length > 0 ? stripSymbols : new WizardParseError("Enter at least one symbol id.");
                    },
                );
                reelStrips.push(strip);
            }
            return {reelStrips};
        }

        return {};
    }

    private async askOutDir(prompt: PromptAdapting, id: string): Promise<string | undefined> {
        const raw = await this.ask(prompt, `Output directory [./${id}]: `);
        return raw.length > 0 ? raw : undefined;
    }

    private askWithDefault(prompt: PromptAdapting, question: string, defaultValue: string): Promise<string> {
        return this.askUntilValid(prompt, question, (raw) => (raw.length > 0 ? raw : defaultValue));
    }

    private async askUntilValid<T>(
        prompt: PromptAdapting,
        question: string,
        parse: (raw: string) => ParseResult<T>,
    ): Promise<T> {
        for (;;) {
            const raw = await this.ask(prompt, question);
            const result = parse(raw);
            if (result instanceof WizardParseError) {
                console.log(`  ${result.message}`);
                continue;
            }
            return result;
        }
    }

    private async ask(prompt: PromptAdapting, question: string): Promise<string> {
        const answer = await prompt.ask(question);
        if (answer === null) {
            throw new WizardCancelled();
        }
        return answer.trim();
    }

    private splitList(raw: string): string[] {
        return raw
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }

    private titleCaseFromId(id: string): string {
        return id
            .split(/[-_\s]+/)
            .filter((word) => word.length > 0)
            .map((word) => word[0].toUpperCase() + word.slice(1))
            .join(" ");
    }
}
