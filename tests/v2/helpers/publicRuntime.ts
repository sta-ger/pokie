import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import ts from "typescript";
import {stageCompiledTestRuntime} from "../../testUtils/stageCompiledTestRuntime.js";
import type {legacyRoundGame} from "../fixtures/RuntimeExtension.js";
import type {legacyComposedGame} from "../fixtures/LegacyComposedGame.js";

/** Fresh compiler outputs with the real package export conditions, independent of Jest aliases. */
export function emitPublicRuntime(options: {runtimeFilesOnly?: boolean; temporaryRoot?: string} = {}): {directory: string; legacyGame: typeof legacyComposedGame; roundGame: typeof legacyRoundGame; dispose: () => void} {
    const root = process.cwd();
    const temporaryRoot = options.temporaryRoot ?? path.join(root, "node_modules/.cache/pokie-tmp");
    fs.mkdirSync(temporaryRoot, {recursive: true});
    const directory = fs.mkdtempSync(path.join(temporaryRoot, "v2c02-public-"));
    try {
        stageCompiledTestRuntime(directory, ["esm", "cjs"], options);
    } catch (error) {
        fs.rmSync(directory, {recursive: true, force: true});
        // Node spawn errors can self-reference through .error; retain the real
        // failure message without crashing Jest's worker-report serialization.
        throw new Error(`Public runtime fixture preparation failed: ${(error as Error).message}`);
    }
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({name: "public-runtime-consumer", private: true, type: "module"}));
    for (const format of ["esm", "cjs"] as const) {
        for (const [fixtureName, outputName] of [["LegacyComposedGame", "game"], ["RuntimeExtension", "extension"]]) {
            const fixture = fs.readFileSync(path.join(root, `tests/v2/fixtures/${fixtureName}.ts`), "utf8");
            fs.writeFileSync(path.join(directory, `${outputName}.${format === "esm" ? "mjs" : "cjs"}`), ts.transpileModule(fixture, {
                compilerOptions: {module: format === "esm" ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
            }).outputText);
        }
    }
    const nativeRequire = createRequire(path.join(directory, "consumer.cjs"));
    const {legacyComposedGame: legacyGame} = nativeRequire("./game.cjs") as {legacyComposedGame: typeof legacyComposedGame};
    const {legacyRoundGame: roundGame} = nativeRequire("./extension.cjs") as {legacyRoundGame: typeof legacyRoundGame};
    return {directory, legacyGame, roundGame, dispose: () => fs.rmSync(directory, {recursive: true, force: true})};
}
