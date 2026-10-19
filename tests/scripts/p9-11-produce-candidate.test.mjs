import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {access, cp, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "@jest/globals";
import {produceP911Candidate, runP911Producer} from "../../scripts/p9-11-produce-candidate.mjs";
import {P911_CAMPAIGN, readPinnedJson, readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment, sha256} from "../../scripts/p9-11-candidate.mjs";
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
// The real smoke setup calls this selector and then this same validator on its
// staged archive before npm install. No packaging suite or fallback npm runs.
const nativeSmokeRead = (environment, repository, archivePath) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import {readFileSync} from 'node:fs';
    import {readP911SmokeCandidateFromEnvironment, validateP911SmokeCandidateIdentity} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
    const environment = ${JSON.stringify(environment)}, repository = ${JSON.stringify(repository)};
    const {archive, ...candidate} = await readP911SmokeCandidateFromEnvironment(environment, {repository});
    validateP911SmokeCandidateIdentity(candidate, environment, {repository, archive:readFileSync(${JSON.stringify(archivePath)})});
    process.stdout.write(JSON.stringify(candidate));
`], {encoding:"utf8", timeout:10_000, stdio:["ignore", "pipe", "pipe"]}));

async function fixture(options = {}) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-producer-contract-"));
    const candidate = await candidateFixture(directory, options), calls = [];
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
        assert.equal(commandOptions.env.INIT_CWD, commandOptions.cwd);
        assert.equal(commandOptions.env.PWD, commandOptions.cwd);
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
            if (options.staleInstallation) await writeFile(path.join(commandOptions.cwd, "node_modules", candidate.handoff.packageName, "dist/esm/index.js"), "stale");
        }
        return {...success, resourcesDrained:options.undrainedPhase !== phase, stdioClosed:options.openStdioPhase !== phase};
    };
    return {directory, candidate, config, calls, run};
}

test.each(["@fromstan/pokie", "pokie"])("producer delivers one normal %s candidate pin consumed by the native installation reader", async (packageName) => {
    const f = await fixture({packageName, includeGitHead:packageName === "@fromstan/pokie"});
    const inherited = {npm_lifecycle_event:"test:targeted", npm_package_json:"/caller/package.json", INIT_CWD:"/caller", NODE_OPTIONS:"--experimental-vm-modules"};
    const previous = Object.fromEntries(Object.keys(inherited).map(name => [name, process.env[name]]));
    Object.assign(process.env, inherited);
    try {
        const delivery = await produceP911Candidate(f.config, {run:f.run, readCandidate:nativeRead});
        assert.deepEqual(f.calls.map((call) => call.args), [
            ["run", "build"],
            ["pack", "--ignore-scripts", "--json", "--pack-destination", path.join(f.config.outputDirectory, "archive")],
            ["install", "--omit=dev", "--no-audit", "--no-fund", "--", path.join(f.config.outputDirectory, "archive/pokie-1.3.0.tgz")],
        ]);
        assert.deepEqual(f.calls.map((call) => call.options.cwd), [f.candidate.repository, f.candidate.repository, path.join(f.config.outputDirectory, "installation")]);
        const candidate = nativeRead(delivery.handoff, {repository:f.candidate.repository});
        assert.equal(candidate.packageName, packageName);
        assert.equal(candidate.resolutions[packageName], path.join(candidate.packageRoot, "dist/cjs/index.cjs"));
        assert.equal(candidate.esmResolutions[packageName], path.join(candidate.packageRoot, "dist/esm/index.js"));
        assert.equal(candidate.candidateId, f.config.candidateId);
        assert.deepEqual(candidate.browserDriver, f.config.browserDriver);
        assert.equal(candidate.archiveSha256, f.candidate.handoff.archiveSha256);
        assert.equal(delivery.archiveSha256, candidate.archiveSha256);
        assert.equal(delivery.installationRoot, candidate.installationRoot);
        assert.deepEqual(delivery.environment, {POKIE_P911_CANDIDATE_HANDOFF:delivery.handoff.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256:delivery.handoff.sha256});
        // Exercise the shared selector in Node's native module realm, exactly
        // as both CommonJS ts-jest packaging callers load it.
        const stagedArchive = path.join(f.directory, "smoke-staged.tgz");
        await cp(candidate.archivePath, stagedArchive);
        const selected = nativeSmokeRead(delivery.environment, f.candidate.repository, stagedArchive);
        assert.equal(selected.archiveSha256, delivery.archiveSha256);
        assert.equal(selected.bin, candidate.bin);
        assert.equal(selected.installationRoot, candidate.installationRoot);
        assert.deepEqual(selected, candidate);
        assert.equal(selected.projection.packageJson.gitHead, packageName === "@fromstan/pokie" ? candidate.candidateId : undefined);
        await assert.rejects(produceP911Candidate(f.config, {run:f.run}), /EEXIST/);
        assert.equal(f.calls.length, 3);
        const reviewedId = await commitP911ToolingDescendant(f.candidate);
        const descendant = nativeSmokeRead(delivery.environment, f.candidate.repository, stagedArchive);
        assert.deepEqual({...descendant, equivalence:candidate.equivalence}, candidate);
        assert.equal(descendant.equivalence.reviewedId, reviewedId);
        const releaseEnvironment = {...delivery.environment, POKIE_P805_RELEASE_HANDOFF:"", POKIE_PACK_SMOKE_CANDIDATE_ID:reviewedId,
            POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256:candidate.archiveSha256,
            POKIE_PACK_SMOKE_RECEIPT:path.join(f.directory, "smoke.json"), POKIE_PACK_SMOKE_ARCHIVE_PATH:path.join(f.directory, "accepted.tgz")};
        assert.deepEqual(nativeSmokeRead(releaseEnvironment, f.candidate.repository, stagedArchive), descendant);
        assert.throws(() => nativeSmokeRead({...releaseEnvironment, POKIE_PACK_SMOKE_CANDIDATE_ID:candidate.candidateId}, f.candidate.repository, stagedArchive), /smoke reviewed candidate identity mismatch/);
        assert.equal(f.calls.length, 3); // Admission never rebuilds or reinstalls.
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
        await assert.rejects(produceP911Candidate(f.config, {run:f.run}), /exact committed candidate HEAD/);
        assert.equal(f.calls.length, 3); // No repeat build or installation.
        assert.equal((await readPinnedJson(delivery.handoff)).archiveSha256, candidate.archiveSha256);
    } finally {
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[name]; else process.env[name] = value;
        }
        await rm(f.directory, {recursive:true, force:true});
    }
});

test.each([false, true])("smoke install identity rejects conflicting context and pins without fallback (descendant=%s)", async (descendant) => {
    const f = await fixture();
    try {
        const {handoff, repository, reference} = f.candidate;
        const original = nativeRead(reference, {repository});
        const reviewedId = descendant ? await commitP911ToolingDescendant(f.candidate) : handoff.candidateId;
        const environment = {POKIE_P911_CANDIDATE_HANDOFF:reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256:reference.sha256};
        const stagedArchive = path.join(f.directory, "smoke-staged.tgz");
        await cp(handoff.archivePath, stagedArchive);
        const select = (context = {}) => nativeSmokeRead({...environment, ...context}, repository, stagedArchive);
        const accepted = select();
        assert.equal(accepted.candidateId, handoff.candidateId);
        assert.equal(accepted.equivalence.reviewedId, reviewedId);
        assert.deepEqual({...accepted, equivalence:original.equivalence}, original);
        for (const context of [
            {POKIE_PACK_SMOKE_CANDIDATE_ID:reviewedId},
            {POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256:handoff.archiveSha256},
            {POKIE_PACK_SMOKE_CANDIDATE_ID:reviewedId, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256:handoff.archiveSha256},
        ]) assert.deepEqual(select(context), accepted);
        for (const [context, diagnostic] of [
            [{POKIE_PACK_SMOKE_CANDIDATE_ID:"b".repeat(40)}, /smoke reviewed candidate identity mismatch/],
            [{POKIE_PACK_SMOKE_CANDIDATE_ID:""}, /smoke reviewed candidate identity mismatch/],
            [{POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256:"b".repeat(64)}, /smoke archive digest mismatch/],
            [{POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256:""}, /smoke archive digest mismatch/],
            [{POKIE_PACK_SMOKE_CANDIDATE_ID:"b".repeat(40), POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256:"b".repeat(64)}, /smoke reviewed candidate identity mismatch/],
            [{POKIE_PACK_SMOKE_RECEIPT:path.join(f.directory, "receipt.json")}, /smoke release outputs require/],
            [{POKIE_PACK_SMOKE_ARCHIVE_PATH:path.join(f.directory, "archive.tgz")}, /smoke release outputs require/],
            [{POKIE_P911_CANDIDATE_HANDOFF_SHA256:"b".repeat(64)}, /receipt digest mismatch/],
            [{POKIE_P805_RELEASE_HANDOFF:"{}"}, /cannot be combined/],
        ]) {
            assert.throws(() => select(context), diagnostic);
            assert.deepEqual(select(), accepted);
        }
        for (const [file, diagnostic] of [
            [stagedArchive, /smoke selected archive digest mismatch/],
            [handoff.archivePath, /archive digest mismatch/],
            [handoff.buildReceipt.path, /receipt digest mismatch/],
            [handoff.installReceipt.path, /receipt digest mismatch/],
            [handoff.browserDriver.path, /authenticated controller browser driver required/],
        ]) {
            const bytes = await readFile(file);
            await writeFile(file, "changed externally pinned bytes\n");
            assert.throws(() => select(), diagnostic);
            await writeFile(file, bytes);
            assert.deepEqual(select(), accepted);
            assert.deepEqual(select(), accepted);
        }
        // Editing every dependent identity and nested pin cannot replace the
        // controller's original external handoff pin.
        const files = [reference.path, handoff.buildReceipt.path, handoff.installReceipt.path];
        const bytes = await Promise.all(files.map(file => readFile(file)));
        const changed = JSON.parse(bytes[0]);
        changed.candidateId = "b".repeat(40);
        for (const [index, key] of [[1, "buildReceipt"], [2, "installReceipt"]]) {
            const receipt = {...JSON.parse(bytes[index]), candidateId:changed.candidateId};
            await writeFile(files[index], JSON.stringify(receipt));
            changed[key].sha256 = sha256(await readFile(files[index]));
        }
        await writeFile(reference.path, JSON.stringify(changed));
        assert.throws(() => select(), /receipt digest mismatch/);
        for (let index = 0; index < files.length; index++) await writeFile(files[index], bytes[index]);
        assert.deepEqual(select(), accepted);
        assert.equal(f.calls.length, 0);
        assert.equal(await exists(f.config.outputDirectory), false);
        assert.equal(await exists(path.join(repository, "dist")), false);
        assert.equal(await exists(path.join(repository, "node_modules")), false);
    } finally { await rm(f.directory, {recursive:true, force:true}); }
});

test("smoke continuation rejects a changed reviewed checkout then accepts freshly authenticated reuse", async () => {
    const f = await fixture();
    try {
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {writeFileSync} from 'node:fs';
            import {execFileSync} from 'node:child_process';
            import {readP911Candidate, validateP911SmokeCandidateIdentity} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            const repository = ${JSON.stringify(f.candidate.repository)}, reference = ${JSON.stringify(f.candidate.reference)};
            const candidate = await readP911Candidate(reference, {repository});
            validateP911SmokeCandidateIdentity(candidate, {}, {repository});
            writeFileSync(repository + '/docs/v2-completion/V2C-31.md', 'new reviewed evidence');
            execFileSync('git', ['add', '.'], {cwd:repository});
            execFileSync('git', ['-c', 'user.name=sta-ger', '-c', 'user.email=pascaldelger@gmail.com', 'commit', '--quiet', '-m', 'fixture continuation'], {cwd:repository});
            assert.throws(() => validateP911SmokeCandidateIdentity(candidate, {}, {repository}), /smoke reviewed checkout changed after authentication/);
            const refreshed = await readP911Candidate(reference, {repository});
            validateP911SmokeCandidateIdentity(refreshed, {}, {repository});
            validateP911SmokeCandidateIdentity(refreshed, {}, {repository});
            assert.equal(refreshed.candidateId, candidate.candidateId);
            assert.equal(refreshed.archiveSha256, candidate.archiveSha256);
        `], {encoding:"utf8", timeout:10_000, stdio:["ignore", "pipe", "pipe"]});
        assert.equal(f.calls.length, 0);
        assert.equal(await exists(f.config.outputDirectory), false);
    } finally { await rm(f.directory, {recursive:true, force:true}); }
});

test("shared selector preserves standalone callers and fails closed on partial/conflicting delivery", async () => {
    assert.equal(await readP911CandidateFromEnvironment({}), undefined);
    assert.equal(await readP911CandidateFromEnvironment({POKIE_P805_RELEASE_HANDOFF:"legacy"}), undefined);
    await assert.rejects(readP911CandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF_SHA256:"a".repeat(64)}), /absolute receipt path/);
    await assert.rejects(readP911CandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF:"/missing.json"}), /externally pinned digest/);
    assert.throws(() => readP911CandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF:"/p9.json", POKIE_P805_RELEASE_HANDOFF:"legacy"}), /cannot be combined/);
    assert.equal(await readP911SmokeCandidateFromEnvironment({}), undefined);
    assert.equal(await readP911SmokeCandidateFromEnvironment({POKIE_P805_RELEASE_HANDOFF:"legacy"}), undefined);
    await assert.rejects(readP911SmokeCandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF_SHA256:"a".repeat(64)}), /absolute receipt path/);
    await assert.rejects(readP911SmokeCandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF:"/missing.json"}), /externally pinned digest/);
    await assert.rejects(readP911SmokeCandidateFromEnvironment({POKIE_P911_CANDIDATE_HANDOFF:"/p9.json", POKIE_P805_RELEASE_HANDOFF:"legacy"}), /cannot be combined/);
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
