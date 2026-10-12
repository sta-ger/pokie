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
const rejected = async (work, expected) => {
    try { await work(); assert.fail("expected the bounded operation to fail"); }
    catch (error) { assert.match(String(error), expected); return error; }
};

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

test("fails closed on lifecycle chronology and preserves an append-only completion issued after its receipt", async () => {
    const testFixture = await fixture();
    const writeLifecycle = async (receipt) => {
        const contents = `${JSON.stringify(receipt, null, 2)}\n`;
        await writeFile(testFixture.lifecycleReceiptPath, contents);
        testFixture.config.lifecycleReceiptSha256 = hash(contents);
    };
    try {
        const gateRun = await validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:retainedGate});
        const reversedChronologies = [
            (receipt) => { receipt.git.pushedAt = "2026-09-07T20:01:31.000Z"; },
            (receipt) => { receipt.publication.publishedAt = "2026-09-07T20:01:41.000Z"; },
            (receipt) => { receipt.drive.readBackAt = "2026-09-07T20:01:39.000Z"; },
            (receipt) => { receipt.issuedAt = "2026-09-07T20:01:45.000Z"; },
            (receipt) => { receipt.git.pushedAt = receipt.publication.publishedAt; },
            (receipt) => { receipt.publication.publishedAt = receipt.drive.uploadedAt; },
            (receipt) => { receipt.drive.readBackAt = receipt.drive.uploadedAt; },
            (receipt) => { receipt.issuedAt = receipt.drive.readBackAt; },
        ];
        for (const reverseChronology of reversedChronologies) {
            const receipt = lifecycle(gateRun.gate.sha256);
            reverseChronology(receipt);
            await writeLifecycle(receipt);
            await assert.rejects(() => validatePc20ReleaseCompletion(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state}), /receipt chronology/i);
        }
        const receipt = lifecycle(gateRun.gate.sha256);
        await writeLifecycle(receipt);
        const completion = {schemaVersion:PC20_SCHEMA_VERSION, kind:"campaign-completion", campaign:"phase7-product-coherence", stepId:"PC-20", completedAt:"2026-09-07T20:01:59.000Z", candidateId, candidatePackageSha256:packageSha, pc19:{frozenFindingsSha256:"c".repeat(64), freezeReceiptSha256:"d".repeat(64), coverageIds:acceptedPc19().coverageIds}, releaseGateSha256:gateRun.gate.sha256, lifecycleReceiptSha256:testFixture.config.lifecycleReceiptSha256};
        await writeFile(paths()[2], `${JSON.stringify(completion, null, 2)}\n`, {flag:"wx"});
        await assert.rejects(() => validatePc20ReleaseCompletion(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state}), /completion record must follow lifecycle receipt issuance/i);
        await rm(paths()[2]);
        completion.completedAt = "2026-09-07T20:02:01.000Z";
        const appendOnlyContents = `${JSON.stringify(completion, null, 2)}\n`;
        await writeFile(paths()[2], appendOnlyContents, {flag:"wx"});
        const reused = await validatePc20ReleaseCompletion(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state});
        assert.equal(reused.reused, true);
        assert.equal(await readFile(paths()[2], "utf8"), appendOnlyContents);
    } finally { await testFixture.cleanup(); }
});

test("drains a real detached process tree on success, timeout, cancellation, and spawn error", async () => {
    const registries = [];
    const options = () => { const resourceRegistryPath = registryPath("bounded"); registries.push(resourceRegistryPath); return {cwd:repositoryDirectory, resourceRegistryPath}; };
    try {
        const success = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('ok')"], {...options(), timeoutMs:1_000});
        assert.equal(success.processGroupDrained, true);
        assert.equal(success.terminalCondition, "success");
        const timeout = await rejected(() => runBoundedProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {...options(), timeoutMs:50}), /timed out/i);
        assert.equal(timeout.pc20Result.terminalCondition, "timeout");
        assert.equal(timeout.pc20Result.processTreeDrained, true);
        const controller = new AbortController(); controller.abort();
        const cancelled = await rejected(() => runBoundedProcess(process.execPath, ["-e", "0"], {...options(), signal:controller.signal}), /cancelled/i);
        assert.equal(cancelled.pc20Result.terminalCondition, "cancelled");
        assert.equal(cancelled.pc20Result.resourcesDrained, true);
        const spawnFailure = await rejected(() => runBoundedProcess("definitely-not-a-command-pc20", [], options()), /ownership registry|ENOENT|spawn/i);
        assert.equal(spawnFailure.pc20Result.terminalCondition, "spawn-failure");
        assert.equal(spawnFailure.pc20Result.resourcesDrained, true);
        const signalled = await rejected(() => runBoundedProcess(process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"], options()), /terminated by SIGTERM/i);
        assert.equal(signalled.pc20Result.terminalCondition, "signal-exit");
        assert.equal(signalled.pc20Result.signal, "SIGTERM");
        assert.equal(signalled.pc20Result.resourcesDrained, true);
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
        assert.deepEqual({...result.ownedResources[0], processIdentity:undefined}, {schemaVersion:1, operationId:result.operationId, action:"acquired", kind:"process", resourceId:`process:${detachedPid}:${process.execPath}`, pid:detachedPid, released:false, processIdentity:undefined});
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

test("keeps concurrent signed ownership appends readable through final drainage", async () => {
    const ownedRegistryPath = registryPath("concurrent-owned-resources");
    const moduleUrl = pathToFileURL(path.join(repositoryDirectory, "scripts", "pc-20-release-completion.mjs")).href;
    try {
        const result = await runBoundedProcess(process.execPath, ["-e", `
            const {spawn} = require("node:child_process");
            const worker = ${JSON.stringify(`import(${JSON.stringify(moduleUrl)}).then(({registerPc20OwnedResource}) => { const resource = {kind:"provider", resourceId:\`concurrent-\${process.argv[1]}\`, pid:process.pid}; registerPc20OwnedResource(resource); registerPc20OwnedResource(resource, "released"); });`)};
            Promise.all(Array.from({length:24}, (_, index) => new Promise((resolve, reject) => {
                const child = spawn(process.execPath, ["-e", worker, String(index)], {stdio:"ignore"});
                child.once("error", reject).once("exit", (code) => code === 0 ? resolve() : reject(new Error(\`worker exited \${code}\`)));
            }))).then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
        `], {cwd:repositoryDirectory, timeoutMs:5_000, resourceRegistryPath:ownedRegistryPath});
        assert.equal(result.processTreeDrained, true);
        assert.equal(result.resourcesDrained, true);
        assert.ok(result.ownedResources.filter((resource) => resource.kind === "provider").every((resource) => resource.released === true));
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

test("rejects a signed receipt from another operation namespace", async () => {
    const ownedRegistryPath = registryPath("foreign-operation");
    try {
        const error = await rejected(() => runBoundedProcess(process.execPath, ["-e", `
            const {appendFileSync} = require("node:fs");
            const {createHash} = require("node:crypto");
            const record = {schemaVersion:1, operationId:"0".repeat(32), action:"acquired", kind:"provider", resourceId:"foreign-operation"};
            record.signature = createHash("sha256").update(process.env.POKIE_PC20_RESOURCE_REGISTRY_SECRET).update("\\0").update(JSON.stringify(record)).digest("hex");
            appendFileSync(process.env.POKIE_PC20_RESOURCE_REGISTRY, JSON.stringify(record) + "\\n");
        `], {cwd:repositoryDirectory, resourceRegistryPath:ownedRegistryPath}), /different operation namespace/i);
        assert.equal(error.pc20Result.terminalCondition, "success");
        assert.equal(error.pc20Result.processTreeDrained, true);
    } finally { await rm(ownedRegistryPath, {force:true}); }
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

test("refuses publication before any command, network, gate, or receipt write even with credentials", async () => {
    const calls = [];
    const forbidden = (...args) => { calls.push(args); assert.fail("disabled publisher performed an operation"); };
    const dependencies = {
        environment:{NODE_AUTH_TOKEN:"apparent-token", PC20_DRIVE_ACCESS_TOKEN:"apparent-token"},
        run:forbidden, fetch:forbidden, writeFile:forbidden, readFile:forbidden,
        validateGate:forbidden, assertCandidateCheckout:forbidden, assertDevelopClean:forbidden,
    };
    for (const candidate of [candidateId, "0".repeat(40)]) {
        await assert.rejects(() => runAuthorizedPc20Lifecycle({candidateId, lifecycleReceiptSha256:"a".repeat(64)}, candidate, dependencies), /public publication is disabled/i);
    }
    assert.deepEqual(calls, []);
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

test("the publication workflow is inert and has no dispatch, secrets, or publishing route", async () => {
    const workflow = await readFile(path.join(repositoryDirectory, ".github", "workflows", "publish.yml"), "utf8");
    assert.match(workflow, /if: \$\{\{ false \}\}/);
    assert.match(workflow, /permissions: \{\}/);
    assert.doesNotMatch(workflow, /workflow_dispatch|NPM_TOKEN|NODE_AUTH_TOKEN|contents: write|npm publish|authorized-release-runner/);
});
