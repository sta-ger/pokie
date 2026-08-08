import {
    SlotGameNameGenerator,
    type GameBlueprint,
    type GameBlueprintManifest,
    type GameBlueprintMechanics,
    type SlotGameNameGenerating,
} from "pokie";
import {createStarterGameBlueprint} from "../build/createStarterGameBlueprint.js";
import {deriveManifestDefaults} from "../scaffold/deriveManifestDefaults.js";
import type {GameBlueprintWizarding, GameBlueprintWizardOptions} from "./GameBlueprintWizarding.js";
import type {PromptAdapting} from "./PromptAdapting.js";
import type {WizardResult} from "./WizardResult.js";

// Fallback ladder for symbols the canonical preset knows nothing about (a wizard run that typed its
// own symbol ids): first symbol is the rarest, each subsequent one two steps more common, which
// mirrors the shape of the preset's own weights without hardcoding a second copy of its values.
const FALLBACK_WEIGHT_BASE = 4;
const FALLBACK_WEIGHT_STEP = 2;

// Lowest match count a generated default paytable ladder pays for, when the preset's own entry for a
// symbol doesn't fit the chosen reel count. Clamped down for tiny reel counts by the caller.
const FALLBACK_MIN_MATCH_COUNT = 3;

// The answer that opts a question out of its default entirely — a symbol with no payout at all, or
// leaving reel weighting to the engine. Enter now applies the default rather than skipping, so
// skipping needs its own token; "-" is already what the available-bets question uses for this.
const SKIP_ANSWER = "-";

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
// Covers the same fields Studio's own guided "Design Game" editor does (basics, layout, symbols/roles,
// reels, paytable, bets), plus the scatter-triggered free games mechanic Studio's guided editor doesn't
// offer at all. Everything it produces still goes through the same GameBlueprintValidator/
// GamePackageGenerator as the config-driven path, so it's the only place that shape's validation/
// generation rules live.
export class GameBlueprintWizard implements GameBlueprintWizarding {
    private readonly nameGenerator: SlotGameNameGenerating;
    private readonly defaults: GameBlueprint;

    // Every default this wizard offers is read off the same canonical starter blueprint
    // createStarterGameBlueprint() builds, rather than being restated here — pressing Enter through
    // the whole wizard therefore produces that known-good blueprint (modulo the generated manifest and
    // the output directory), which is exactly what makes an Enter-only run valid.
    constructor(
        nameGenerator: SlotGameNameGenerating = new SlotGameNameGenerator(),
        createDefaultBlueprint: () => GameBlueprint = createStarterGameBlueprint,
    ) {
        this.nameGenerator = nameGenerator;
        this.defaults = createDefaultBlueprint();
    }

    public async run(prompt: PromptAdapting, options?: GameBlueprintWizardOptions): Promise<WizardResult | null> {
        const editing = options?.editing ?? false;
        try {
            console.log(
                editing
                    ? "Editing this GameBlueprint interactively. Press Ctrl+C at any time to cancel.\n"
                    : "Building a GameBlueprint interactively. Press Ctrl+C at any time to cancel.\n",
            );

            const manifest = await this.askManifest(prompt, options?.presetName, editing);
            const reels = await this.askPositiveInt(
                prompt,
                `Number of reels (most games use 3-7) [${this.defaults.reels}]: `,
                this.defaults.reels,
            );
            const rows = await this.askPositiveInt(
                prompt,
                `Number of rows (most games use 3-7) [${this.defaults.rows}]: `,
                this.defaults.rows,
            );
            const symbols = await this.askSymbols(prompt);
            const wilds = await this.askWilds(prompt, symbols, editing);
            const scatters = await this.askScatters(prompt, symbols, wilds ?? [], editing);
            const availableBets = await this.askAvailableBets(prompt);
            const paylines = await this.askPaylines(prompt, reels, rows, editing);
            const paytable = await this.askPaytable(prompt, symbols, reels, wilds ?? []);
            // A "generated" reelStripGeneration has no representation in this wizard's own reel-weighting
            // question (symbolWeights or literal reelStrips only) -- "pokie reel generate" is the
            // dedicated editor for that shape (see its own doc comment), so an edit run carries it through
            // untouched instead of asking a question that could only ever destroy it.
            const reelStripGeneration = editing ? this.defaults.reelStripGeneration : undefined;
            let reelStrips: string[][] | undefined;
            let symbolWeights: Record<string, number> | undefined;
            if (reelStripGeneration !== undefined) {
                console.log(
                    '\nReel weighting -- this blueprint already has a "generated" reelStripGeneration; left ' +
                        'unchanged here. Use "pokie reel generate" to adjust it.',
                );
            } else {
                ({reelStrips, symbolWeights} = await this.askReelWeighting(prompt, symbols, reels, editing));
            }
            const mechanics = await this.askMechanics(prompt, scatters ?? [], editing);
            const outDir = await this.askOutDir(prompt, manifest.id, options?.destination);

            const blueprint: GameBlueprint = {
                manifest,
                reels,
                rows,
                symbols,
                paytable,
                ...(wilds !== undefined ? {wilds} : {}),
                ...(scatters !== undefined ? {scatters} : {}),
                ...(paylines !== undefined ? {paylines} : {}),
                ...(reelStrips !== undefined ? {reelStrips} : {}),
                ...(symbolWeights !== undefined ? {symbolWeights} : {}),
                ...(reelStripGeneration !== undefined ? {reelStripGeneration} : {}),
                ...(availableBets !== undefined ? {availableBets} : {}),
                ...(mechanics !== undefined ? {mechanics} : {}),
            };

            return {blueprint, outDir};
        } catch (error) {
            if (error instanceof WizardCancelled) {
                return null;
            }
            throw error;
        }
    }

    // Minted once per wizard run (before the id question's own retry loop below), so it stays the
    // same suggestion across however many invalid attempts the id question takes -- SlotGameNameGenerator
    // itself would mint a fresh random name on every call, which would otherwise make the offered
    // default drift on each reprompt. A given "presetName" (e.g. "pokie create <name>") replaces the
    // generator call entirely -- its own derivation (deriveManifestDefaults) is what
    // applyBlueprintNameOverride uses for the same "<name>" argument on the non-interactive paths, so
    // an accepted suggestion here always agrees with what a non-interactive run of the same name would
    // have produced.
    private async askManifest(prompt: PromptAdapting, presetName?: string, editing?: boolean): Promise<GameBlueprintManifest> {
        const preset = presetName !== undefined ? deriveManifestDefaults(presetName) : undefined;
        // Editing never mints a fresh random suggestion or derives one from a preset name -- the
        // GameBlueprint this wizard was constructed with (this.defaults) IS the blueprint being edited,
        // so its own manifest is the only sensible id/name/version default (see run()'s own "editing"
        // doc comment).
        const suggestion = !editing && preset === undefined ? this.nameGenerator.generate() : undefined;

        // packageName, not slug: both are minted from the same title, but slug carries a numeric
        // uniqueness suffix ("blazing-riches-4821") that has no business in a game id someone is about
        // to name their project after. The suffixed form stays available where it's actually useful —
        // see "pokie name", which still prints it alongside the plain one.
        const suggestedId = editing ? this.defaults.manifest.id : (preset?.id ?? suggestion!.packageName);

        const id = await this.askUntilValid(prompt, `Game id [${suggestedId}]: `, (raw) => {
            if (raw.length === 0) {
                return suggestedId;
            }
            if (raw.includes("/") || raw.includes("\\") || raw === "." || raw === "..") {
                return new WizardParseError("Game id must be a plain name, without slashes.");
            }
            return raw;
        });

        // Only the accepted-suggestion id gets the generator's/preset's/edited blueprint's own name as
        // its name default -- a manually typed id falls back to title-casing that id instead.
        let defaultName: string;
        if (id !== suggestedId) {
            defaultName = this.titleCaseFromId(id);
        } else {
            defaultName = editing ? this.defaults.manifest.name : (preset?.name ?? suggestion!.title);
        }
        const name = await this.askWithDefault(prompt, `Game name [${defaultName}]: `, defaultName);
        const defaultVersion = this.defaults.manifest.version;
        const version = await this.askWithDefault(prompt, `Version [${defaultVersion}]: `, defaultVersion);

        return {id, name, version};
    }

    // Both ask for symbol ids drawn from the declared "symbols" list; a symbol may be at most one of
    // wild/scatter (askScatters rejects any overlap with the wilds already collected -- see
    // GameBlueprintValidator's own "blueprint-wilds-scatters-overlap"). Returns undefined (not an empty
    // array) on a blank Enter, same as every other optional-field question here, so an Enter-only run
    // omits the field entirely rather than writing out "wilds": [].
    private askWilds(prompt: PromptAdapting, symbols: string[], editing?: boolean): Promise<string[] | undefined> {
        const knownSymbols = new Set(symbols);
        // Only offered when editing AND every one of the edited blueprint's own wilds is still among the
        // symbols entered earlier this run -- a symbol list edited down below its previous wilds has
        // nothing valid left to default to, same as create's own "no default" case.
        const existingWilds = editing ? this.defaults.wilds : undefined;
        const defaultWilds = existingWilds !== undefined && existingWilds.every((symbol) => knownSymbols.has(symbol)) ? existingWilds : undefined;
        const question =
            defaultWilds !== undefined
                ? `Wild symbols, comma-separated (from: ${symbols.join(",")}) [${defaultWilds.length > 0 ? defaultWilds.join(",") : "none"}]: `
                : `Wild symbols, comma-separated (from: ${symbols.join(",")}), or Enter for none: `;
        return this.askUntilValid(prompt, question, (raw) => {
            if (raw.length === 0) {
                return defaultWilds !== undefined ? [...defaultWilds] : undefined;
            }
            const wilds = this.splitList(raw);
            const unknown = wilds.filter((symbol) => !knownSymbols.has(symbol));
            if (unknown.length > 0) {
                return new WizardParseError(
                    `Unknown symbol(s) "${unknown.join(", ")}" — not among the symbols entered earlier (${symbols.join(", ")}).`,
                );
            }
            return wilds;
        });
    }

    private askScatters(prompt: PromptAdapting, symbols: string[], wilds: string[], editing?: boolean): Promise<string[] | undefined> {
        const knownSymbols = new Set(symbols);
        const wildSet = new Set(wilds);
        const existingScatters = editing ? this.defaults.scatters : undefined;
        const defaultScatters =
            existingScatters !== undefined && existingScatters.every((symbol) => knownSymbols.has(symbol) && !wildSet.has(symbol))
                ? existingScatters
                : undefined;
        const question =
            defaultScatters !== undefined
                ? `Scatter symbols, comma-separated (from: ${symbols.join(",")}) [${defaultScatters.length > 0 ? defaultScatters.join(",") : "none"}]: `
                : `Scatter symbols, comma-separated (from: ${symbols.join(",")}), or Enter for none: `;
        return this.askUntilValid(prompt, question, (raw) => {
            if (raw.length === 0) {
                return defaultScatters !== undefined ? [...defaultScatters] : undefined;
            }
            const scatters = this.splitList(raw);
            const unknown = scatters.filter((symbol) => !knownSymbols.has(symbol));
            if (unknown.length > 0) {
                return new WizardParseError(
                    `Unknown symbol(s) "${unknown.join(", ")}" — not among the symbols entered earlier (${symbols.join(", ")}).`,
                );
            }
            const overlap = scatters.filter((symbol) => wildSet.has(symbol));
            if (overlap.length > 0) {
                return new WizardParseError(`Symbol(s) "${overlap.join(", ")}" can't be both a wild and a scatter.`);
            }
            return scatters;
        });
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
        const defaultSymbols = this.defaults.symbols;
        return this.askUntilValid(prompt, `Symbols, comma-separated [${defaultSymbols.join(",")}]: `, (raw) => {
            if (raw.length === 0) {
                return [...defaultSymbols];
            }

            const symbols = this.splitList(raw);
            if (symbols.length === 0) {
                return new WizardParseError("Enter at least one symbol id.");
            }
            if (new Set(symbols).size !== symbols.length) {
                return new WizardParseError("Symbol ids must be unique.");
            }
            // ":" is this wizard's own pair separator (used again later for paytable and reel-weighting
            // prompts) — a symbol id containing it would be unparseable there. "," can't occur here: it's
            // already split() on above, so no token can ever contain one.
            const reserved = symbols.filter((symbol) => symbol.includes(":"));
            if (reserved.length > 0) {
                return new WizardParseError(`Symbol id(s) "${reserved.join(", ")}" can't contain ":".`);
            }
            return symbols;
        });
    }

    private askAvailableBets(prompt: PromptAdapting): Promise<number[] | undefined> {
        const defaultBets = this.defaults.availableBets;
        return this.askUntilValid(
            prompt,
            `Available bets, comma-separated [${(defaultBets ?? []).join(",")}] (or "${SKIP_ANSWER}" for the engine default): `,
            (raw) => {
                if (raw.length === 0) {
                    return defaultBets === undefined ? undefined : [...defaultBets];
                }
                if (raw === SKIP_ANSWER) {
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

    private askPaylines(prompt: PromptAdapting, reels: number, rows: number, editing?: boolean): Promise<number[][] | undefined> {
        // Only offered when it's still structurally valid against the reels/rows chosen earlier THIS
        // run -- an edit that changed reel/row counts has nothing valid left of the previous paylines to
        // default to, same as create's own "no default" case.
        const existingPaylines = editing ? this.defaults.paylines : undefined;
        const defaultPaylines =
            existingPaylines !== undefined &&
            existingPaylines.every((line) => line.length === reels && line.every((row) => Number.isInteger(row) && row >= 0 && row < rows))
                ? existingPaylines
                : undefined;
        const question =
            defaultPaylines !== undefined
                ? `Paylines — Enter to keep the current ${defaultPaylines.length} line(s), or ";"-separated lines of ${reels} row ` +
                  `indexes each (0-${rows - 1}): `
                : `Paylines — Enter for the default (one horizontal line per row), or ";"-separated lines of ${reels} row ` +
                  `indexes each (0-${rows - 1}), e.g. "0,0,0,0,0;1,1,1,1,1": `;
        return this.askUntilValid(prompt, question, (raw) => {
            if (raw.length === 0) {
                return defaultPaylines !== undefined ? defaultPaylines.map((line) => [...line]) : undefined;
            }

            const paylines: number[][] = [];
            for (const line of raw.split(";").map((segment) => segment.trim()).filter((segment) => segment.length > 0)) {
                const rowIndexes = this.splitList(line).map(Number);
                const valid = rowIndexes.length === reels && rowIndexes.every((row) => Number.isInteger(row) && row >= 0 && row < rows);
                if (!valid) {
                    return new WizardParseError(`Each payline needs exactly ${reels} row indexes between 0 and ${rows - 1}.`);
                }
                paylines.push(rowIndexes);
            }
            if (paylines.length === 0) {
                return new WizardParseError("Enter at least one payline, or leave blank for the default.");
            }
            return paylines;
        });
    }

    private async askPaytable(
        prompt: PromptAdapting,
        symbols: string[],
        reels: number,
        wilds: string[],
    ): Promise<Record<string, Record<string, number>>> {
        console.log(
            `\nPaytable — for each symbol, enter matchCount:multiplier pairs (e.g. 3:5,4:10,5:20), Enter for the ` +
                `default shown, or "${SKIP_ANSWER}" to leave that symbol without a payout.`,
        );

        const wildSet = new Set(wilds);
        const paytable: Record<string, Record<string, number>> = {};
        for (const [index, symbol] of symbols.entries()) {
            // A wild's paytable entry is dead data (an all-wild line resolves to no winning symbol id —
            // see GameBlueprintValidator's own "blueprint-paytable-wild-symbol" warning), so this
            // question is never even asked for one — it always gets no payout, not a default guess.
            if (wildSet.has(symbol)) {
                continue;
            }
            const defaultPayouts = this.defaultPayoutsFor(symbol, index, symbols.length, reels);
            const payouts = await this.askUntilValid(prompt, `  "${symbol}" [${this.formatPayouts(defaultPayouts)}]: `, (raw) => {
                if (raw.length === 0) {
                    return {...defaultPayouts};
                }
                if (raw === SKIP_ANSWER) {
                    return {};
                }

                const entries: Record<string, number> = {};
                for (const pair of this.splitList(raw)) {
                    const [timesRaw, multiplierRaw] = pair.split(":").map((part) => part.trim());
                    const times = Number(timesRaw);
                    const multiplier = Number(multiplierRaw);
                    const timesValid = Number.isInteger(times) && times >= 2 && times <= reels;
                    if (!timesValid || !Number.isFinite(multiplier) || multiplier <= 0) {
                        return new WizardParseError(
                            `Invalid pair "${pair}" — expected matchCount:multiplier, matchCount between 2 and ${reels} ` +
                                `(the number of reels), e.g. "3:5".`,
                        );
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
        editing?: boolean,
    ): Promise<{reelStrips?: string[][]; symbolWeights?: Record<string, number>}> {
        const defaultWeights = this.defaultSymbolWeightsFor(symbols);
        // Only offered when reel count hasn't changed this run -- reel N's old strip has nothing to do
        // with reel N once the reel count itself has been edited.
        const existingStrips = editing ? this.defaults.reelStrips : undefined;
        const stripsDefaultValid = existingStrips !== undefined && existingStrips.length === reels;
        // The edited blueprint's own current weighting shape decides what a blank Enter on the mode
        // question itself preserves: explicit reel strips stay explicit strips, an absent weighting
        // (engine default) stays absent -- never silently promoted to a symbolWeights ladder that wasn't
        // there before, same as this.defaults.symbolWeights already keeps a defined ratio as-is via
        // defaultSymbolWeightsFor above.
        const defaultIsStrips = editing && stripsDefaultValid && this.defaults.symbolWeights === undefined;
        const defaultIsNone = editing && !stripsDefaultValid && this.defaults.symbolWeights === undefined;

        let modeDefaultLabel: string;
        if (defaultIsStrips) {
            modeDefaultLabel = "keep the current reel strips";
        } else if (defaultIsNone) {
            modeDefaultLabel = "the engine default (no explicit weighting, same as now)";
        } else {
            modeDefaultLabel = `weights matching the symbols above [${this.formatWeights(defaultWeights)}]`;
        }
        const mode = await this.askUntilValid(
            prompt,
            `Reel weighting — Enter for ${modeDefaultLabel}, "w" to enter your own symbol weights, "s" for explicit reel strips, or "${SKIP_ANSWER}" for the engine default: `,
            (raw) => {
                const normalized = raw.toLowerCase();
                if (normalized === "" || normalized === "w" || normalized === "s" || normalized === SKIP_ANSWER) {
                    return normalized;
                }
                return new WizardParseError(`Enter "w", "s", "${SKIP_ANSWER}", or leave blank.`);
            },
        );

        const knownSymbols = new Set(symbols);

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
                        if (!knownSymbols.has(symbol)) {
                            return new WizardParseError(
                                `Unknown symbol "${symbol}" — not one of the symbols entered earlier (${symbols.join(", ")}).`,
                            );
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
                const defaultStrip = stripsDefaultValid ? existingStrips[reelIndex] : undefined;
                const question =
                    defaultStrip !== undefined
                        ? `  Reel ${reelIndex + 1}/${reels} strip, comma-separated symbol ids [${defaultStrip.join(",")}]: `
                        : `  Reel ${reelIndex + 1}/${reels} strip, comma-separated symbol ids: `;
                const strip = await this.askUntilValid(prompt, question, (raw) => {
                    if (raw.length === 0 && defaultStrip !== undefined) {
                        return [...defaultStrip];
                    }
                    const stripSymbols = this.splitList(raw);
                    if (stripSymbols.length === 0) {
                        return new WizardParseError("Enter at least one symbol id.");
                    }
                    const unknown = stripSymbols.filter((symbol) => !knownSymbols.has(symbol));
                    if (unknown.length > 0) {
                        return new WizardParseError(
                            `Unknown symbol(s) "${unknown.join(", ")}" — not among the symbols entered earlier (${symbols.join(", ")}).`,
                        );
                    }
                    return stripSymbols;
                });
                reelStrips.push(strip);
            }
            return {reelStrips};
        }

        if (mode === SKIP_ANSWER) {
            return {};
        }

        if (mode === "") {
            if (defaultIsStrips) {
                return {reelStrips: existingStrips.map((strip) => [...strip])};
            }
            if (defaultIsNone) {
                return {};
            }
        }

        return {symbolWeights: defaultWeights};
    }

    // The default payouts offered for one symbol. The canonical preset's own entry is used verbatim
    // whenever it fits the chosen reel count; a wizard run that typed its own symbol ids (or picked a
    // reel count the preset's match-count keys overflow) still gets a valid ladder instead of nothing,
    // built so that matching more symbols never pays less — the shape GameBlueprintValidator expects.
    private defaultPayoutsFor(symbol: string, index: number, symbolCount: number, reels: number): Record<string, number> {
        const preset = this.defaults.paytable[symbol];
        if (preset !== undefined && Object.keys(preset).every((times) => Number(times) <= reels)) {
            return {...preset};
        }

        const minMatchCount = Math.min(FALLBACK_MIN_MATCH_COUNT, reels);
        // A paytable needs a match count of at least 2 to mean anything; a 1-reel game can't have one
        // at all, so offer nothing rather than an entry the validator would reject.
        if (minMatchCount < 2) {
            return {};
        }

        const payouts: Record<string, number> = {};
        let multiplier = Math.max(1, symbolCount - index);
        for (let times = minMatchCount; times <= reels; times++) {
            payouts[String(times)] = multiplier;
            multiplier *= 2;
        }
        return payouts;
    }

    // Default reel weighting for whatever symbols the run actually ended up with: the preset's own
    // weight for every symbol it knows (so an Enter-only run gets exactly the preset's weighting), and
    // a rarest-first fallback for any symbol it doesn't. Every symbol is always covered, which is what
    // keeps the weighting compatible with the symbol list rather than only with the default one.
    private defaultSymbolWeightsFor(symbols: string[]): Record<string, number> {
        const presetWeights = this.defaults.symbolWeights ?? {};
        const weights: Record<string, number> = {};
        symbols.forEach((symbol, index) => {
            weights[symbol] = presetWeights[symbol] ?? FALLBACK_WEIGHT_BASE + index * FALLBACK_WEIGHT_STEP;
        });
        return weights;
    }

    private formatPayouts(payouts: Record<string, number>): string {
        const pairs = Object.entries(payouts).map(([times, multiplier]) => `${times}:${multiplier}`);
        return pairs.length > 0 ? pairs.join(",") : SKIP_ANSWER;
    }

    private formatWeights(weights: Record<string, number>): string {
        return Object.entries(weights)
            .map(([symbol, count]) => `${symbol}:${count}`)
            .join(",");
    }

    // Only reachable at all with at least one declared scatter -- a scatter-triggered free games award
    // needs a scatter symbol to trigger off of (GameBlueprintValidator's own
    // "blueprint-mechanics-freegames-unknown-scatter"), so with none declared this mechanic has nothing
    // valid to configure and the question is skipped entirely, same as askPaytable skipping wilds.
    private async askMechanics(prompt: PromptAdapting, scatters: string[], editing?: boolean): Promise<GameBlueprintMechanics | undefined> {
        if (scatters.length === 0) {
            return undefined;
        }

        const existingFreeGames = editing ? this.defaults.mechanics?.freeGames : undefined;
        const defaultScatterSymbol =
            existingFreeGames !== undefined && scatters.includes(existingFreeGames.scatterSymbol) ? existingFreeGames.scatterSymbol : scatters[0];

        const scatterSymbol = await this.askUntilValid(
            prompt,
            `Free games — trigger scatter symbol [${defaultScatterSymbol}] (or "${SKIP_ANSWER}" to skip this mechanic): `,
            (raw) => {
                if (raw.length === 0) {
                    return defaultScatterSymbol;
                }
                if (raw === SKIP_ANSWER) {
                    return null;
                }
                if (!scatters.includes(raw)) {
                    return new WizardParseError(`Unknown scatter "${raw}" — not among the scatters entered earlier (${scatters.join(", ")}).`);
                }
                return raw;
            },
        );
        if (scatterSymbol === null) {
            return undefined;
        }

        // The edited blueprint's own awards only default forward when the trigger symbol is still the
        // same one they were configured for -- a changed trigger has no meaningful award ladder to carry
        // over.
        const defaultAwards = existingFreeGames !== undefined && scatterSymbol === existingFreeGames.scatterSymbol ? existingFreeGames.awardsByCount : undefined;
        const awardsQuestion =
            defaultAwards !== undefined
                ? `Free games awards as matchCount:games pairs, comma-separated [${this.formatPayouts(defaultAwards)}]: `
                : `Free games awards as matchCount:games pairs, comma-separated (e.g. 3:8,4:15,5:20): `;
        const awardsByCount = await this.askUntilValid(prompt, awardsQuestion, (raw) => {
            if (raw.length === 0 && defaultAwards !== undefined) {
                return {...defaultAwards};
            }
            const pairs = this.splitList(raw);
            if (pairs.length === 0) {
                return new WizardParseError("Enter at least one matchCount:games pair.");
            }
            const awards: Record<string, number> = {};
            for (const pair of pairs) {
                const [timesRaw, gamesRaw] = pair.split(":").map((part) => part.trim());
                const times = Number(timesRaw);
                const games = Number(gamesRaw);
                if (!Number.isInteger(times) || times < 2 || !Number.isInteger(games) || games <= 0) {
                    return new WizardParseError(`Invalid pair "${pair}" — expected matchCount:games, matchCount >= 2, e.g. "3:8".`);
                }
                awards[String(times)] = games;
            }
            return awards;
        });

        return {freeGames: {scatterSymbol, awardsByCount}};
    }

    private async askOutDir(
        prompt: PromptAdapting,
        id: string,
        destination?: {label: string; defaultPathFor: (id: string) => string},
    ): Promise<string | undefined> {
        if (destination === undefined) {
            const raw = await this.ask(prompt, `Output directory [./${id}]: `);
            return raw.length > 0 ? raw : undefined;
        }
        const defaultPath = destination.defaultPathFor(id);
        const raw = await this.ask(prompt, `${destination.label} [${defaultPath}]: `);
        return raw.length > 0 ? raw : defaultPath;
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
