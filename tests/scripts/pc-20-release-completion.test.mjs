import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "@jest/globals";
import {PC20_EVIDENCE_DIRECTORY, PC20_SCHEMA_VERSION, drainProcessTree, runBoundedProcess, validatePc20ReleaseCompletion, validatePc20ReleaseGate} from "../../scripts/pc-20-release-completion.mjs";
import {runAuthorizedPc20Lifecycle} from "../../scripts/pc-20-authorized-release-runner.mjs";

const repositoryDirectory = path.resolve(".");
const candidateId = execFileSync("git", ["rev-parse", "HEAD"], {cwd:repositoryDirectory, encoding:"utf8"}).trim();
const packageIdentity = JSON.parse(await readFile(path.join(repositoryDirectory, "package.json"), "utf8"));
const archive = Buffer.from("PC-20 test archive\n");
const packageSha = createHash("sha256").update(archive).digest("hex");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const registryPath = (label) => path.join("/tmp", `pokie-pc20-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ndjson`);

function paths() {
    const stem = `pc-20-${candidateId}`;
    return ["release-gate.json", "release-gate.failed.json", "completion.json", "npm-pack-smoke.json", "package.tgz", "release-gate.stdout.txt", "release-gate.stderr.txt"].map((suffix) => path.join(PC20_EVIDENCE_DIRECTORY, `${stem}-${suffix}`));
}

async function fixture() {
    const lifecycleReceiptPath = path.join("/tmp", `pokie-pc20-lifecycle-${process.pid}-${Date.now()}.json`);
    const freezeReceiptPath = path.join("/tmp", `pokie-pc20-freeze-${process.pid}-${Date.now()}.json`);
    const freezeContents = "trusted freeze receipt\n";
    await writeFile(freezeReceiptPath, freezeContents);
    return {config:{candidateId, candidatePackageSha256:packageSha, reviewDirectory:"/tmp/pc19-review", freezeReceiptPath, freezeReceiptSha256:hash(freezeContents), lifecycleReceiptPath, lifecycleReceiptSha256:"0".repeat(64), outputDirectory:PC20_EVIDENCE_DIRECTORY, repositoryDirectory, packageName:packageIdentity.name, packageVersion:packageIdentity.version}, lifecycleReceiptPath, cleanup:async () => { await Promise.all([...paths().map((file) => rm(file, {force:true})), rm(freezeReceiptPath, {force:true}), rm(lifecycleReceiptPath, {force:true})]); }};
}

const acceptedPc19 = () => ({candidateId, frozenFindingsSha256:"c".repeat(64), freezeReceiptSha256:"d".repeat(64), coverageIds:["blind-cli-exploration", "blind-studio-exploration", "player-examples-parity", "role-math-par"]});
const state = () => ({head:candidateId, branch:"develop", dirty:false});

async function retainedGate(_directory, options) {
    await writeFile(options.paths.archive, archive, {flag:"wx"});
    const receipt = {schemaVersion:PC20_SCHEMA_VERSION, kind:"npm-pack-install-smoke", complete:true, suitePassed:true, candidateId, candidatePackageSha256:packageSha, packageName:packageIdentity.name, packageVersion:packageIdentity.version, archivePath:options.paths.archive, archiveSha256:packageSha, archiveSizeBytes:archive.length, installed:{cli:true, studioApi:true, studioAssets:true, libraryWorker:true, processesDrained:true}, cleanup:{temporaryInstallRemoved:true, temporaryPackDirectoryRemoved:true, processesDrained:true}};
    await writeFile(options.paths.smoke, `${JSON.stringify(receipt, null, 2)}\n`, {flag:"wx"});
    return {command:"npm run check:release", startedAt:"2026-09-07T20:00:00.000Z", endedAt:"2026-09-07T20:01:00.000Z", exitCode:0, timedOut:false, cancelled:false, processGroupDrained:true, processTreeDrained:true, resourcesDrained:true, ownedProcessIdentities:[], ownedResources:[], stdout:"real candidate gate output\n", stderr:""};
}

function lifecycle(gateSha256) {
    return {schemaVersion:PC20_SCHEMA_VERSION, receiptId:"release-1", issuedAt:"2026-09-07T20:02:00.000Z", candidateId, candidatePackageSha256:packageSha, releaseSha:candidateId, git:{mergedToDevelop:true, cleanDevelop:true, developSha:candidateId, pushedSha:candidateId, remoteDevelopSha:candidateId, remote:"origin", pushedAt:"2026-09-07T20:01:20.000Z"}, publication:{published:true, packageName:packageIdentity.name, packageVersion:packageIdentity.version, packageSha256:packageSha, registryArchiveSha256:packageSha, publishedSha:candidateId, registryIdentity:"https://registry.example/pokie.tgz", publishedAt:"2026-09-07T20:01:30.000Z"}, drive:{uploaded:true, readBack:true, releaseGateSha256:gateSha256, readBackSha256:gateSha256, uploadId:"drive-file-1", uploadedAt:"2026-09-07T20:01:40.000Z", readBackAt:"2026-09-07T20:01:50.000Z"}};
}

test("retains the canonical candidate archive/install receipt and reuses its immutable green gate", async () => {
    const testFixture = await fixture();
    try {
        const gateRun = await validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:retainedGate});
        assert.equal(gateRun.gate.reused, false);
        assert.equal(gateRun.gate.gate.archiveSha256, packageSha);
        assert.equal(existsSync(paths()[4]), true);
        const receipt = lifecycle(gateRun.gate.sha256);
        const contents = `${JSON.stringify(receipt, null, 2)}\n`;
        await writeFile(testFixture.lifecycleReceiptPath, contents);
        testFixture.config.lifecycleReceiptSha256 = hash(contents);
        const completed = await validatePc20ReleaseCompletion(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:async () => { throw new Error("immutable gate was not reused"); }});
        assert.equal(completed.candidateId, candidateId);
        assert.equal((await validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:async () => { throw new Error("gate rerun"); }})).gate.reused, true);
    } finally { await testFixture.cleanup(); }
});

test("rejects alternate evidence locations, package identity drift, and altered smoke/lifecycle bindings", async () => {
    const testFixture = await fixture();
    try {
        await assert.rejects(() => validatePc20ReleaseGate({...testFixture.config, outputDirectory:"/tmp/not-pc20"}, {validatePc19:acceptedPc19, readRepositoryState:state}), /canonical PC-20 evidence/i);
        await assert.rejects(() => validatePc20ReleaseGate({...testFixture.config, packageVersion:"0.0.0"}, {validatePc19:acceptedPc19, readRepositoryState:state}), /package name\/version/i);
        await validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:retainedGate});
        const incompleteReceipt = JSON.parse(await readFile(paths()[3], "utf8"));
        incompleteReceipt.suitePassed = false;
        await writeFile(paths()[3], `${JSON.stringify(incompleteReceipt)}\n`);
        await assert.rejects(() => validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state}), /smoke receipt is incomplete/i);
        await writeFile(paths()[3], `${JSON.stringify({...incompleteReceipt, suitePassed:true})}\n`);
        await writeFile(paths()[4], "tampered archive\n");
        await assert.rejects(() => validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state}), /archive digest/i);
    } finally { await testFixture.cleanup(); }
});

test("rejects retained gate output tampering and an incomplete pre-existing completion record", async () => {
    const testFixture = await fixture();
    try {
        const gateRun = await validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:retainedGate});
        await writeFile(paths()[5], "tampered release output\n");
        await assert.rejects(() => validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state}), /stdout artifact digest/i);
        await writeFile(paths()[5], "real candidate gate output\n");
        const receipt = lifecycle(gateRun.gate.sha256);
        const contents = `${JSON.stringify(receipt, null, 2)}\n`;
        await writeFile(testFixture.lifecycleReceiptPath, contents);
        testFixture.config.lifecycleReceiptSha256 = hash(contents);
        await writeFile(paths()[2], `${JSON.stringify({candidateId, releaseGateSha256:gateRun.gate.sha256, lifecycleReceiptSha256:testFixture.config.lifecycleReceiptSha256})}\n`);
        await assert.rejects(() => validatePc20ReleaseCompletion(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state}), /existing completion record/i);
    } finally { await testFixture.cleanup(); }
});

test("drains a real detached process tree on success, timeout, cancellation, and spawn error", async () => {
    const registries = [];
    const options = () => { const resourceRegistryPath = registryPath("bounded"); registries.push(resourceRegistryPath); return {cwd:repositoryDirectory, resourceRegistryPath}; };
    try {
        const success = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('ok')"], {...options(), timeoutMs:1_000});
        assert.equal(success.processGroupDrained, true);
        await assert.rejects(() => runBoundedProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {...options(), timeoutMs:50}), /timed out/i);
        const controller = new AbortController(); controller.abort();
        await assert.rejects(() => runBoundedProcess(process.execPath, ["-e", "0"], {...options(), signal:controller.signal}), /cancelled/i);
        await assert.rejects(() => runBoundedProcess("definitely-not-a-command-pc20", [], options()), /ownership registry|ENOENT|spawn/i);
    } finally { await Promise.all(registries.map((target) => rm(target, {force:true}))); }
});

test("the production ownership preload drains a detached/reparented process and audits non-PID handles", async () => {
    const pidPath = path.join("/tmp", `pokie-pc20-detached-${process.pid}-${Date.now()}`);
    const ownedRegistryPath = path.join("/tmp", `pokie-pc20-resources-${process.pid}-${Date.now()}`);
    try {
        const result = await runBoundedProcess(process.execPath, ["-e", `
        const {spawn} = require("node:child_process");
        const {writeFileSync} = require("node:fs");
        const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {detached:true, stdio:"ignore"});
        writeFileSync(process.argv[1], String(child.pid));
        process.exit(0);
    `, pidPath], {cwd:repositoryDirectory, timeoutMs:1_000, resourceRegistryPath:ownedRegistryPath});
        const detachedPid = Number(await readFile(pidPath, "utf8"));
        assert.equal(result.resourcesDrained, true);
        assert.equal(result.ownedResources.length, 1);
        assert.match(result.ownedResources[0].processIdentity, /^linux-start-ticks:/);
        assert.deepEqual({...result.ownedResources[0], processIdentity:undefined}, {schemaVersion:1, action:"acquired", kind:"process", resourceId:`process:${detachedPid}:${process.execPath}`, pid:detachedPid, released:false, processIdentity:undefined});
        assert.throws(() => process.kill(detachedPid, 0), /ESRCH/);
    } finally { await Promise.all([rm(pidPath, {force:true}), rm(ownedRegistryPath, {force:true})]); }
    await assert.rejects(() => runBoundedProcess(process.execPath, ["-e", `
        import(${JSON.stringify(pathToFileURL(path.join(repositoryDirectory, "scripts", "pc-20-release-completion.mjs")).href)}).then(({registerPc20OwnedResource}) => {
            registerPc20OwnedResource({kind:"container", resourceId:"container-without-pid"});
        }).then(() => process.exit(0));
    `], {cwd:repositoryDirectory, resourceRegistryPath:ownedRegistryPath}), /owned resources could not be drained/i);
    const releasedRegistryPath = registryPath("released-non-pid");
    const released = await runBoundedProcess(process.execPath, ["-e", `
        import(${JSON.stringify(pathToFileURL(path.join(repositoryDirectory, "scripts", "pc-20-release-completion.mjs")).href)}).then(({registerPc20OwnedResource}) => {
            const resource = {kind:"provider", resourceId:"provider-without-pid"};
            registerPc20OwnedResource(resource);
            registerPc20OwnedResource(resource, "released");
        }).then(() => process.exit(0));
    `], {cwd:repositoryDirectory, resourceRegistryPath:releasedRegistryPath});
    assert.equal(released.resourcesDrained, true);
    await rm(releasedRegistryPath, {force:true});
});

test("the production ownership preload registers and drains detached ESM children and ESM Workers", async () => {
    const ownedRegistryPath = registryPath("esm-owned-resources");
    try {
        const result = await runBoundedProcess(process.execPath, ["--input-type=module", "-e", `
            import {spawn} from "node:child_process";
            import {Worker} from "node:worker_threads";
            const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {detached:true, stdio:"ignore"});
            const worker = new Worker("setTimeout(() => process.exit(0), 20)", {eval:true});
            await new Promise((resolve, reject) => worker.once("exit", resolve).once("error", reject));
            process.exit(0);
        `], {cwd:repositoryDirectory, timeoutMs:2_000, resourceRegistryPath:ownedRegistryPath});
        assert.equal(result.resourcesDrained, true);
        assert.ok(result.ownedResources.some((resource) => resource.kind === "process" && resource.released === false));
        assert.ok(result.ownedResources.some((resource) => resource.kind === "worker" && resource.released === true));
    } finally { await rm(ownedRegistryPath, {force:true}); }
});

test("fails closed before an immediate detached child can run when registry acquisition fails", async () => {
    const invalidRegistry = await mkdtemp(path.join(os.tmpdir(), "pokie-pc20-registry-directory-"));
    const pidPath = path.join(os.tmpdir(), `pokie-pc20-unregistered-${process.pid}-${Date.now()}`);
    try {
        await assert.rejects(() => runBoundedProcess(process.execPath, ["-e", `
            const {spawn} = require("node:child_process");
            require("node:fs").writeFileSync(process.argv[1], String(spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {detached:true, stdio:"ignore"}).pid));
        `, pidPath], {cwd:repositoryDirectory, resourceRegistryPath:invalidRegistry}), /ownership registry|unreadable/i);
        assert.equal(existsSync(pidPath), false);
    } finally { await Promise.all([rm(pidPath, {force:true}), rm(invalidRegistry, {recursive:true, force:true})]); }
});

test("fails closed before ESM named imports can hand out a child or Worker when registry acquisition fails", async () => {
    const invalidRegistry = await mkdtemp(path.join(os.tmpdir(), "pokie-pc20-esm-registry-directory-"));
    try {
        await assert.rejects(() => runBoundedProcess(process.execPath, ["--input-type=module", "-e", `
            import {spawn} from "node:child_process";
            spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {detached:true, stdio:"ignore"});
        `], {cwd:repositoryDirectory, resourceRegistryPath:invalidRegistry}), /ownership registry|unreadable/i);
        await assert.rejects(() => runBoundedProcess(process.execPath, ["--input-type=module", "-e", `
            import {Worker} from "node:worker_threads";
            new Worker("setInterval(() => {}, 1000)", {eval:true});
        `], {cwd:repositoryDirectory, resourceRegistryPath:invalidRegistry}), /ownership registry|unreadable/i);
    } finally { await rm(invalidRegistry, {recursive:true, force:true}); }
});

test("fails closed when the final ownership-registry signature audit is invalid", async () => {
    const invalidRegistry = registryPath("invalid-signature");
    try {
        await assert.rejects(() => runBoundedProcess(process.execPath, ["-e", `
            require("node:fs").appendFileSync(process.env.POKIE_PC20_RESOURCE_REGISTRY, "{\\\"schemaVersion\\\":1}\\n");
        `], {cwd:repositoryDirectory, resourceRegistryPath:invalidRegistry}), /invalid or unsigned record/i);
    } finally { await rm(invalidRegistry, {force:true}); }
});

test("never signals a PID whose acquisition identity has been reused", async () => {
    const result = await drainProcessTree({pid:process.pid}, 10, new Map([[process.pid, "linux-start-ticks:not-this-process"]]));
    assert.equal(result.processTreeDrained, true);
    assert.deepEqual(result.reusedProcessIds, [process.pid]);
    assert.doesNotThrow(() => process.kill(process.pid, 0));
});

test("requires an explicit release for provider and container resources even when they carry a PID", async () => {
    const script = (kind, release) => ["-e", `
        import(${JSON.stringify(pathToFileURL(path.join(repositoryDirectory, "scripts", "pc-20-release-completion.mjs")).href)}).then(({registerPc20OwnedResource}) => {
            const resource = {kind:${JSON.stringify(kind)}, resourceId:${JSON.stringify(`${kind}-with-pid`)}, pid:process.pid};
            registerPc20OwnedResource(resource);${release ? " registerPc20OwnedResource(resource, \"released\");" : ""}
        }).then(() => process.exit(0));
    `];
    const providerRegistry = registryPath("provider-pid"), containerRegistry = registryPath("container-pid"), releasedRegistry = registryPath("released-provider-pid");
    try {
        await assert.rejects(() => runBoundedProcess(process.execPath, script("provider", false), {cwd:repositoryDirectory, resourceRegistryPath:providerRegistry}), /owned resources could not be drained/i);
        await assert.rejects(() => runBoundedProcess(process.execPath, script("container", false), {cwd:repositoryDirectory, resourceRegistryPath:containerRegistry}), /owned resources could not be drained/i);
        const released = await runBoundedProcess(process.execPath, script("provider", true), {cwd:repositoryDirectory, resourceRegistryPath:releasedRegistry});
        assert.equal(released.resourcesDrained, true);
    } finally { await Promise.all([rm(providerRegistry, {force:true}), rm(containerRegistry, {force:true}), rm(releasedRegistry, {force:true})]); }
});

test("executes the authorized gate-to-fast-forward handoff before any push or publication", async () => {
    const testFixture = await fixture();
    const archivePath = paths()[4];
    const gatePath = paths()[0];
    const gateContents = "candidate-bound gate\n";
    const calls = [];
    let onDevelop = false;
    try {
        await writeFile(archivePath, archive, {flag:"wx"});
        await writeFile(gatePath, gateContents, {flag:"wx"});
        const request = async (url) => {
            if (url === "https://registry.example/pokie.tgz") return {arrayBuffer:async () => archive};
            if (url.includes("upload")) return {ok:true, json:async () => ({id:"drive-file-1"})};
            return {ok:true, arrayBuffer:async () => Buffer.from(gateContents)};
        };
        const command = (name, args) => {
            calls.push(`${name} ${args.join(" ")}`);
            if (name === "git" && args[0] === "checkout") { onDevelop = true; return ""; }
            if (name === "git" && args[0] === "merge") return "";
            if (name === "git" && args[0] === "rev-parse") return candidateId;
            if (name === "git" && args[0] === "remote") return "origin";
            if (name === "git" && args[0] === "ls-remote") return `${candidateId}\trefs/heads/develop`;
            if (name === "npm" && args[0] === "view") return JSON.stringify({tarball:"https://registry.example/pokie.tgz"});
            return "";
        };
        const receipt = await runAuthorizedPc20Lifecycle(testFixture.config, candidateId, {
            environment:{NODE_AUTH_TOKEN:"test", PC20_DRIVE_ACCESS_TOKEN:"test"}, run:command, validateGate:async () => { calls.push("gate validated"); },
            assertCandidateCheckout:() => { calls.push("candidate clean"); }, assertDevelopClean:() => { assert.equal(onDevelop, true); calls.push("develop clean"); },
            fetch:request, now:() => "2026-09-07T20:03:00.000Z",
        });
        assert.equal(receipt.git.developSha, candidateId);
        assert.ok(calls.indexOf("gate validated") < calls.indexOf(`git merge --ff-only ${candidateId}`));
        assert.ok(calls.indexOf(`git merge --ff-only ${candidateId}`) < calls.indexOf("git push origin develop"));
        assert.ok(calls.indexOf("git push origin develop") < calls.indexOf("git ls-remote --exit-code origin refs/heads/develop"));
        assert.ok(calls.indexOf("git push origin develop") < calls.indexOf(`npm publish ${archivePath} --access public`));
    } finally { await testFixture.cleanup(); }
});

test("authorized runner rejects candidate identity, gate receipt and post-merge develop drift", async () => {
    const testFixture = await fixture();
    const dependencies = {environment:{NODE_AUTH_TOKEN:"test", PC20_DRIVE_ACCESS_TOKEN:"test"}, run:() => candidateId, validateGate:async () => {}, assertCandidateCheckout:() => {}, assertDevelopClean:() => {}, exists:() => true, readFile:async () => archive, writeFile:async () => {}, fetch:async () => ({arrayBuffer:async () => archive})};
    try {
        await assert.rejects(() => runAuthorizedPc20Lifecycle(testFixture.config, "0".repeat(40), dependencies), /canonical authorized/i);
        await assert.rejects(() => runAuthorizedPc20Lifecycle(testFixture.config, candidateId, {...dependencies, validateGate:async () => { throw new Error("gate receipt rejected"); }}), /gate receipt rejected/i);
        let mergeSeen = false;
        const drift = {...dependencies, run:(name, args) => {
            if (name === "git" && args[0] === "merge") { mergeSeen = true; return ""; }
            if (name === "git" && args[0] === "remote") return "origin";
            if (name === "git" && args[0] === "rev-parse") return mergeSeen ? "f".repeat(40) : candidateId;
            return "";
        }};
        await assert.rejects(() => runAuthorizedPc20Lifecycle(testFixture.config, candidateId, drift), /develop did not resolve/i);
        const remoteDrift = {...dependencies, run:(name, args) => {
            if (name === "git" && args[0] === "remote") return "origin";
            if (name === "git" && args[0] === "rev-parse") return candidateId;
            if (name === "git" && args[0] === "ls-remote") return `${"f".repeat(40)}\trefs/heads/develop`;
            return "";
        }};
        await assert.rejects(() => runAuthorizedPc20Lifecycle(testFixture.config, candidateId, remoteDrift), /remote protected develop drifted/i);
    } finally { await testFixture.cleanup(); }
});

test("uses a controlled real Git remote handoff and refuses post-push protected-ref drift before npm", async () => {
    const testFixture = await fixture();
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "pokie-pc20-runner-"));
    const remote = path.join(sandbox, "origin.git"), work = path.join(sandbox, "work");
    const git = (args, cwd = work) => execFileSync("git", args, {cwd, encoding:"utf8"}).trim();
    try {
        git(["init", "--bare", remote], sandbox);
        git(["init", "-b", "develop", work], sandbox);
        git(["config", "user.name", "PC-20 test" ]);
        git(["config", "user.email", "pc20@example.invalid"]);
        await writeFile(path.join(work, "candidate.txt"), "base\n");
        git(["add", "candidate.txt"]); git(["commit", "-m", "base"]);
        const base = git(["rev-parse", "HEAD"]);
        git(["remote", "add", "origin", remote]); git(["push", "-u", "origin", "develop"]);
        await writeFile(path.join(work, "candidate.txt"), "candidate\n");
        git(["commit", "-am", "candidate"]);
        const candidate = git(["rev-parse", "HEAD"]);
        const config = {...testFixture.config, candidateId:candidate};
        let npmCalled = false;
        const command = (name, args) => {
            if (name === "git") {
                const output = git(args);
                if (args[0] === "push") git(["--git-dir", remote, "update-ref", "refs/heads/develop", base], sandbox);
                return output;
            }
            if (name === "npm") { npmCalled = true; return ""; }
            throw new Error(`unexpected command ${name}`);
        };
        await assert.rejects(() => runAuthorizedPc20Lifecycle(config, candidate, {
            environment:{NODE_AUTH_TOKEN:"test", PC20_DRIVE_ACCESS_TOKEN:"test"}, run:command,
            validateGate:async () => {}, assertCandidateCheckout:() => {}, assertDevelopClean:() => {},
        }), /remote protected develop drifted/i);
        assert.equal(git(["rev-parse", "refs/heads/develop"], remote), base);
        assert.equal(npmCalled, false);
    } finally { await testFixture.cleanup(); await rm(sandbox, {recursive:true, force:true}); }
});

test("executes the authorized runner CLI against a controlled Git remote and rejects its post-push drift", async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "pokie-pc20-runner-cli-"));
    const remote = path.join(sandbox, "origin.git"), work = path.join(sandbox, "work"), scripts = path.join(work, "scripts");
    const git = (args, cwd = work) => execFileSync("git", args, {cwd, encoding:"utf8"}).trim();
    try {
        await mkdir(scripts, {recursive:true});
        for (const script of ["pc-19-independent-cold-start-review.mjs", "pc-20-release-completion.mjs", "pc-20-authorized-release-runner.mjs"]) {
            await writeFile(path.join(scripts, script), await readFile(path.join(repositoryDirectory, "scripts", script)));
        }
        await writeFile(path.join(work, "package.json"), JSON.stringify({name:"pc20-runner-fixture", version:"1.0.0"}));
        git(["init", "--bare", remote], sandbox);
        git(["init", "-b", "develop", work], sandbox);
        git(["config", "user.name", "PC-20 test"]); git(["config", "user.email", "pc20@example.invalid"]);
        git(["add", "."]); git(["commit", "-m", "base"]);
        const base = git(["rev-parse", "HEAD"]);
        git(["remote", "add", "origin", remote]); git(["push", "-u", "origin", "develop"]);
        await writeFile(path.join(work, "candidate.txt"), "candidate\n");
        git(["add", "candidate.txt"]); git(["commit", "-m", "candidate"]);
        const candidate = git(["rev-parse", "HEAD"]);
        git(["checkout", "--detach", candidate]);
        const evidence = path.join(work, "docs", "evidence", "phase7-product-coherence", "pc-20-release-completion");
        await mkdir(evidence, {recursive:true});
        const archivePath = path.join(evidence, `pc-20-${candidate}-package.tgz`);
        const smokePath = path.join(evidence, `pc-20-${candidate}-npm-pack-smoke.json`);
        const gatePath = path.join(evidence, `pc-20-${candidate}-release-gate.json`);
        const stdoutPath = path.join(evidence, `pc-20-${candidate}-release-gate.stdout.txt`);
        const stderrPath = path.join(evidence, `pc-20-${candidate}-release-gate.stderr.txt`);
        const fixtureArchive = Buffer.from("authorized runner fixture archive\n");
        const fixtureSha = hash(fixtureArchive);
        await writeFile(archivePath, fixtureArchive);
        const smoke = {schemaVersion:1, kind:"npm-pack-install-smoke", candidateId:candidate, candidatePackageSha256:fixtureSha, packageName:"pc20-runner-fixture", packageVersion:"1.0.0", archivePath, archiveSha256:fixtureSha, archiveSizeBytes:fixtureArchive.length, complete:true, suitePassed:true, installed:{cli:true, studioApi:true, studioAssets:true, libraryWorker:true, processesDrained:true}, cleanup:{temporaryInstallRemoved:true, temporaryPackDirectoryRemoved:true, processesDrained:true}};
        const smokeContents = `${JSON.stringify(smoke)}\n`;
        await writeFile(smokePath, smokeContents);
        const stdout = "fixture release output\n", stderr = "(no stderr)\n";
        await Promise.all([writeFile(stdoutPath, stdout), writeFile(stderrPath, stderr)]);
        const gate = {schemaVersion:1, kind:"release-gate", candidateId:candidate, candidatePackageSha256:fixtureSha, command:"npm run check:release", exitCode:0, timedOut:false, cancelled:false, processGroupDrained:true, processTreeDrained:true, resourcesDrained:true, ownedProcessIdentities:[], ownedResources:[], startedAt:"2026-09-07T20:00:00.000Z", endedAt:"2026-09-07T20:01:00.000Z", stdoutPath:path.basename(stdoutPath), stdoutSha256:hash(stdout), stderrPath:path.basename(stderrPath), stderrSha256:hash(stderr), packagingSmokePath:path.basename(smokePath), packagingSmokeSha256:hash(smokeContents), archivePath:path.basename(archivePath), archiveSha256:fixtureSha};
        await writeFile(gatePath, `${JSON.stringify(gate)}\n`);
        const freezePath = path.join(sandbox, "freeze.json"), lifecyclePath = path.join(sandbox, "lifecycle.json");
        await writeFile(freezePath, "fixture freeze\n");
        const configPath = path.join(sandbox, "config.json");
        await writeFile(configPath, `${JSON.stringify({candidateId:candidate, candidatePackageSha256:fixtureSha, reviewDirectory:path.join(sandbox, "review"), freezeReceiptPath:freezePath, freezeReceiptSha256:hash("fixture freeze\n"), lifecycleReceiptPath:lifecyclePath, lifecycleReceiptSha256:"0".repeat(64), outputDirectory:evidence, repositoryDirectory:work, packageName:"pc20-runner-fixture", packageVersion:"1.0.0"})}\n`);
        await writeFile(path.join(remote, "hooks", "post-receive"), `#!/bin/sh\ngit update-ref refs/heads/develop ${base}\n`, {mode:0o755});
        assert.throws(() => execFileSync(process.execPath, [path.join(scripts, "pc-20-authorized-release-runner.mjs"), "--config", configPath, "--candidate-ref", candidate], {cwd:work, env:{...process.env, NODE_AUTH_TOKEN:"test", PC20_DRIVE_ACCESS_TOKEN:"test"}, encoding:"utf8"}), /remote protected develop drifted/i);
        assert.equal(git(["rev-parse", "refs/heads/develop"], remote), base);
    } finally { await rm(sandbox, {recursive:true, force:true}); }
});

test("locks a failed candidate and removes partial smoke artifacts before another gate can run", async () => {
    const testFixture = await fixture();
    let runs = 0;
    const failedGate = async (_directory, options) => {
        runs++;
        await writeFile(options.paths.archive, archive, {flag:"wx"});
        await writeFile(options.paths.smoke, "partial receipt\n", {flag:"wx"});
        throw new Error("packaging smoke failed");
    };
    try {
        await assert.rejects(() => validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:failedGate}), /packaging smoke failed/i);
        assert.equal(existsSync(paths()[1]), true);
        assert.equal(existsSync(paths()[4]), false);
        assert.equal(existsSync(paths()[3]), false);
        await assert.rejects(() => validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:failedGate}), /permanently locked/i);
        assert.equal(runs, 1);
    } finally { await testFixture.cleanup(); }
});

test("the publication workflow is an authorized candidate-ref runner, not an ephemeral completion stub", async () => {
    const workflow = await readFile(path.join(repositoryDirectory, ".github", "workflows", "publish.yml"), "utf8");
    assert.match(workflow, /runs-on: \[self-hosted, pokie-release-runner\]/);
    assert.match(workflow, /candidate_ref/);
    assert.match(workflow, /ref: \$\{\{ inputs\.candidate_ref \}\}/);
    assert.doesNotMatch(workflow, /git checkout develop/);
    assert.match(workflow, /clean immutable candidate checkout before its gate/);
    assert.match(workflow, /contents: write/);
    assert.match(workflow, /NPM_TOKEN/);
    assert.match(workflow, /PC20_DRIVE_ACCESS_TOKEN/);
    assert.match(workflow, /concurrency:/);
    assert.match(workflow, /pc20-protected-develop-publication/);
    assert.match(workflow, /--gate-only/);
    assert.match(workflow, /pc-20-authorized-release-runner\.mjs/);
});
