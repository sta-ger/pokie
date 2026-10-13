import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import ts from "typescript";
import type {legacyRoundGame} from "../fixtures/RuntimeExtension.js";
import type {legacyComposedGame} from "../fixtures/LegacyComposedGame.js";

/** Fresh compiler outputs with the real package export conditions, independent of Jest aliases. */
export function emitPublicRuntime(): {directory: string; legacyGame: typeof legacyComposedGame; roundGame: typeof legacyRoundGame; dispose: () => void} {
    const root = process.cwd();
    const directory = fs.mkdtempSync(path.join(root, "node_modules/.cache/pokie-tmp/v2c02-public-"));
    const packageRoot = path.join(directory, "node_modules/@fromstan/pokie");
    fs.mkdirSync(packageRoot, {recursive: true});
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({name: "public-runtime-consumer", private: true, type: "module"}));
    fs.copyFileSync(path.join(root, "package.json"), path.join(packageRoot, "package.json"));
    const config = ts.readConfigFile(path.join(root, "tsconfig.prod.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    for (const [format, module] of [["esm", ts.ModuleKind.Node16], ["cjs", ts.ModuleKind.CommonJS]] as const) {
        const outDir = path.join(packageRoot, "dist", format);
        const program = ts.createProgram(parsed.fileNames, {...parsed.options, module, rootDir: path.join(root, "src"), outDir, sourceMap: false});
        const diagnostics = ts.getPreEmitDiagnostics(program);
        if (diagnostics.length > 0) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => "\n",
        }));
        if (program.emit().emitSkipped) throw new Error(`Public ${format} runtime emit failed.`);
        if (format === "cjs") fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({type: "commonjs"}));
        for (const asset of ["gamepackage/internal/runtimeLocation.mjs", "simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs"]) {
            fs.mkdirSync(path.dirname(path.join(outDir, asset)), {recursive: true});
            fs.copyFileSync(path.join(root, "src", asset), path.join(outDir, asset));
        }
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
