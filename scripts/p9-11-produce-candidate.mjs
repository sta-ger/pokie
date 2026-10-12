#!/usr/bin/env node
/** Controller-only normal candidate producer. Never invoked by the verifier,
 * never publishes, and never replaces the independent collector's driver. */
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdir, readFile, realpath, rename, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {archiveExecutableManifest} from "./p8-05-candidate-package-verifier.mjs";
import {authenticateP911Driver, authenticateP911Tree, P911_CAMPAIGN, readP911Candidate, readPinnedJson, sha256} from "./p9-11-candidate.mjs";
import {runP911Process} from "./p9-11-corrective-closeout.mjs";

const fail = (message) => { throw new Error(`P9-11 producer: ${message}`); };
const json = async (file, value) => {
    const bytes = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(file, bytes, {flag:"wx"});
    return {path:file, sha256:sha256(bytes)};
};
const contains = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);
const clean = (result) => result?.exitCode === 0 && !result.signal && !result.timedOut && !result.cancelled
    && result.processGroupDrained === true && result.processTreeDrained === true
    && result.resourcesDrained === true && result.stdioClosed === true;

/** This is the controller-to-consumer integration, not an acceptance receipt.
 * The externally pinned configuration authorizes exactly one build/pack/install
 * and supplies the independent rendered driver. No retry or fallback exists. */
export async function produceP911Candidate(config, dependencies = {}) {
    const services = {run:runP911Process, readCandidate:readP911Candidate, ...dependencies};
    if (config?.schemaVersion !== 1 || config.kind !== "p9-11-producer-config" || config.campaignId !== P911_CAMPAIGN
        || typeof config.issuer !== "string" || !config.issuer.trim()
        || !path.isAbsolute(config.repositoryDirectory ?? "") || !path.isAbsolute(config.outputDirectory ?? "")) fail("pinned controller configuration required");
    const repository = await realpath(config.repositoryDirectory);
    const output = path.join(await realpath(path.dirname(config.outputDirectory)), path.basename(config.outputDirectory));
    if (contains(repository, output) || contains(output, repository)) fail("producer output must be outside the candidate checkout");
    const timeoutMs = config.timeoutMs ?? 180_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180_000) fail("invalid command deadline");
    const authenticate = async () => {
        const identity = authenticateP911Tree(config.candidateId, config.candidateTreeId, repository);
        if (identity.reviewedId !== config.candidateId) fail("producer requires the exact committed candidate HEAD");
        // The pin comes from the controller, never from reading and blessing an
        // arbitrary local module. Keep its original path for relative imports.
        await authenticateP911Driver(config.browserDriver);
    };
    await authenticate();
    await mkdir(output); // Fresh invocation only; preserve previous runs.
    const commands = [], installationRoot = path.join(output, "installation"), archiveDirectory = path.join(output, "archive");
    const pending = path.join(output, ".handoff-pending.json");
    let phase = "build";
    // A caller may itself be an npm/Jest process. Its lifecycle context must
    // not change which package or production bundle this normal build uses.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("npm_")
        && !name.startsWith("POKIE_P911_") && !name.startsWith("POKIE_PC20_") && name !== "NODE_OPTIONS"));
    Object.assign(env, {NODE_ENV:"production", INIT_CWD:repository, PWD:repository});
    const execute = async (args, cwd) => {
        const command = {command:"npm", args, cwd, environment:{NODE_ENV:"production"}};
        commands.push(command);
        try {
            if (config.signal?.aborted) fail(`${phase}: cancelled before launch`);
            command.result = await services.run("npm", args, {cwd, env:{...env, INIT_CWD:cwd, PWD:cwd}, timeoutMs,
                signal:config.signal, resourceRegistryPath:path.join(output, `${phase}.resources.ndjson`)});
            if (!clean(command.result)) fail(`${phase}: unsuccessful command or incomplete cleanup`);
            await json(path.join(output, `${phase}.process.json`), command);
        } catch (error) {
            command.result ??= error.pc20Result;
            throw error;
        }
        await authenticate();
        return command;
    };
    try {
        await mkdir(archiveDirectory);
        const build = await execute(["run", "build"], repository);
        phase = "pack";
        const pack = await execute(["pack", "--ignore-scripts", "--json", "--pack-destination", archiveDirectory], repository);
        const records = JSON.parse(pack.result.stdout);
        if (!Array.isArray(records) || records.length !== 1 || typeof records[0].filename !== "string"
            || !/^[\w.-]+\.tgz$/.test(records[0].filename)) fail("normal npm pack did not return one archive");
        const archivePath = path.join(archiveDirectory, records[0].filename);
        const archive = await readFile(archivePath), projection = await archiveExecutableManifest(archive);
        const declaration = JSON.parse(execFileSync("git", ["show", `${config.candidateId}:package.json`], {cwd:repository, encoding:"utf8", timeout:10_000}));
        const {gitHead, ...packedDeclaration} = projection.packageJson;
        if (!["pokie", "@fromstan/pokie"].includes(declaration.name) || JSON.stringify(declaration) !== JSON.stringify(packedDeclaration)
            || gitHead !== undefined && gitHead !== config.candidateId) fail("packed package differs from committed candidate");
        const binding = {candidateId:config.candidateId, candidateTreeId:config.candidateTreeId,
            archiveSha256:sha256(archive), executableSha256:projection.sha256, issuer:config.issuer, exitCode:0, resourcesDrained:true};
        phase = "install";
        await mkdir(installationRoot);
        await json(path.join(installationRoot, "package.json"), {name:"p9-11-shared-candidate", private:true});
        const install = await execute(["install", "--omit=dev", "--no-audit", "--no-fund", "--", archivePath], installationRoot);
        const buildReceipt = await json(path.join(output, "build-receipt.json"), {...binding, receiptId:randomUUID(), kind:"p9-11-normal-build-pack",
            buildCommand:"npm run build", packCommand:"npm pack --ignore-scripts", environment:{NODE_ENV:"production"}, commands:[build, pack]});
        const installReceipt = await json(path.join(output, "install-receipt.json"), {...binding, receiptId:randomUUID(), kind:"p9-11-npm-install",
            command:"npm install <archive>", installationRoot, commands:[install]});
        phase = "handoff-authentication";
        const reference = await json(pending, {schemaVersion:1, kind:"p9-11-candidate-handoff", campaignId:P911_CAMPAIGN,
            candidateId:config.candidateId, candidateTreeId:config.candidateTreeId, packageName:declaration.name, packageVersion:declaration.version,
            archivePath, archiveSha256:binding.archiveSha256, executableSha256:binding.executableSha256, installationRoot,
            buildReceipt, installReceipt, browserDriver:config.browserDriver});
        // Exercise the same public reader used by both packaging consumers and
        // the closeout. An invalid installation never becomes a delivered pin.
        await services.readCandidate(reference, {repository});
        await authenticate();
        const handoff = {...reference, path:path.join(output, "handoff.json")};
        const delivery = {kind:"p9-11-candidate-delivery", campaignId:P911_CAMPAIGN, candidateId:config.candidateId,
            candidateTreeId:config.candidateTreeId, archivePath, archiveSha256:binding.archiveSha256, executableSha256:binding.executableSha256, installationRoot, handoff,
            environment:{POKIE_P911_CANDIDATE_HANDOFF:handoff.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256:handoff.sha256},
            closeout:{command:process.execPath, args:[path.join(repository, "scripts/p9-11-corrective-closeout.mjs"), "--handoff", handoff.path, "--sha256", handoff.sha256]},
            campaignAcceptance:"pending-controller-independent-evidence-and-release-lifecycle"};
        await rename(pending, handoff.path);
        await json(path.join(output, "delivery.json"), delivery);
        return delivery;
    } catch (error) {
        await rm(pending, {force:true});
        await rm(path.join(output, "handoff.json"), {force:true});
        // Never erase command logs, ownership ledgers, archive or installation
        // on failure. These belong to this invocation, not previous evidence.
        await json(path.join(output, "failed.json"), {kind:"p9-11-producer-failure", candidateId:config.candidateId,
            phase, message:error.message, commands, process:error.pc20Result, campaignAcceptance:"unproven"});
        throw error;
    }
}

export async function runP911Producer(reference, options = {}) {
    const config = await readPinnedJson(reference);
    return produceP911Candidate({...config, signal:options.signal});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--config" || args[2] !== "--sha256") {
        process.stderr.write("Usage: node scripts/p9-11-produce-candidate.mjs --config <absolute-json> --sha256 <controller-pinned-digest>\n");
        process.exitCode = 1;
    } else {
        const cancellation = new AbortController(), cancel = () => cancellation.abort();
        process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
        runP911Producer({path:args[1], sha256:args[3]}, {signal:cancellation.signal})
            .then((delivery) => process.stdout.write(`${JSON.stringify(delivery)}\n`))
            .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; })
            .finally(() => { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); });
    }
}
