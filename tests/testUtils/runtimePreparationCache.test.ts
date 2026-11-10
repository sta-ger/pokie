import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {compiledTestRuntime} from "./stageCompiledTestRuntime.js";
import {preparePackedTestCandidate} from "./preparePackedTestCandidate.js";

// These tiny compiler/package fixtures test scheduling and corruption handling,
// not product parity or installed-package acceptance. The existing real native
// runtime/packed consumer suites retain those independent obligations.
describe("source-bound test preparation", () => {
    let root: string;
    const write = (name: string, text: string): void => {
        const file = path.join(root, name);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, text);
    };
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "test-preparation-cache-"));
        for (const name of ["package.json", "package-lock.json", "tsconfig.json", "tsconfig.prod.json", "node_modules/typescript/package.json"]) write(name, "{}");
        write("tests/testUtils/stageCompiledTestRuntime.ts", "fixture helper input");
        write("src/index.ts", "source-v1");
        for (const name of ["gamepackage/internal/runtimeLocation.mjs", "simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs"]) write(`src/${name}`, "export {};");
        write("node_modules/typescript/bin/tsc", `
            const fs=require('fs'),path=require('path');
            const output=process.argv[process.argv.indexOf('--outDir')+1];
            fs.mkdirSync(output,{recursive:true});
            fs.writeFileSync(path.join(output,'index.js'),fs.readFileSync('src/index.ts'));
            fs.appendFileSync('node_modules/compiler-calls', 'compile\\n');
        `);
    });
    afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

    it("compiles each format once, detects corrupt bytes and invalidates changed source/config/lock/compiler", () => {
        const first = compiledTestRuntime("cjs", root);
        expect(compiledTestRuntime("cjs", root)).toBe(first);
        const esm = compiledTestRuntime("esm", root);
        expect(esm).not.toBe(first);
        expect(compiledTestRuntime("esm", root)).toBe(esm);
        expect(fs.readFileSync(path.join(root, "node_modules/compiler-calls"), "utf8")).toBe("compile\ncompile\n");
        fs.writeFileSync(path.join(first, "index.js"), "corruption");
        expect(compiledTestRuntime("cjs", root)).toBe(first);
        expect(fs.readFileSync(path.join(first, "index.js"), "utf8")).toBe("source-v1");
        fs.writeFileSync(path.join(first, "stale.js"), "stale module");
        compiledTestRuntime("cjs", root);
        expect(fs.existsSync(path.join(first, "stale.js"))).toBe(false);
        let previous = first;
        for (const file of ["src/index.ts", "tsconfig.json", "package-lock.json", "node_modules/typescript/package.json"]) {
            write(file, file.endsWith(".json") ? '{"changed":true}' : "source-v2");
            const next = compiledTestRuntime("cjs", root);
            expect(next).not.toBe(previous);
            previous = next;
        }
    });

    it("shares a prepared package only for the exact clean candidate and rejects corrupt archive/receipt", () => {
        write(".gitignore", "node_modules/\n");
        write("scripts/p8-05-candidate-package-verifier.mjs", "// fixture verifier identity");
        write("scripts/prepare-test-package.mjs", `
            import fs from 'node:fs'; import path from 'node:path'; import {createHash} from 'node:crypto';
            const [root,dir,candidateId]=process.argv.slice(2);
            const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
            fs.mkdirSync(dir,{recursive:true}); const archive=Buffer.from('fixture archive, not a product');
            const proof={kind:'p8-05-candidate-executable-receipt',candidateId,candidatePackageSha256:hash(archive),
                verifiedBuild:{candidateId,environment:{NODE_ENV:'production'}}, authentication:{scheme:'verifier-owned-candidate-tree',
                verifierExecutableSha256:hash(fs.readFileSync(path.join(root,'scripts/p8-05-candidate-package-verifier.mjs')))}};
            const receipt=Buffer.from(JSON.stringify(proof));
            fs.writeFileSync(path.join(dir,'candidate-package.tgz'),archive);
            fs.writeFileSync(path.join(dir,'candidate-executable-receipt.json'),receipt);
            fs.writeFileSync(path.join(dir,'complete.json'),JSON.stringify({candidateId,archiveSha256:hash(archive),receiptSha256:hash(receipt)}));
            fs.appendFileSync(path.join(root,'node_modules/package-calls'),'prepare\\n');
        `);
        const git = (args: string[]): string => execFileSync("git", args, {cwd: root, encoding: "utf8"}).trim();
        git(["init", "-q"]);
        git(["config", "user.email", "test@local"]);
        git(["config", "user.name", "test"]);
        git(["add", "."]);
        git(["commit", "-qm", "input"]);
        const prepared = preparePackedTestCandidate(root);
        expect(preparePackedTestCandidate(root)).toEqual(prepared);
        expect(fs.readFileSync(path.join(root, "node_modules/package-calls"), "utf8")).toBe("prepare\n");
        const archive = fs.readFileSync(prepared.archive);
        fs.writeFileSync(prepared.archive, "corrupt archive");
        expect(() => preparePackedTestCandidate(root)).toThrow("Corrupt prepared test package");
        fs.writeFileSync(prepared.archive, archive);
        fs.writeFileSync(prepared.receipt, "{}");
        expect(() => preparePackedTestCandidate(root)).toThrow("Corrupt prepared test package");
        write("src/index.ts", "dirty");
        expect(() => preparePackedTestCandidate(root)).toThrow("must be clean");
        git(["add", "."]);
        git(["commit", "-qm", "new candidate"]);
        expect(preparePackedTestCandidate(root).candidateId).not.toBe(prepared.candidateId);
        expect(fs.readFileSync(path.join(root, "node_modules/package-calls"), "utf8")).toBe("prepare\nprepare\n");
    });

    it("runs the real package preparer and independent verifier against a tiny committed package", () => {
        write(".gitignore", "node_modules/\ndist/\n");
        write("package.json", JSON.stringify({name: "preparation-probe", version: "0.0.1", files: ["dist"],
            scripts: {build: "node build.cjs"}}));
        write("build.cjs", "const fs=require('fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.js','exports.answer=42;');");
        const git = (args: string[]): string => execFileSync("git", args, {cwd: root, encoding: "utf8"}).trim();
        git(["init", "-q"]);
        git(["config", "user.email", "test@local"]);
        git(["config", "user.name", "test"]);
        git(["add", "."]);
        git(["commit", "-qm", "tiny package"]);
        const candidateId = git(["rev-parse", "HEAD"]);
        const output = path.join(root, "node_modules/prepared");
        const module = pathToFileURL(path.resolve(__dirname, "../../scripts/prepare-test-package.mjs")).href;
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import {prepareTestPackage} from ${JSON.stringify(module)};
            await prepareTestPackage(${JSON.stringify(root)}, ${JSON.stringify(output)}, ${JSON.stringify(candidateId)});
        `], {encoding: "utf8", timeout: 20_000});
        const proof = JSON.parse(fs.readFileSync(path.join(output, "candidate-executable-receipt.json"), "utf8"));
        expect(proof.candidateId).toBe(candidateId);
        expect(proof.verifiedBuild.environment.NODE_ENV).toBe("production");
        expect(proof.authentication.scheme).toBe("verifier-owned-candidate-tree");
        expect(JSON.parse(fs.readFileSync(path.join(output, "complete.json"), "utf8")).archiveSha256).toBe(proof.candidatePackageSha256);
        expect(git(["status", "--porcelain", "--untracked-files=all"])).toBe("");
    }, 30_000);
});
