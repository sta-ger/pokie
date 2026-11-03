import {createHash} from "crypto";
import fs from "fs";
import path from "path";
import {ensureCompiledTestOutput} from "./ensureCompiledTestOutput.js";

/** Real native CJS runtime and declared dependencies, without checkout docs/tests/evidence. */
export function stageCompiledTestRuntime(parent: string): string {
    const repositoryRoot = path.resolve(__dirname, "../..");
    // Other suites rebuild/clear checkout dist. Compile this fixture into a separate,
    // source-bound cache so neither staging nor a running loader races those writers.
    const hash = createHash("sha256").update("isolated-test-cjs-v1");
    const hashTree = (directory: string): void => {
        for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) hashTree(file);
            else hash.update(path.relative(repositoryRoot, file)).update(fs.readFileSync(file));
        }
    };
    hashTree(path.join(repositoryRoot, "src"));
    for (const file of ["tsconfig.prod.json", "package.json"]) hash.update(file).update(fs.readFileSync(path.join(repositoryRoot, file)));
    const cache = path.join(repositoryRoot, "node_modules/.cache/pokie-test-runtime", hash.digest("hex"));
    const output = path.join(cache, "dist/cjs");
    const complete = path.join(cache, "complete.json");
    ensureCompiledTestOutput({
        repositoryRoot,
        outputPaths: [complete],
        lockName: "isolated-compiled-runtime",
        command: [process.execPath, "-e", `
            const {execFileSync} = require("node:child_process");
            const fs = require("node:fs"), path = require("node:path");
            const output = ${JSON.stringify(output)};
            execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--project", "tsconfig.prod.json", "--module", "CommonJS", "--outDir", output], {stdio: "inherit"});
            fs.writeFileSync(path.join(output, "package.json"), JSON.stringify({name: "@fromstan/pokie", type: "commonjs", exports: {".": "./index.js"}}));
            for (const file of ["simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs", "gamepackage/internal/runtimeLocation.mjs"]) {
                fs.mkdirSync(path.dirname(path.join(output, file)), {recursive: true});
                fs.copyFileSync(path.join("src", file), path.join(output, file));
            }
            fs.writeFileSync(${JSON.stringify(complete)}, JSON.stringify({complete: true}));
        `],
    });
    const runtimePackageRoot = path.join(parent, "node_modules/@fromstan/pokie");
    fs.mkdirSync(path.join(runtimePackageRoot, "dist"), {recursive: true});
    fs.copyFileSync(path.join(repositoryRoot, "package.json"), path.join(runtimePackageRoot, "package.json"));
    fs.cpSync(output, path.join(runtimePackageRoot, "dist/cjs"), {recursive: true});
    fs.symlinkSync(path.join(repositoryRoot, "node_modules"), path.join(runtimePackageRoot, "node_modules"), "junction");
    return runtimePackageRoot;
}
