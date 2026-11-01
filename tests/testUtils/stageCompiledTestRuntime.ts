import fs from "fs";
import path from "path";
import {ensureCompiledTestOutput} from "./ensureCompiledTestOutput.js";

/** Real native CJS runtime and declared dependencies, without checkout docs/tests/evidence. */
export function stageCompiledTestRuntime(parent: string): string {
    const repositoryRoot = path.resolve(__dirname, "../..");
    ensureCompiledTestOutput({
        repositoryRoot,
        outputPaths: ["index.js", "index.d.ts", "package.json"].map(file => path.join(repositoryRoot, "dist/cjs", file)),
        lockName: "compiled-runtime",
        command: ["npm", "run", "build-test-runtime"],
    });
    const runtimePackageRoot = path.join(parent, "node_modules/@fromstan/pokie");
    fs.mkdirSync(path.join(runtimePackageRoot, "dist"), {recursive: true});
    fs.copyFileSync(path.join(repositoryRoot, "package.json"), path.join(runtimePackageRoot, "package.json"));
    fs.cpSync(path.join(repositoryRoot, "dist/cjs"), path.join(runtimePackageRoot, "dist/cjs"), {recursive: true});
    fs.symlinkSync(path.join(repositoryRoot, "node_modules"), path.join(runtimePackageRoot, "node_modules"), "junction");
    return runtimePackageRoot;
}
