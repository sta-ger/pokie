import {
    ALL_SLOT_GAME_NAME_THEMES,
    SlotGameNameGenerating,
    SlotGameNameGenerator,
    SlotGameNameRequest,
    SlotGameNameResult,
    SlotGameNameTheme,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]";

type NameOptions = {count: number; theme?: SlotGameNameTheme; wordCount?: 2 | 3; seed?: number; json: boolean};

// Thin CLI wrapper over the standalone SlotGameNameGenerator (see src/generated/SlotGameNameGenerator.ts) —
// deterministic, offline name generation, never a second naming implementation. "--count" always goes through
// generateUnique (even for the default count of 1), so the human/JSON output shapes never special-case a lone
// result: both are always the same SlotGameNameResult[] the generator itself returns.
export class NameCommand implements CliCommandHandling {
    private readonly generator: SlotGameNameGenerating;

    constructor(generator: SlotGameNameGenerating = new SlotGameNameGenerator()) {
        this.generator = generator;
    }

    public getName(): string {
        return "name";
    }

    public getDescription(): string {
        return (
            "Generate deterministic, offline slot game name(s) from SlotGameNameGenerator " +
            '("pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <n>] [--json]").'
        );
    }

    public run(args: string[]): Promise<number> {
        try {
            const options = this.parseArgs(args);
            const request: SlotGameNameRequest = {seed: options.seed, theme: options.theme, wordCount: options.wordCount};
            const results = this.generator.generateUnique(options.count, request);

            if (options.json) {
                console.log(JSON.stringify(results, null, 4));
            } else {
                this.printHuman(results, options);
            }

            return Promise.resolve(0);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private printHuman(results: SlotGameNameResult[], options: NameOptions): void {
        for (const result of results) {
            console.log(`${result.title}  (slug: ${result.slug}, package: ${result.packageName})`);
        }

        const countFlag = options.count > 1 ? ` --count ${options.count}` : "";
        const themeFlag = options.theme !== undefined ? ` --theme ${options.theme}` : "";
        const wordsFlag = options.wordCount !== undefined ? ` --words ${options.wordCount}` : "";
        console.log(`\nReproduce with: pokie name --seed ${results[0].seed}${countFlag}${themeFlag}${wordsFlag}`);
    }

    // NameCommand has no positionals at all, so a trailing "[excess...]" catches every stray bare
    // token (the original loop's default case treated ANY unmatched token -- flag-shaped or not -- as
    // an "Unknown option"). Each validated option uses a custom parser for an invalid *provided* value,
    // and optionMissingArgument maps a structurally *missing* value (the flag given with nothing after
    // it) back to the exact same message, matching each original case's own single combined check
    // (e.g. "value === undefined ? NaN : Number(value)").
    private parseArgs(args: string[]): NameOptions {
        let result: NameOptions | undefined;
        const command = createCommanderCliCommand("name")
            .argument("[excess...]")
            .option(
                "--count <count>",
                "",
                (value: string) => {
                    const parsed = Number(value);
                    if (!Number.isInteger(parsed) || parsed <= 0) {
                        throw new Error(`--count requires a positive integer. ${USAGE}`);
                    }
                    return parsed;
                },
                1,
            )
            .option("--theme <theme>", "", (value: string) => {
                if (!ALL_SLOT_GAME_NAME_THEMES.includes(value as SlotGameNameTheme)) {
                    throw new Error(`--theme must be one of: ${ALL_SLOT_GAME_NAME_THEMES.join(", ")}. ${USAGE}`);
                }
                return value as SlotGameNameTheme;
            })
            .option("--words <words>", "", (value: string) => {
                if (value !== "2" && value !== "3") {
                    throw new Error(`--words must be 2 or 3. ${USAGE}`);
                }
                return Number(value) as 2 | 3;
            })
            .option("--seed <integer>", "", (value: string) => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed)) {
                    throw new Error(`--seed requires an integer value. ${USAGE}`);
                }
                return parsed;
            })
            .option("--json")
            .action(
                (excess: string[], options: {count: number; theme?: SlotGameNameTheme; words?: 2 | 3; seed?: number; json?: boolean}) => {
                    if (excess.length > 0) {
                        throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                    }
                    result = {count: options.count, theme: options.theme, wordCount: options.words, seed: options.seed, json: options.json ?? false};
                },
            );

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => {
                    switch (flag) {
                        case "--count":
                            return `--count requires a positive integer. ${USAGE}`;
                        case "--theme":
                            return `--theme must be one of: ${ALL_SLOT_GAME_NAME_THEMES.join(", ")}. ${USAGE}`;
                        case "--words":
                            return `--words must be 2 or 3. ${USAGE}`;
                        case "--seed":
                            return `--seed requires an integer value. ${USAGE}`;
                        default:
                            return `Unknown option "${flag}". ${USAGE}`;
                    }
                },
            });
        }
        return result!;
    }
}
