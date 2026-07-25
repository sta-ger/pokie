import {
    ALL_SLOT_GAME_NAME_THEMES,
    SlotGameNameGenerating,
    SlotGameNameGenerator,
    SlotGameNameRequest,
    SlotGameNameResult,
    SlotGameNameTheme,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

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

    private parseArgs(args: string[]): NameOptions {
        let count = 1;
        let theme: SlotGameNameTheme | undefined;
        let wordCount: 2 | 3 | undefined;
        let seed: number | undefined;
        let json = false;

        for (let i = 0; i < args.length; i++) {
            const flag = args[i];
            const value = args[i + 1];
            switch (flag) {
                case "--count": {
                    const parsed = value === undefined ? NaN : Number(value);
                    if (!Number.isInteger(parsed) || parsed <= 0) {
                        throw new Error(`--count requires a positive integer. ${USAGE}`);
                    }
                    count = parsed;
                    i++;
                    break;
                }
                case "--theme": {
                    if (value === undefined || !ALL_SLOT_GAME_NAME_THEMES.includes(value as SlotGameNameTheme)) {
                        throw new Error(`--theme must be one of: ${ALL_SLOT_GAME_NAME_THEMES.join(", ")}. ${USAGE}`);
                    }
                    theme = value as SlotGameNameTheme;
                    i++;
                    break;
                }
                case "--words": {
                    if (value !== "2" && value !== "3") {
                        throw new Error(`--words must be 2 or 3. ${USAGE}`);
                    }
                    wordCount = Number(value) as 2 | 3;
                    i++;
                    break;
                }
                case "--seed": {
                    const parsed = value === undefined ? NaN : Number(value);
                    if (!Number.isInteger(parsed)) {
                        throw new Error(`--seed requires an integer value. ${USAGE}`);
                    }
                    seed = parsed;
                    i++;
                    break;
                }
                case "--json": {
                    json = true;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {count, theme, wordCount, seed, json};
    }
}
