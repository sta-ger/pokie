import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import childProcess, {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
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
        const receipt = fs.readFileSync(prepared.receipt);
        const complete = path.join(path.dirname(prepared.archive), "complete.json");
        const marker = fs.readFileSync(complete);
        fs.writeFileSync(prepared.archive, "corrupt archive");
        expect(() => preparePackedTestCandidate(root)).toThrow("Corrupt prepared test package");
        fs.writeFileSync(prepared.archive, archive);
        fs.writeFileSync(prepared.receipt, "{}");
        expect(() => preparePackedTestCandidate(root)).toThrow("Corrupt prepared test package");
        fs.writeFileSync(prepared.receipt, receipt);
        for (const file of [prepared.archive, prepared.receipt]) {
            const bytes = fs.readFileSync(file);
            fs.unlinkSync(file);
            expect(() => preparePackedTestCandidate(root)).toThrow(/ENOENT/);
            expect(fs.readFileSync(complete)).toEqual(marker);
            expect(fs.existsSync(file)).toBe(false);
            fs.writeFileSync(file, bytes);
        }
        // Matching edited copies cannot override the actual candidate or the
        // required independent-build/authentication fields.
        const proof = JSON.parse(receipt.toString());
        for (const changed of [
            {...proof, candidateId: "a".repeat(40)},
            {...proof, verifiedBuild: undefined},
            {...proof, authentication: {...proof.authentication, verifierExecutableSha256: "0".repeat(64)}},
        ]) {
            const bytes = JSON.stringify(changed);
            fs.writeFileSync(prepared.receipt, bytes);
            fs.writeFileSync(complete, JSON.stringify({...JSON.parse(marker.toString()), candidateId: changed.candidateId,
                receiptSha256: createHash("sha256").update(bytes).digest("hex")}));
            expect(() => preparePackedTestCandidate(root)).toThrow("Corrupt prepared test package");
            expect(fs.readFileSync(prepared.receipt, "utf8")).toBe(bytes);
        }
        fs.writeFileSync(prepared.receipt, receipt);
        fs.writeFileSync(complete, marker);
        expect(preparePackedTestCandidate(root)).toEqual(prepared);
        expect(fs.readFileSync(path.join(root, "node_modules/package-calls"), "utf8")).toBe("prepare\n");
        write("src/index.ts", "dirty");
        expect(() => preparePackedTestCandidate(root)).toThrow("must be clean");
        git(["add", "."]);
        git(["commit", "-qm", "new candidate"]);
        expect(preparePackedTestCandidate(root).candidateId).not.toBe(prepared.candidateId);
        expect(fs.readFileSync(path.join(root, "node_modules/package-calls"), "utf8")).toBe("prepare\nprepare\n");
    });

    function tinyPackage(): string {
        write(".gitignore", "node_modules/\ndist/\n");
        write("package.json", JSON.stringify({name: "preparation-probe", version: "0.0.1", files: ["dist"],
            scripts: {build: "node build.cjs"}}));
        write("build.cjs", `
            const fs=require('fs'),path=require('path');
            const independent=path.basename(process.cwd()).startsWith('.p8-05-candidate-build-');
            fs.appendFileSync('node_modules/package-builds',independent?'independent\\n':'canonical\\n');
            if(independent && fs.existsSync('node_modules/reject-verifier')) throw new Error('fixture verifier build failure');
            fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.js','exports.answer=42;');
        `);
        for (const name of ["prepare-test-package.mjs", "p8-05-candidate-package-verifier.mjs"]) {
            const preload = name === "prepare-test-package.mjs" ? 'import "../node_modules/preparation-probe.cjs";\n' : "";
            write(`scripts/${name}`, preload + fs.readFileSync(path.resolve(__dirname, "../../scripts", name), "utf8"));
        }
        write("node_modules/preparation-probe.cjs", "// Native boundary probe, replaced only by interruption cases.\n");
        const git = (args: string[]): string => execFileSync("git", args, {cwd: root, encoding: "utf8"}).trim();
        git(["init", "-q"]);
        git(["config", "user.email", "test@local"]);
        git(["config", "user.name", "test"]);
        git(["add", "."]);
        git(["commit", "-qm", "tiny package"]);
        return git(["rev-parse", "HEAD"]);
    }

    function incompleteDirectory(): string {
        const parent = path.join(root, "node_modules/.cache/pokie-test-packages");
        const names = fs.readdirSync(parent);
        expect(names).toHaveLength(1);
        return path.join(parent, names[0]);
    }

    function attempts(output: string): string[] {
        return fs.readdirSync(output).filter(name => name.startsWith("attempt-")).map(name => path.join(output, name));
    }

    function failure(output: string): {candidateId: string; stage: string; message: string; code?: string; stdout?: string; stderr?: string} {
        const entries = attempts(output);
        expect(entries).toHaveLength(1);
        return JSON.parse(fs.readFileSync(path.join(entries[0], "failure.json"), "utf8"));
    }

    function expectVerifiedReuse(candidateId: string, output: string): void {
        const privateFile = path.join(output, "consumer/state.json");
        fs.mkdirSync(path.dirname(privateFile), {recursive: true});
        fs.writeFileSync(privateFile, "private consumer state");
        const failedAttempt = attempts(output)[0];
        const failedBytes = fs.readFileSync(path.join(failedAttempt, "failure.json"));
        const prepared = preparePackedTestCandidate(root);
        expect(attempts(output)).toHaveLength(2);
        expect(fs.readFileSync(path.join(failedAttempt, "failure.json"))).toEqual(failedBytes);
        expect(path.dirname(prepared.archive)).toBe(output);
        const proof = JSON.parse(fs.readFileSync(prepared.receipt, "utf8"));
        expect(proof.candidateId).toBe(candidateId);
        expect(proof.verifiedBuild.environment.NODE_ENV).toBe("production");
        expect(proof.verifiedBuild.executableFiles).toBe(1);
        expect(proof.authentication.scheme).toBe("verifier-owned-candidate-tree");
        expect(JSON.parse(fs.readFileSync(path.join(output, "complete.json"), "utf8")).archiveSha256).toBe(proof.candidatePackageSha256);
        const files = [prepared.archive, prepared.receipt, path.join(output, "complete.json")];
        const bytes = files.map(file => fs.readFileSync(file));
        const builds = fs.readFileSync(path.join(root, "node_modules/package-builds"), "utf8");
        expect(preparePackedTestCandidate(root)).toEqual(prepared);
        // Even the direct script must refuse a published directory.
        expect(() => execFileSync(process.execPath, [path.join(root, "scripts/prepare-test-package.mjs"), root, output, candidateId],
            {stdio: "pipe", timeout: 20_000})).toThrow(/requires an incomplete cache/);
        expect(files.map(file => fs.readFileSync(file))).toEqual(bytes);
        expect(fs.readFileSync(path.join(root, "node_modules/package-builds"), "utf8")).toBe(builds);
        expect(fs.readFileSync(privateFile, "utf8")).toBe("private consumer state");
        expect(fs.existsSync(path.join(output, "complete.tmp"))).toBe(false);
        expect(fs.existsSync(path.join(root, "node_modules/.cache/pokie-test-build-locks/verified-test-package.lock"))).toBe(false);
        expect(execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {cwd: root, encoding: "utf8"})).toBe("");
    }

    it("retries the same tiny candidate after source creation and a real independent verifier failure", () => {
        const candidateId = tinyPackage();
        write("node_modules/reject-verifier", "fail this attempt");
        expect(() => preparePackedTestCandidate(root)).toThrow(/exit 1/);
        const output = incompleteDirectory();
        expect(fs.readdirSync(path.join(attempts(output)[0], "source"))).toEqual(["preparation-probe-0.0.1.tgz"]);
        expect(failure(output)).toMatchObject({candidateId, stage: "independent-verification",
            stderr: expect.stringContaining("fixture verifier build failure")});
        expect(fs.existsSync(path.join(output, "complete.json"))).toBe(false);
        expect(fs.existsSync(path.join(output, "candidate-package.tgz"))).toBe(false);
        fs.unlinkSync(path.join(root, "node_modules/reject-verifier"));
        expectVerifiedReuse(candidateId, output);
        expect(fs.readFileSync(path.join(root, "node_modules/package-builds"), "utf8")).toBe("canonical\nindependent\ncanonical\nindependent\n");
    }, 30_000);

    it("retries interrupted publication with exclusive archive, receipt and temporary marker already present", () => {
        const candidateId = tinyPackage();
        // Inject only the final rename failure in the child. All build, pack,
        // verification and exclusive publication writes execute unchanged.
        write("node_modules/preparation-probe.cjs", `
            const fs=require('node:fs/promises'),path=require('node:path');
            const flag=path.join(__dirname,'interrupt-publication');
            const rename=fs.rename;
            fs.rename=async(from,to)=>{
                if(require('node:fs').existsSync(flag) && path.basename(from)==='complete.tmp' && path.basename(to)==='complete.json') throw new Error('interrupted publication');
                return rename(from,to);
            };
            require('node:module').syncBuiltinESMExports();
        `);
        write("node_modules/interrupt-publication", "fail this publication");
        expect(() => preparePackedTestCandidate(root)).toThrow(/exit 1/);
        const output = incompleteDirectory();
        for (const name of ["source", "complete.tmp"]) expect(fs.existsSync(path.join(attempts(output)[0], name))).toBe(true);
        for (const name of ["candidate-package.tgz", "candidate-executable-receipt.json"]) expect(fs.existsSync(path.join(output, name))).toBe(true);
        expect(failure(output)).toMatchObject({candidateId, stage: "publication", message: "interrupted publication"});
        expect(fs.existsSync(path.join(output, "complete.json"))).toBe(false);
        fs.unlinkSync(path.join(root, "node_modules/interrupt-publication"));
        expectVerifiedReuse(candidateId, output);
        expect(fs.readFileSync(path.join(root, "node_modules/package-builds"), "utf8")).toBe("canonical\nindependent\ncanonical\nindependent\n");
    }, 30_000);

    it("retries after source creation without reusing stale staging or removing private state", () => {
        const candidateId = tinyPackage();
        write("node_modules/preparation-probe.cjs", `
            const fs=require('node:fs/promises'),path=require('node:path');
            const mkdir=fs.mkdir,flag=path.join(__dirname,'interrupt-source');
            fs.mkdir=async(target,...args)=>{
                const value=await mkdir(target,...args);
                if(require('node:fs').existsSync(flag) && path.basename(target)==='source') throw new Error('interrupted source creation');
                return value;
            };
            require('node:module').syncBuiltinESMExports();
        `);
        write("node_modules/interrupt-source", "stop after mkdir");
        expect(() => preparePackedTestCandidate(root)).toThrow(/exit 1/);
        const output = incompleteDirectory();
        expect(failure(output)).toMatchObject({candidateId, stage: "source-creation", message: "interrupted source creation"});
        expect(fs.readdirSync(path.join(attempts(output)[0], "source"))).toEqual([]);
        expect(fs.existsSync(path.join(output, "complete.json"))).toBe(false);
        // Also exercise recovery of the previous in-place preparation layout.
        for (const name of ["source/stale.tgz", "candidate-package.tgz", "candidate-executable-receipt.json", "complete.tmp"]) {
            write(path.relative(root, path.join(output, name)), "incomplete legacy bytes");
        }
        fs.unlinkSync(path.join(root, "node_modules/interrupt-source"));
        expectVerifiedReuse(candidateId, output);
        expect(fs.existsSync(path.join(output, "source"))).toBe(false);
        expect(fs.readFileSync(path.join(root, "node_modules/package-builds"), "utf8")).toBe("canonical\ncanonical\nindependent\n");
    }, 30_000);

    it("retains native build timeout diagnostics and budgets the public preparation through verification and reuse", () => {
        const candidateId = tinyPackage();
        write("node_modules/preparation-probe.cjs", `
            const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
            const exec=cp.execFileSync;
            cp.execFileSync=(file,args,options)=>{
                if(args[1]==='run' && args[2]==='build') {
                    fs.appendFileSync(path.join(__dirname,'build-budgets'),String(options.timeout)+'\\n');
                    if(fs.existsSync(path.join(__dirname,'interrupt-build'))) {
                        // Reproduce the retained native ETIMEDOUT/output contract
                        // in milliseconds, without running a real five-minute build.
                        return exec(process.execPath,['-e',"process.stdout.write('cold build reached Studio compiler\\\\n');process.stderr.write('bounded timeout probe\\\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10000)"],
                            {...options,timeout:500,killSignal:'SIGKILL'});
                    }
                }
                return exec(file,args,options);
            };
            require('node:module').syncBuiltinESMExports();
        `);
        write("node_modules/interrupt-build", "stop canonical build");
        const spawn = jest.spyOn(childProcess, "spawnSync");
        try {
            expect(() => preparePackedTestCandidate(root)).toThrow(/exit 1/);
            const output = incompleteDirectory();
            expect(failure(output)).toMatchObject({candidateId, stage: "canonical-build", code: "ETIMEDOUT",
                stdout: expect.stringContaining("cold build reached Studio compiler"),
                stderr: expect.stringContaining("bounded timeout probe")});
            expect(fs.existsSync(path.join(output, "complete.json"))).toBe(false);
            expect(fs.existsSync(path.join(root, "node_modules/.cache/pokie-test-build-locks/verified-test-package.lock"))).toBe(false);
            fs.unlinkSync(path.join(root, "node_modules/interrupt-build"));
            expectVerifiedReuse(candidateId, output);
            const budgets = fs.readFileSync(path.join(root, "node_modules/build-budgets"), "utf8").trim().split("\n").map(Number);
            expect(budgets).toEqual([600_000, 600_000]);
            const preparationCalls = spawn.mock.calls.filter(call => call[1]?.some(arg => String(arg).endsWith("/scripts/prepare-test-package.mjs")));
            expect(preparationCalls).toHaveLength(2);
            for (const call of preparationCalls) expect(call[2]?.timeout).toBeGreaterThan(600_000 + 30_000 + 300_000);
            expect(fs.readFileSync(path.join(root, "node_modules/package-builds"), "utf8")).toBe("canonical\nindependent\n");
        } finally {
            spawn.mockRestore();
        }
    }, 30_000);
});
