import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {PC20_SCHEMA_VERSION, validatePc20ReleaseCompletion} from "../../scripts/pc-20-release-completion.mjs";

const candidateId = "a".repeat(40);
const packageSha = "b".repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const gateResult = {command:"npm run check:release", startedAt:"2026-09-07T20:00:00.000Z", endedAt:"2026-09-07T20:01:00.000Z", exitCode:0, timedOut:false, cancelled:false, processGroupDrained:true};

async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), "pokie-pc20-"));
    const reviewDirectory = path.join(root, "review"), outputDirectory = path.join(root, "pc20"), freezeReceiptPath = path.join(root, "freeze.json"), lifecycleReceiptPath = path.join(root, "lifecycle.json");
    const freezeContents = "trusted freeze receipt\n";
    await writeFile(freezeReceiptPath, freezeContents);
    const config = {candidateId, candidatePackageSha256:packageSha, reviewDirectory, freezeReceiptPath, freezeReceiptSha256:hash(freezeContents), lifecycleReceiptPath, lifecycleReceiptSha256:"0".repeat(64), outputDirectory, repositoryDirectory:root, packageName:"pokie", packageVersion:"1.3.0"};
    return {root, config, lifecycleReceiptPath, outputDirectory};
}

function lifecycleReceipt(gateSha256, mutate = (value) => value) {
    return mutate({schemaVersion:PC20_SCHEMA_VERSION, receiptId:"release-1", issuedAt:"2026-09-07T20:02:00.000Z", candidateId, candidatePackageSha256:packageSha, releaseSha:candidateId, git:{mergedToDevelop:true, cleanDevelop:true, developSha:candidateId, pushedSha:candidateId, remote:"origin", pushedAt:"2026-09-07T20:01:20.000Z"}, publication:{published:true, packageName:"pokie", packageVersion:"1.3.0", packageSha256:packageSha, publishedSha:candidateId, registryIdentity:"https://registry.npmjs.org/pokie/1.3.0", publishedAt:"2026-09-07T20:01:30.000Z"}, drive:{uploaded:true, readBack:true, releaseGateSha256:gateSha256, uploadId:"drive-file-1", uploadedAt:"2026-09-07T20:01:40.000Z", readBackAt:"2026-09-07T20:01:50.000Z"}});
}

function acceptedPc19() {
    return {candidateId, frozenFindingsSha256:"c".repeat(64), freezeReceiptSha256:"d".repeat(64), coverageIds:["blind-cli-exploration", "blind-studio-exploration", "player-examples-parity", "role-math-par"]};
}

test("runs the official release composite once only after PC-19 acceptance, then appends a completion tied to push, publish, and Drive receipts", async () => {
    const {root, config, lifecycleReceiptPath, outputDirectory} = await fixture();
    let pc19Calls = 0, gateCalls = 0;
    try {
        const result = await validatePc20ReleaseCompletion(config, {
            validatePc19:async () => { pc19Calls += 1; return acceptedPc19(); },
            readRepositoryState:() => ({head:candidateId, branch:"develop", dirty:false}),
            runReleaseGate:async () => {
                gateCalls += 1;
                const gate = {schemaVersion:PC20_SCHEMA_VERSION, kind:"release-gate", candidateId, candidatePackageSha256:packageSha, ...gateResult};
                const gateSha = hash(`${JSON.stringify(gate, null, 2)}\n`);
                const contents = `${JSON.stringify(lifecycleReceipt(gateSha), null, 2)}\n`;
                await writeFile(lifecycleReceiptPath, contents);
                config.lifecycleReceiptSha256 = hash(contents);
                return gateResult;
            },
        });
        assert.equal(result.candidateId, candidateId);
        assert.equal(pc19Calls, 1);
        assert.equal(gateCalls, 1);
        const entries = await Promise.all(["pc-20-" + candidateId + "-release-gate.json", "pc-20-" + candidateId + "-completion.json"].map((name) => readFile(path.join(outputDirectory, name), "utf8")));
        assert.match(entries[0], /npm run check:release/);
        assert.match(entries[1], /campaign-completion/);

        const replay = await validatePc20ReleaseCompletion(config, {
            validatePc19:async () => acceptedPc19(),
            readRepositoryState:() => ({head:candidateId, branch:"develop", dirty:false}),
            runReleaseGate:async () => { throw new Error("the persisted candidate gate must not be run twice"); },
        });
        assert.equal(replay.reused, true);
        assert.equal(gateCalls, 1);
    } finally { await rm(root, {recursive:true, force:true}); }
});

test("fails closed before running the release gate when PC-19 is unaccepted or develop has drifted", async () => {
    const {root, config} = await fixture();
    try {
        let gateCalls = 0;
        await assert.rejects(() => validatePc20ReleaseCompletion(config, {
            validatePc19:async () => { throw new Error("PC-19 independent-review evidence is invalid: incomplete coverage"); },
            readRepositoryState:() => ({head:candidateId, branch:"develop", dirty:false}),
            runReleaseGate:async () => { gateCalls += 1; return gateResult; },
        }), /incomplete coverage/);
        assert.equal(gateCalls, 0);
        await assert.rejects(() => validatePc20ReleaseCompletion(config, {
            validatePc19:async () => acceptedPc19(),
            readRepositoryState:() => ({head:"e".repeat(40), branch:"develop", dirty:false}),
            runReleaseGate:async () => { gateCalls += 1; return gateResult; },
        }), /clean develop at the accepted candidate/i);
        assert.equal(gateCalls, 0);
    } finally { await rm(root, {recursive:true, force:true}); }
});

test("rejects altered registry, Drive, and process-cleanup receipts rather than treating a checklist as release completion", async () => {
    for (const mutate of [
        (receipt) => { receipt.publication.packageSha256 = "e".repeat(64); return receipt; },
        (receipt) => { receipt.drive.readBack = false; return receipt; },
    ]) {
        const {root, config, lifecycleReceiptPath} = await fixture();
        try {
            const gate = {schemaVersion:PC20_SCHEMA_VERSION, kind:"release-gate", candidateId, candidatePackageSha256:packageSha, ...gateResult};
            const gateSha = hash(`${JSON.stringify(gate, null, 2)}\n`);
            const contents = `${JSON.stringify(lifecycleReceipt(gateSha, mutate), null, 2)}\n`;
            await writeFile(lifecycleReceiptPath, contents);
            config.lifecycleReceiptSha256 = hash(contents);
            await assert.rejects(() => validatePc20ReleaseCompletion(config, {
                validatePc19:async () => acceptedPc19(),
                readRepositoryState:() => ({head:candidateId, branch:"develop", dirty:false}),
                runReleaseGate:async () => gateResult,
            }), /registry publication identity|Drive upload\/read-back/i);
        } finally { await rm(root, {recursive:true, force:true}); }
    }
    const {root, config} = await fixture();
    try {
        await assert.rejects(() => validatePc20ReleaseCompletion(config, {
            validatePc19:async () => acceptedPc19(),
            readRepositoryState:() => ({head:candidateId, branch:"develop", dirty:false}),
            runReleaseGate:async () => ({...gateResult, processGroupDrained:false}),
        }), /release gate record is incomplete/i);
    } finally { await rm(root, {recursive:true, force:true}); }
});
