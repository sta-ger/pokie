import fs from "fs";
import path from "path";
import os from "os";
import type {GameBlueprint} from "@fromstan/pokie";
import {fractionalBetBlueprint} from "../../fixtures/math/FractionalBetFixture.js";

// These tests copy the real host runtime and dependency graph several times per conversion.
export const PACKAGE_EXTRACTION_TEST_TIMEOUT = 120_000;

/** Give direct Jest and npm launches the same clone-local snapshot storage. */
export function createPackageExtractionTestEnvironment(): () => void {
    const cache = path.resolve(__dirname, "../../../node_modules/.cache/pokie-tmp");
    fs.mkdirSync(cache, {recursive: true});
    const directory = fs.mkdtempSync(path.join(cache, "pokie-package-extraction-"));
    const original = process.env.TMPDIR;
    process.env.TMPDIR = directory;
    return () => {
        try {
            fs.rmSync(directory, {recursive: true, force: true});
        } finally {
            if (original === undefined) Reflect.deleteProperty(process.env, "TMPDIR");
            else process.env.TMPDIR = original;
        }
    };
}

export function writeDescriptorPackage(
    parent: string,
    options: {name?: string; model?: Partial<GameBlueprint>; legacy?: boolean; descriptorBody?: string} = {},
): string {
    const root = path.join(parent, options.name ?? "descriptor-package");
    fs.mkdirSync(root, {recursive: true});
    const model = options.model ?? fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
    fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({name: "npm-identity", version: "99", pokie: {entry: "index.js"}}),
    );
    fs.writeFileSync(
        path.join(root, "index.js"),
        `// Fixture source: ${JSON.stringify(path.resolve(root))}
const model = ${JSON.stringify(model)};
module.exports = {
    getManifest() { return model.manifest; },
    createSession() { throw new Error("Model extraction must not create a session"); },
    ${
    options.legacy
        ? ""
        : `getModelDescriptor() { ${
            options.descriptorBody ??
                  'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model};'
        } },`
}
};`,
    );
    return root;
}

/** A real descriptor read, paused at an explicit read number or when a lifecycle phase arms it. */
export function writePausedDescriptorPackage(
    parent: string,
    descriptorExpression = '{descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model}',
    options: {pauseAtRead?: number} = {},
) {
    const control = path.join(parent, "descriptor-read.txt");
    fs.writeFileSync(control, "existing descriptor input");
    const source = writeDescriptorPackage(parent, {descriptorBody:
        `return require("fs").promises.readFile(${JSON.stringify(control)}, "utf8").then(descriptorInput => (${descriptorExpression}));`,});
    let armed = false;
    let readCount = 0;
    let started!: () => void;
    let settle!: () => void;
    const readStarted = new Promise<void>(resolve => {
        started = resolve;
    });
    const gate = new Promise<void>(resolve => {
        settle = resolve;
    });
    const readFile = fs.promises.readFile.bind(fs.promises);
    const spy = jest.spyOn(fs.promises, "readFile").mockImplementation((...args) => {
        const read = readFile(...args);
        if (String(args[0]) !== control) return read;
        readCount++;
        if (!armed && readCount !== options.pauseAtRead) return read;
        armed = false;
        started();
        return gate.then(() => read);
    });
    // An import/snapshot failure must fail at its actual boundary, rather than leave the
    // test waiting forever for a descriptor which can no longer be reached.
    const waitForRead = (operation: Promise<unknown>): Promise<void> => Promise.race([
        readStarted,
        operation.then(() => {
            throw new Error("Package operation settled before the paused descriptor read");
        }),
    ]);
    return {source, control, readStarted, waitForRead, settle, get readCount() {
        return readCount;
    }, arm: () => {
        armed = true;
    }, restore: () => {
        settle();
        spy.mockRestore();
    }};
}

/** Inventory this fixture's leases, independent of other workers sharing the temporary directory. */
export function runtimeSnapshotNames(packageSource: string): string[] {
    // Every descriptor embeds its absolute fixture root in index.js. The loader copies those
    // bytes unchanged, so this binding detects owned leases without matching a sibling's model.
    const entry = fs.readFileSync(path.join(packageSource, "index.js"));
    const temporaryDirectory = os.tmpdir();
    return fs.readdirSync(temporaryDirectory).filter(name => {
        if (!name.startsWith("pokie-runtime-")) return false;
        try {
            return fs.readFileSync(path.join(temporaryDirectory, name, "index.js")).equals(entry);
        } catch (error) {
            // A foreign worker may release its snapshot between enumeration and inspection.
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw error;
        }
    }).sort();
}

/** Independently assembled runnable code-first game: no generated module or Blueprint artifact. */
export function writeRunnableCodeFirstPackage(parent: string): string {
    const root = path.join(parent, "code-first");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "code-first-probe", version: "1", pokie: {entry: "index.js"}}));
    fs.writeFileSync(path.join(root, "index.js"), `
const {VideoSlotConfig, VideoSlotWithFreeGamesConfig, VideoSlotWithFreeGamesSession,
    SymbolsSequence, SymbolsCombinationsGenerator, SeededRandomNumberGenerator, CustomLinesDefinitions, Paytable} = require("@fromstan/pokie");
const manifest = {id: "code-first-probe", name: "Code first probe", version: "1"};
const symbols = ["A", "B", "S"];
const strips = [["A", "B", "S", "A"], ["B", "S", "A", "A"], ["S", "A", "B", "A"]];
const stakes = [0.05, 7.5, 1e-7];
const payouts = {A: {3: 5}, B: {3: 0}, S: {2: 0}};
const grants = {2: 0, 3: 2};
function createConfig() {
    const config = new VideoSlotConfig();
    config.setAvailableBets(stakes);
    config.setReelsNumber(3);
    config.setReelsSymbolsNumber(1);
    config.setWildSymbols([]);
    config.setScatterSymbols(["S"]);
    config.setAvailableSymbols(symbols);
    const lines = new CustomLinesDefinitions();
    lines.setLineDefinition("0", [0, 0, 0]);
    config.setLinesDefinitions(lines);
    config.setSymbolsSequences(strips.map(strip => new SymbolsSequence().fromArray(strip)));
    const paytable = new Paytable(stakes);
    for (const [symbol, table] of Object.entries(payouts)) for (const [count, payout] of Object.entries(table)) paytable.setPayoutForSymbol(symbol, Number(count), payout);
    config.setPaytable(paytable);
    const free = new VideoSlotWithFreeGamesConfig(config, {});
    for (const [count, award] of Object.entries(grants)) free.setFreeGamesForScatters("S", Number(count), award);
    return free;
}
module.exports = {
    getManifest() { return manifest; },
    getModelDescriptor() { return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: {
        manifest, reels: 3, rows: 1, symbols, wilds: [], scatters: ["S"], paylines: [[0, 0, 0]],
        paytable: payouts, reelStrips: strips, availableBets: stakes, mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: grants}}
    }}; },
    createSession(context) {
        const config = createConfig();
        const generator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(context.seed));
        return new VideoSlotWithFreeGamesSession(config, generator);
    }
};
`);
    return root;
}
