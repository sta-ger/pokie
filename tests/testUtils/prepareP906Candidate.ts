import {spawnSync} from "child_process";
import {createHash} from "crypto";
import fs from "fs";
import path from "path";
import {resolveLocalPokieDependencyClosure} from "../../cli/prepare/localPokieDependencyClosure.js";
import {ensureCompiledTestOutput} from "./ensureCompiledTestOutput.js";

/** Local candidate preparation only: no archive, npm install, lifecycle or registry access. */
export function compileP906Candidate(repositoryRoot: string): void {
    ensureCompiledTestOutput({
        repositoryRoot,
        outputPaths: ["dist/cli/pokie.js", "dist/esm/index.js", "dist/cjs/index.js", "dist/cli/studio-client/index.html", "dist/src/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs"].map((entry) => path.join(repositoryRoot, entry)),
        lockName: "canonical-artifact-cli",
        forceRebuild: true,
        executionTimeoutMs: 120_000,
        command: [process.execPath, "-e", `
            const {execFileSync}=require('node:child_process');
            const fs=require('node:fs');
            const run=(args)=>execFileSync(process.execPath,args,{stdio:'inherit',timeout:60000,killSignal:'SIGKILL'});
            run(['node_modules/typescript/bin/tsc','--project','tsconfig.prod.json']);
            run(['node_modules/typescript/bin/tsc','--project','tsconfig.prod.json','--module','CommonJS','--outDir','dist/cjs']);
            run(['write-cjs-package-json.js']);
            run(['node_modules/typescript/bin/tsc','--project','tsconfig.cli.json']);
            for(const format of ['esm','cjs','src'])
                fs.copyFileSync('src/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs','dist/'+format+'/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs');
            run(['node_modules/vite/bin/vite.js','build','--config','cli/studio-client/vite.config.ts']);
        `],
    });
}

export function prepareP906Candidate(repositoryRoot: string, directory: string) {
    const packageRoot = path.join(directory, "node_modules", "pokie");
    fs.mkdirSync(packageRoot, {recursive: true});
    for (const entry of ["dist", "README.md", "package.json"]) {
        fs.cpSync(path.join(repositoryRoot, entry), path.join(packageRoot, entry), {recursive: true});
    }
    fs.mkdirSync(path.join(packageRoot, "docs"));
    for (const entry of fs.readdirSync(path.join(repositoryRoot, "docs")).filter((name) => name.endsWith(".md"))) {
        fs.copyFileSync(path.join(repositoryRoot, "docs", entry), path.join(packageRoot, "docs", entry));
    }
    const dependencies = resolveLocalPokieDependencyClosure(repositoryRoot);
    for (const dependency of dependencies) {
        fs.cpSync(dependency.root, path.join(directory, "node_modules", dependency.name), {recursive: true, dereference: true});
    }
    // Verify every copied dependency resolves within the staged candidate, even though Jest's
    // temporary root can have the development checkout as an ancestor.
    const installedDependencies = resolveLocalPokieDependencyClosure(packageRoot);
    if (installedDependencies.length !== dependencies.length || installedDependencies.some((entry) => !entry.root.startsWith(`${directory}${path.sep}`))) {
        throw new Error("The P906 candidate did not resolve its complete local dependency closure.");
    }
    const launcher = path.join(directory, "node_modules", ".bin", "pokie");
    fs.mkdirSync(path.dirname(launcher), {recursive: true});
    fs.chmodSync(path.join(packageRoot, "dist", "cli", "pokie.js"), 0o755);
    fs.symlinkSync(path.join("..", "pokie", "dist", "cli", "pokie.js"), launcher);
    const workspace = path.join(directory, "workspace");
    const existingProject = path.join(workspace, "Existing Project");
    fs.mkdirSync(workspace);
    fs.cpSync(path.join(repositoryRoot, "tests", "cli", "fixtures", "playable-game"), existingProject, {recursive: true});
    // Resolve in ordinary Node, outside Jest's source module-name mapping.
    const resolution = spawnSync(process.execPath, ["-p", "require.resolve('pokie')"], {cwd: existingProject, encoding: "utf8", timeout: 5000});
    if (resolution.status !== 0 || resolution.stdout.trim() !== path.join(packageRoot, "dist", "cjs", "index.js")) {
        throw new Error("The supplied project's POKIE dependency does not resolve to this candidate.");
    }
    for (const entry of ["profile", "config", "cache", "tmp", "bin"]) fs.mkdirSync(path.join(directory, entry));
    // Truly bare startup opens a browser. Keep that best-effort host action in this owned
    // test sandbox; HTTP below still loads the real compiled Studio app and its hashed assets.
    fs.writeFileSync(path.join(directory, "bin", "xdg-open"), "#!/bin/sh\nexit 0\n", {mode: 0o755});
    const hash = createHash("sha256");
    function digestTree(root: string): void {
        for (const entry of fs.readdirSync(root).sort()) {
            const file = path.join(root, entry);
            if (fs.statSync(file).isDirectory()) digestTree(file);
            else hash.update(path.relative(directory, file)).update(fs.readFileSync(file));
        }
    }
    digestTree(path.join(directory, "node_modules"));
    const revision = spawnSync("git", ["rev-parse", "HEAD"], {cwd: repositoryRoot, encoding: "utf8", timeout: 5000});
    if (revision.status !== 0) throw new Error("Could not record the P906 candidate revision.");
    const identity = {
        revision: revision.stdout.trim(),
        sha256: hash.digest("hex"),
        node: process.version,
        npm: process.env.npm_config_user_agent ?? "not supplied by the named-test launcher",
        launcher,
        procedure: "compileP906Candidate + prepareP906Candidate: bounded ESM/CJS/CLI/Vite compilation, copy outputs and resolved production dependency closure, link the public bin; no npm installation or packaging acceptance claim",
    };
    return {
        packageRoot, launcher, workspace, existingProject, identity,
        env: {
            ...process.env,
            HOME: path.join(directory, "profile"),
            XDG_CONFIG_HOME: path.join(directory, "config"),
            XDG_CACHE_HOME: path.join(directory, "cache"),
            XDG_DOCUMENTS_DIR: path.join(directory, "profile"),
            TMPDIR: path.join(directory, "tmp"),
            PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
        },
    };
}
