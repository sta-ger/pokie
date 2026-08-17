import fs from "fs";
import path from "path";
import {InitCommand} from "../../cli/commands/InitCommand.js";
import {PackageCommandRunning} from "../../cli/prepare/PackageCommandRunner.js";

// `pokie init` deliberately starts with a minimal, hand-editable runtime rather than prescribing a
// game's reel model.  This is the bounded code-first implementation an author adds when their game
// has a finite reel-stop space and wants to opt into the public exact-enumeration contract.
const EXACT_MULTI_MODE_GAME_SOURCE = `import {
    BetModeDefinition,
    BetModesConfig,
    PokieGame,
    PokieGameContext,
    SeededRandomNumberGenerator,
    SymbolsCombinationsGenerating,
    SymbolsCombinationsGenerator,
    SymbolsSequence,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionSerializer,
    VideoSlotWithBetModesSession,
} from "pokie";

const manifest = {id: "code-first-registry-slot", name: "Code-first Registry Slot", version: "1.0.0"};

function createConfig(): VideoSlotConfig<string> {
    const config = new VideoSlotConfig<string>();
    config.setReelsNumber(2);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(["A", "B"]);
    config.setAvailableBets([1]);
    config.setSymbolsSequences([
        new SymbolsSequence<string>().fromArray(["A", "A", "B"]),
        new SymbolsSequence<string>().fromArray(["A", "B"]),
    ]);
    return config;
}

function createBetModes(): BetModesConfig {
    return new BetModesConfig([
        new BetModeDefinition("base"),
        new BetModeDefinition("ante", {stakeMultiplier: 2}),
    ], "base");
}

function createModeSession(combinationsGenerator: SymbolsCombinationsGenerating<string>): VideoSlotWithBetModesSession<string> {
    return new VideoSlotWithBetModesSession(new VideoSlotSession(createConfig(), combinationsGenerator), createBetModes());
}

const game: PokieGame = {
    getManifest() {
        return manifest;
    },
    getBetModes() {
        return [
            {id: "base", runtimeType: "base", isDefault: true},
            {id: "ante", runtimeType: "ante", costMultiplier: 2},
        ];
    },
    getConfigHash() {
        return "sha256:code-first-registry-slot-v1";
    },
    createSession(context?: PokieGameContext) {
        const config = createConfig();
        const generator = context?.seed === undefined
            ? new SymbolsCombinationsGenerator(config)
            : new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(context.seed));
        return new VideoSlotWithBetModesSession(new VideoSlotSession(config, generator), createBetModes());
    },
    createExactEnumerationSession(combinationsGenerator: SymbolsCombinationsGenerating) {
        return createModeSession(combinationsGenerator as SymbolsCombinationsGenerating<string>);
    },
    getSessionSerializer() {
        return new VideoSlotSessionSerializer();
    },
};

export = game;
`;

// The caller deliberately provides InitCommand's real local dependency runner.  That keeps this
// fixture offline while still exercising the production init -> install -> build lifecycle after a
// code-first author replaces the starter module with their finite, explicitly enumerable game.
export async function prepareExactCodeFirstPackage(projectRoot: string, runner: PackageCommandRunning): Promise<void> {
    // Do not let init verify the intentionally temporary starter module: Node caches that entry by
    // absolute path, while a code-first author must replace it before the first real build/load.
    const initExitCode = await new InitCommand("1.3.0", undefined, runner).run([projectRoot, "--game-id", "code-first-registry-slot", "--no-prepare"]);
    if (initExitCode !== 0) {
        throw new Error(`pokie init failed with exit code ${initExitCode}.`);
    }
    fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), EXACT_MULTI_MODE_GAME_SOURCE);
    await runner("npm", ["install"], projectRoot);
    await runner("npm", ["run", "build"], projectRoot);
}
