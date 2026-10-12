import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {access, cp, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "@jest/globals";
import {produceP911Candidate, runP911Producer} from "../../scripts/p9-11-produce-candidate.mjs";
import {P911_CAMPAIGN, readPinnedJson, readP911CandidateFromEnvironment} from "../../scripts/p9-11-candidate.mjs";
import {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS} from "../testUtils/createP911CandidateFixture.mjs";

// These fake npm outcomes test the real producer/reader boundary without
// running controller-owned build/pack/install or claiming browser evidence.
const success = {exitCode:0, signal:null, timedOut:false, cancelled:false, processGroupDrained:true,
    processTreeDrained:true, resourcesDrained:true, stdioClosed:true, stdout:"", stderr:""};
const exists = async (file) => access(file).then(() => true, () => false);
const nativeRead = (reference, options) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import {readP911Candidate} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
    const {archive, ...candidate} = await readP911Candidate(${JSON.stringify(reference)}, ${JSON.stringify(options)});
    process.stdout.write(JSON.stringify(candidate));
`], {encoding:"utf8", timeout:10_000, stdio:["ignore", "pipe", "pipe"]}));

async function fixture(options = {}) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-producer-contract-"));
    const candidate = await candidateFixture(directory), calls = [];
    const config = {schemaVersion:1, kind:"p9-11-producer-config", campaignId:P911_CAMPAIGN, issuer:"fixture-controller",
        candidateId:candidate.handoff.candidateId, candidateTreeId:candidate.handoff.candidateTreeId,
        repositoryDirectory:candidate.repository, outputDirectory:path.join(directory, "delivery"), browserDriver:candidate.handoff.browserDriver};
    const run = async (command, args, commandOptions) => {
        calls.push({command, args, options:commandOptions});
        assert.equal(command, "npm");
        assert.equal(commandOptions.env.NODE_ENV, "production");
        assert.equal(commandOptions.env.npm_lifecycle_event, undefined);
        assert.equal(commandOptions.env.npm_package_json, undefined);
        assert.equal(commandOptions.env.NODE_OPTIONS, undefined);
        assert.ok(commandOptions.resourceRegistryPath.startsWith(`${config.outputDirectory}${path.sep}`));
        const phase = args[0] === "run" ? "build" : args[0];
        if (options.failPhase === phase) {
            const error = new Error(`${phase}: precise fixture command failure`);
            error.pc20Result = {...success, exitCode:9, stderr:"specific npm failure"};
            throw error;
        }
        if (options.mutatePhase === phase) await writeFile(config.browserDriver.path, "changed driver");
        if (phase === "pack") {
            await cp(candidate.handoff.archivePath, path.join(args.at(-1), "pokie-1.3.0.tgz"));
            return {...success, stdout:JSON.stringify([{filename:"pokie-1.3.0.tgz"}])};
        }
        if (phase === "install") {
            await cp(path.join(candidate.handoff.installationRoot, "node_modules"), path.join(commandOptions.cwd, "node_modules"), {recursive:true, verbatimSymlinks:true});
            if (options.staleInstallation) await writeFile(path.join(commandOptions.cwd, "node_modules/@fromstan/pokie/dist/esm/index.js"), "stale");
        }
        return {...success, resourcesDrained:options.undrainedPhase !== phase, stdioClosed:options.openStdioPhase !== phase};
    };
    return {directory, candidate, config, calls, run};
}

test("producer delivers one normal candidate pin consumed by the native installation reader", async () => {
    const f = await fixture();
    try {
        const delivery = await produceP911Candidate(f.config, {run:f.run, readCandidate:nativeRead});
        assert.deepEqual(f.calls.map((call) => call.args), [
            ["run", "build"],
            ["pack", "--ignore-scripts", "--json", "--pack-destination", path.join(f.config.outputDirectory, "archive")],
            ["install", "--omit=dev", "--no-audit", "--no-fund", "--", path.join(f.config.outputDirectory, "archive/pokie-1.3.0.tgz")],
        ]);
        assert.deepEqual(f.calls.map((call) => call.options.cwd), [f.candidate.repository, f.candidate.repository, path.join(f.config.outputDirectory, "installation")]);
        const candidate = nativeRead(delivery.handoff, {repository:f.candidate.repository});
        assert.equal(candidate.candidateId, f.config.candidateId);
        assert.deepEqual(candidate.browserDriver, f.config.browserDriver);
        assert.equal(candidate.archiveSha256, f.candidate.handoff.archiveSha256);
        assert.equal(delivery.archiveSha256, candidate.archiveSha256);
        assert.equal(delivery.installationRoot, candidate.installationRoot);
        assert.deepEqual(delivery.environment, {POKIE_P911_CANDIDATE_HANDOFF:delivery.handoff.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256:delivery.handoff.sha256});
        // Exercise the shared selector in Node's native module realm, exactly
        // as both CommonJS ts-jest packaging callers load it.
        const selected = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import {readP911CandidateFromEnvironment} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            const {archive, ...record} = await readP911CandidateFromEnvironment(${JSON.stringify({...delivery.environment, POKIE_P805_RELEASE_HANDOFF:""})}, {repository:${JSON.stringify(f.candidate.repository)}});
            process.stdout.write(JSON.stringify(record));
        `], {encoding:"utf8", timeout:10_000, stdio:["ignore", "pipe", "pipe"]}));
        assert.equal(selected.archiveSha256, delivery.archiveSha256);
        assert.equal(selected.bin, candidate.bin);
        assert.equal(selected.installationRoot, candidate.installationRoot);
        assert.deepEqual(delivery.closeout.args.slice(1), ["--handoff", delivery.handoff.path, "--sha256", delivery.handoff.sha256]);
        assert.equal(delivery.campaignAcceptance, "pending-controller-independent-evidence-and-release-lifecycle");
        for (const reference of [candidate.buildReceipt, candidate.installReceipt]) {
            const receipt = await readPinnedJson(reference);
            assert.equal(receipt.candidateTreeId, f.config.candidateTreeId);
            assert.equal(receipt.archiveSha256, candidate.archiveSha256);
            assert.equal(receipt.resourcesDrained, true);
            assert.ok(receipt.commands.every((command) => command.result.stdioClosed));
            assert.ok(receipt.commands.every((command) => Array.isArray(command.args) && command.cwd));
        }
        await assert.rejects(produceP911Candidate(f.config, {run:f.run}), /EEXIST/);
        assert.equal(f.calls.length, 3); // No repeat build or installation.
        assert.equal((await readPinnedJson(delivery.handoff)).archiveSha256, candidate.archiveSha256);
    } finally { await rm(f.directory, {recursive:true, force:true}); }
});

test("shared selector preserves standalone callers and fails closed on partial/conflicting delivery", async () => {
    assert.equal(await readP911CandidateFromEnvironment({}), undefined);
    assert.equal(await readP911CandidateFromEnvironment({POKIE_P805_RELEASE_HANDOFF:"legacy"}), undefined);
    await assert.rejects(readP911CandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF_SHA256:"a".repeat(64)}), /absolute receipt path/);
    await assert.rejects(readP911CandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF:"/missing.json"}), /externally pinned digest/);
    assert.throws(() => readP911CandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF:"/p9.json", POKIE_P805_RELEASE_HANDOFF:"legacy"}), /cannot be combined/);
});

test("driver pin is mandatory before any producer command or output", async () => {
    const f = await fixture();
    try {
        for (const browserDriver of [undefined, {...f.config.browserDriver, sha256:"b".repeat(64)}]) {
            await assert.rejects(produceP911Candidate({...f.config, browserDriver}, {run:f.run}), /browser driver required/);
        }
        assert.equal(f.calls.length, 0);
        assert.equal(await exists(f.config.outputDirectory), false);
        await assert.rejects(runP911Producer({...f.candidate.reference, sha256:"b".repeat(64)}), /digest mismatch/);
        // A pinned candidate document cannot be reinterpreted as authorization
        // to run controller build/pack commands.
        await assert.rejects(runP911Producer(f.candidate.reference), /controller configuration required/);
        assert.throws(() => execFileSync(process.execPath, [path.resolve("scripts/p9-11-produce-candidate.mjs"),
            "--config", f.candidate.reference.path, "--sha256", "b".repeat(64)], {encoding:"utf8", timeout:10_000, stdio:["ignore", "pipe", "pipe"]}),
        (error) => error.status === 1 && error.stderr.includes("receipt digest mismatch"));
    } finally { await rm(f.directory, {recursive:true, force:true}); }
});

test("pre-cancelled producer never starts npm or delivers a pin", async () => {
    const f = await fixture(), cancellation = new AbortController();
    cancellation.abort();
    try {
        await assert.rejects(produceP911Candidate({...f.config, signal:cancellation.signal}, {run:f.run}), /cancelled before launch/);
        assert.equal(f.calls.length, 0);
        const failure = JSON.parse(await readFile(path.join(f.config.outputDirectory, "failed.json"), "utf8"));
        assert.equal(failure.phase, "build");
        assert.equal(await exists(path.join(f.config.outputDirectory, "handoff.json")), false);
    } finally { await rm(f.directory, {recursive:true, force:true}); }
});

test("producer requires exact clean HEAD and external fresh output", async () => {
    const f = await fixture();
    try {
        await assert.rejects(produceP911Candidate({...f.config, outputDirectory:path.join(f.candidate.repository, "receipts")}, {run:f.run}), /outside/);
        await writeFile(path.join(f.candidate.repository, "dirty.js"), "dirty");
        await assert.rejects(produceP911Candidate(f.config, {run:f.run}), /dirty/);
        await rm(path.join(f.candidate.repository, "dirty.js"));
        // The consumer can reuse the original delivery after the full tooling repair,
        // but the producer may never rebuild that source from a descendant.
        const reviewedId = await commitP911ToolingDescendant(f.candidate);
        const retained = nativeRead(f.candidate.reference, {repository:f.candidate.repository});
        assert.equal(retained.equivalence.reviewedId, reviewedId);
        assert.deepEqual(retained.equivalence.changedEvidenceAndTooling, [...P911_TOOLING_DESCENDANT_PATHS].sort());
        assert.equal(retained.candidateId, f.config.candidateId);
        assert.deepEqual(retained.browserDriver, f.config.browserDriver);
        await assert.rejects(produceP911Candidate(f.config, {run:f.run}), /exact committed candidate HEAD/);
        assert.equal(f.calls.length, 0);
        assert.equal(await exists(f.config.outputDirectory), false);
        // Even a further allowed evidence-only descendant is not the exact
        // source this producer was authorized to build.
        await mkdir(path.join(f.candidate.repository, "docs/audit-corrections"), {recursive:true});
        await writeFile(path.join(f.candidate.repository, "docs/audit-corrections/README.md"), "fixture evidence");
        execFileSync("git", ["add", "."], {cwd:f.candidate.repository});
        execFileSync("git", ["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "fixture descendant"], {cwd:f.candidate.repository});
        await assert.rejects(produceP911Candidate(f.config, {run:f.run}), /exact committed candidate HEAD/);
        assert.equal(f.calls.length, 0);
    } finally { await rm(f.directory, {recursive:true, force:true}); }
});

for (const failPhase of ["build", "pack", "install"]) {
    test(`producer retains precise ${failPhase} failure and never delivers a handoff`, async () => {
        const f = await fixture({failPhase});
        try {
            await assert.rejects(produceP911Candidate(f.config, {run:f.run}), /precise fixture command failure/);
            const failure = JSON.parse(await readFile(path.join(f.config.outputDirectory, "failed.json"), "utf8"));
            assert.equal(failure.phase, failPhase);
            assert.equal(failure.process.exitCode, 9);
            assert.equal(failure.commands.at(-1).result.stderr, "specific npm failure");
            assert.equal(await exists(path.join(f.config.outputDirectory, "handoff.json")), false);
            assert.equal(await exists(path.join(f.config.outputDirectory, "delivery.json")), false);
            assert.equal(f.calls.length, ["build", "pack", "install"].indexOf(failPhase) + 1);
        } finally { await rm(f.directory, {recursive:true, force:true}); }
    });
}

for (const options of [{undrainedPhase:"build"}, {openStdioPhase:"install"}, {mutatePhase:"pack"}, {staleInstallation:true}]) {
    test(`producer refuses unsafe delivery: ${JSON.stringify(options)}`, async () => {
        const f = await fixture(options);
        try {
            await assert.rejects(produceP911Candidate(f.config, {run:f.run, readCandidate:nativeRead}), /cleanup|browser driver|stale installed/);
            assert.equal(await exists(path.join(f.config.outputDirectory, "delivery.json")), false);
            assert.equal(await exists(path.join(f.config.outputDirectory, "handoff.json")), false);
            assert.equal(await exists(path.join(f.config.outputDirectory, ".handoff-pending.json")), false);
            assert.equal(await exists(path.join(f.config.outputDirectory, "failed.json")), true);
        } finally { await rm(f.directory, {recursive:true, force:true}); }
    });
}
