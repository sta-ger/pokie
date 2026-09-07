import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import {readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {test} from "@jest/globals";
import {PC20_EVIDENCE_DIRECTORY, PC20_SCHEMA_VERSION, runBoundedProcess, validatePc20ReleaseCompletion, validatePc20ReleaseGate} from "../../scripts/pc-20-release-completion.mjs";

const repositoryDirectory = path.resolve(".");
const candidateId = execFileSync("git", ["rev-parse", "HEAD"], {cwd:repositoryDirectory, encoding:"utf8"}).trim();
const packageIdentity = JSON.parse(await readFile(path.join(repositoryDirectory, "package.json"), "utf8"));
const archive = Buffer.from("PC-20 test archive\n");
const packageSha = createHash("sha256").update(archive).digest("hex");
const hash = (value) => createHash("sha256").update(value).digest("hex");

function paths() {
    const stem = `pc-20-${candidateId}`;
    return ["release-gate.json", "completion.json", "npm-pack-smoke.json", "package.tgz", "release-gate.stdout.txt", "release-gate.stderr.txt"].map((suffix) => path.join(PC20_EVIDENCE_DIRECTORY, `${stem}-${suffix}`));
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
    const receipt = {schemaVersion:PC20_SCHEMA_VERSION, kind:"npm-pack-install-smoke", candidateId, candidatePackageSha256:packageSha, packageName:packageIdentity.name, packageVersion:packageIdentity.version, archivePath:options.paths.archive, archiveSha256:packageSha, archiveSizeBytes:archive.length, installed:{cli:true, studioApi:true, studioAssets:true, libraryWorker:true, processesDrained:true}};
    await writeFile(options.paths.smoke, `${JSON.stringify(receipt, null, 2)}\n`, {flag:"wx"});
    return {command:"npm run check:release", startedAt:"2026-09-07T20:00:00.000Z", endedAt:"2026-09-07T20:01:00.000Z", exitCode:0, timedOut:false, cancelled:false, processGroupDrained:true, stdout:"real candidate gate output\n", stderr:""};
}

function lifecycle(gateSha256) {
    return {schemaVersion:PC20_SCHEMA_VERSION, receiptId:"release-1", issuedAt:"2026-09-07T20:02:00.000Z", candidateId, candidatePackageSha256:packageSha, releaseSha:candidateId, git:{mergedToDevelop:true, cleanDevelop:true, developSha:candidateId, pushedSha:candidateId, remote:"origin", pushedAt:"2026-09-07T20:01:20.000Z"}, publication:{published:true, packageName:packageIdentity.name, packageVersion:packageIdentity.version, packageSha256:packageSha, registryArchiveSha256:packageSha, publishedSha:candidateId, registryIdentity:"https://registry.example/pokie.tgz", publishedAt:"2026-09-07T20:01:30.000Z"}, drive:{uploaded:true, readBack:true, releaseGateSha256:gateSha256, readBackSha256:gateSha256, uploadId:"drive-file-1", uploadedAt:"2026-09-07T20:01:40.000Z", readBackAt:"2026-09-07T20:01:50.000Z"}};
}

test("retains the canonical candidate archive/install receipt and reuses its immutable green gate", async () => {
    const testFixture = await fixture();
    try {
        const gateRun = await validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state, runReleaseGate:retainedGate});
        assert.equal(gateRun.gate.reused, false);
        assert.equal(gateRun.gate.gate.archiveSha256, packageSha);
        assert.equal(existsSync(paths()[3]), true);
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
        await writeFile(paths()[3], "tampered archive\n");
        await assert.rejects(() => validatePc20ReleaseGate(testFixture.config, {validatePc19:async () => acceptedPc19(), readRepositoryState:state}), /archive digest/i);
    } finally { await testFixture.cleanup(); }
});

test("drains a real detached process tree on success, timeout, cancellation, and spawn error", async () => {
    const success = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('ok')"], {cwd:repositoryDirectory, timeoutMs:1_000});
    assert.equal(success.processGroupDrained, true);
    await assert.rejects(() => runBoundedProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {cwd:repositoryDirectory, timeoutMs:50}), /timed out/i);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(() => runBoundedProcess(process.execPath, ["-e", "0"], {cwd:repositoryDirectory, signal:controller.signal}), /cancelled/i);
    await assert.rejects(() => runBoundedProcess("definitely-not-a-command-pc20", [], {cwd:repositoryDirectory}), /ENOENT|spawn/i);
});

test("the publication workflow is an authorized candidate-ref runner, not an ephemeral completion stub", async () => {
    const workflow = await readFile(path.join(repositoryDirectory, ".github", "workflows", "publish.yml"), "utf8");
    assert.match(workflow, /runs-on: \[self-hosted, pokie-release-runner\]/);
    assert.match(workflow, /candidate_ref/);
    assert.match(workflow, /ref: \$\{\{ inputs\.candidate_ref \}\}/);
    assert.match(workflow, /contents: write/);
    assert.match(workflow, /NPM_TOKEN/);
    assert.match(workflow, /PC20_DRIVE_ACCESS_TOKEN/);
    assert.match(workflow, /--gate-only/);
    assert.match(workflow, /pc-20-authorized-release-runner\.mjs/);
});
