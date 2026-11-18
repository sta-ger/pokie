import {createHash} from "crypto";
import fs from "fs";
import path from "path";
import {ensureCompiledTestOutput} from "./ensureCompiledTestOutput.js";

export function compiledTestRuntime(repositoryRoot = path.resolve(__dirname, "../..")): string {
    // Other suites rebuild/clear checkout dist. Compile this fixture into a separate,
    // source-bound cache so neither staging nor a running loader races those writers.
    const hash = createHash("sha256").update(`isolated-test-runtime-v3:esm:${process.version}`);
    const hashTree = (directory: string): void => {
        for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) hashTree(file);
            else if (entry.isFile()) hash.update(path.relative(repositoryRoot, file)).update(fs.readFileSync(file));
            else throw new Error(`Unsupported linked runtime input: ${file}`);
        }
    };
    hashTree(path.join(repositoryRoot, "src"));
    for (const file of ["tsconfig.prod.json", "tsconfig.json", "package.json", "package-lock.json", "node_modules/typescript/package.json",
        "tests/testUtils/stageCompiledTestRuntime.ts"]) hash.update(file).update(fs.readFileSync(path.join(repositoryRoot, file)));
    const cache = path.join(repositoryRoot, "node_modules/.cache/pokie-test-runtime", hash.digest("hex"));
    const output = path.join(cache, "dist", "esm");
    const complete = path.join(cache, "complete.json");
    ensureCompiledTestOutput({
        repositoryRoot,
        outputPaths: [complete],
        lockName: "isolated-compiled-runtime",
        validateOutputs: () => {
            try {
                const manifest = JSON.parse(fs.readFileSync(complete, "utf8")) as Record<string, string>;
                const actual: string[] = [];
                const collect = (directory: string): void => {
                    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
                        const file = path.join(directory, entry.name);
                        if (entry.isDirectory()) collect(file);
                        else if (entry.isFile()) actual.push(path.relative(output, file));
                        else throw new Error("Unsupported runtime cache entry");
                    }
                };
                collect(output);
                return JSON.stringify(actual.sort()) === JSON.stringify(Object.keys(manifest).sort()) &&
                    actual.length > 0 && Object.entries(manifest).every(([name, digest]) =>
                    !path.isAbsolute(name) && !name.split(/[\\/]/).includes("..") &&
                    createHash("sha256").update(fs.readFileSync(path.join(output, name))).digest("hex") === digest);
            } catch {
                return false;
            }
        },
        command: [process.execPath, "-e", `
            const {execFileSync} = require("node:child_process");
            const fs = require("node:fs"), path = require("node:path");
            const output = ${JSON.stringify(output)};
            fs.rmSync(output, {recursive: true, force: true});
            execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--project", "tsconfig.prod.json", "--rootDir", "src", "--module", "Node16", "--outDir", output], {stdio: "inherit"});
            for (const file of ["simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs", "gamepackage/internal/runtimeLocation.mjs"]) {
                fs.mkdirSync(path.dirname(path.join(output, file)), {recursive: true});
                fs.copyFileSync(path.join("src", file), path.join(output, file));
            }
            const manifest = {};
            function collect(directory) {
                for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
                    const file = path.join(directory, entry.name);
                    if (entry.isDirectory()) collect(file);
                    else if (entry.isFile()) manifest[path.relative(output, file)] = require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex");
                    else throw new Error("Unsupported runtime cache entry");
                }
            }
            collect(output);
            fs.writeFileSync(${JSON.stringify(complete)}, JSON.stringify(manifest));
        `],
    });
    return output;
}

/** Real native runtime, private to the consumer; only compiler outputs are shared. */
export function stageCompiledTestRuntime(parent: string, options: {runtimeFilesOnly?: boolean} = {}): string {
    const repositoryRoot = path.resolve(__dirname, "../..");
    const runtimePackageRoot = path.join(parent, "node_modules/@fromstan/pokie");
    fs.mkdirSync(path.join(runtimePackageRoot, "dist"), {recursive: true});
    fs.copyFileSync(path.join(repositoryRoot, "package.json"), path.join(runtimePackageRoot, "package.json"));
    // Executing generated games/workers needs the real JS/module scopes, not
    // declarations and source maps copied again into every private runtime lease.
    // Keep full outputs by default for callers that compile public consumers.
    fs.cpSync(compiledTestRuntime(repositoryRoot), path.join(runtimePackageRoot, "dist", "esm"), {
        recursive: true,
        filter: file => !options.runtimeFilesOnly || (!file.endsWith(".d.ts") && !file.endsWith(".map")),
    });
    fs.symlinkSync(path.join(repositoryRoot, "node_modules"), path.join(runtimePackageRoot, "node_modules"), "junction");
    return runtimePackageRoot;
}
