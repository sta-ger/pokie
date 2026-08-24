#!/usr/bin/env node
/** Run a Phase 7 workflow twice in clean rooms and retain wrapper-observed CLI evidence. */
import {chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {spawn, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const MAX_INPUT_PROVENANCE_ENTRIES = 128;
const MAX_EXPECTED_ARTIFACTS = 32;
const MAX_EXPECTED_PATH_CHARS = 4096;
const MAX_COMMAND_RECORDS = 64;
const MAX_COMMAND_ARGUMENTS = 32;
const MAX_COMMAND_ARGUMENT_CHARS = 4096;
const MAX_DRIVER_OUTPUT_CHARS = 8192;
const MAX_TRANSCRIPT_CHARS = 32768;

function usage(message) {
    throw new Error(`${message}\nUsage: node scripts/run-phase7-journey.mjs --cli <built-or-packed-pokie.js> --script <journey.mjs> --evidence-dir <current-step-dir> [--input <file-or-dir>]... [--expect <relative-artifact>]...`);
}

function safeArtifactPath(relativePath) {
    return typeof relativePath === "string" && relativePath.length > 0 && !path.isAbsolute(relativePath) && !relativePath.split(/[\\/]+/).includes("..");
}

function argumentsFrom(argv) {
    const result = {cli: undefined, script: undefined, evidenceDir: undefined, inputs: [], expected: []};
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index];
        const value = argv[++index];
        if (!value) usage(`${argument} requires a value.`);
        if (argument === "--cli") result.cli = path.resolve(value);
        else if (argument === "--script") result.script = path.resolve(value);
        else if (argument === "--evidence-dir") result.evidenceDir = path.resolve(value);
        else if (argument === "--input") result.inputs.push(path.resolve(value));
        else if (argument === "--expect") result.expected.push(value);
        else usage(`Unknown argument ${argument}.`);
    }
    if (!result.cli || !existsSync(result.cli)) usage("--cli must name a built or unpacked public dist/cli/pokie.js.");
    if (!result.script || !existsSync(result.script)) usage("--script must name the journey driver.");
    if (!result.evidenceDir) usage("--evidence-dir is required.");
    if (result.expected.length === 0) usage("at least one --expect artifact is required.");
    if (result.expected.length > MAX_EXPECTED_ARTIFACTS || result.expected.join("").length > MAX_EXPECTED_PATH_CHARS) usage("expected artifacts exceed the bounded journey evidence limit.");
    if (result.expected.some((entry) => !safeArtifactPath(entry))) usage("--expect paths must be relative and cannot escape the journey directory.");
    return result;
}

async function digest(target) {
    return createHash("sha256").update(await readFile(target)).digest("hex");
}

async function createPublicCommandRequestClient(destination) {
    // The driver can inspect this client without gaining an authority that the runner trusts.
    // It only writes an untrusted request plan; after the sandbox exits, the runner validates
    // each request and performs the public CLI invocation itself.  There is intentionally no
    // socket, credential, or command-record endpoint for a driver to replay or forge.
    await writeFile(destination, `#!/usr/bin/env node
import {appendFileSync} from "node:fs";
const requestFile = process.env.P7_COMMAND_REQUEST_FILE;
if (!requestFile) process.exit(1);
appendFileSync(requestFile, JSON.stringify({args: process.argv.slice(2)}) + "\\n", {encoding: "utf8", mode: 0o600});
`);
    await chmod(destination, 0o555);
}

async function directoryProvenance(directory) {
    const entries = [];
    async function visit(current, relative = "") {
        const children = await readdir(current, {withFileTypes: true});
        for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
            const nextRelative = path.join(relative, child.name);
            const next = path.join(current, child.name);
            if (child.isDirectory()) await visit(next, nextRelative);
            else if (child.isFile()) {
                entries.push(`${nextRelative.replaceAll(path.sep, "/")} sha256=${await digest(next)}`);
                if (entries.length > MAX_INPUT_PROVENANCE_ENTRIES) throw new Error(`directory input has more than ${MAX_INPUT_PROVENANCE_ENTRIES} files; provenance would not be bounded.`);
            } else throw new Error(`directory input contains unsupported non-file entry: ${nextRelative}`);
        }
    }
    await visit(directory);
    const manifest = entries.join("\n");
    return `directory files=${entries.length} manifest-sha256=${createHash("sha256").update(manifest).digest("hex")} entries=${JSON.stringify(entries)}`;
}

function driverResult(script, driverDirectory, clientPath, environment) {
    return new Promise((resolve) => {
        const sandbox = "/usr/bin/bwrap";
        if (!existsSync(sandbox)) {
            resolve({status: 1, stdout: "", stderr: "Phase 7 journey requires bubblewrap to isolate the untrusted driver from artifacts.", outputExceeded: false});
            return;
        }
        const child = spawn(sandbox, [
            "--die-with-parent", "--new-session", "--unshare-user", "--uid", "65534", "--gid", "65534", "--ro-bind", "/", "/", "--tmpfs", "/tmp", "--dir", path.dirname(driverDirectory),
            "--bind", driverDirectory, driverDirectory, "--ro-bind", clientPath, path.join(driverDirectory, "invoke-public-pokie"), "--chdir", driverDirectory,
            "--", process.execPath, script,
        ], {cwd: driverDirectory, env: environment});
        let stdout = "";
        let stderr = "";
        let outputExceeded = false;
        const append = (current, chunk) => {
            const next = `${current}${chunk}`;
            if (next.length > MAX_DRIVER_OUTPUT_CHARS) outputExceeded = true;
            return next.slice(0, MAX_DRIVER_OUTPUT_CHARS);
        };
        child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
        child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
        child.on("error", (error) => resolve({status: 1, stdout, stderr: `${stderr}${error.message}`, outputExceeded}));
        child.on("close", (status) => resolve({status: status ?? 1, stdout, stderr, outputExceeded}));
    });
}

function requestIsBounded(parsed) {
    return Array.isArray(parsed.args) && parsed.args.length <= MAX_COMMAND_ARGUMENTS && parsed.args.every((argument) => typeof argument === "string") && parsed.args.join("").length <= MAX_COMMAND_ARGUMENT_CHARS;
}

async function executeRequestedCommands(requestFile, cli, artifactDirectory, expected) {
    const requests = (await readFile(requestFile, "utf8")).trim().split("\n").filter(Boolean);
    if (requests.length > MAX_COMMAND_RECORDS) throw new Error(`journey exceeds the ${MAX_COMMAND_RECORDS}-record evidence limit.`);
    const records = [];
    for (const request of requests) {
        let parsed;
        try { parsed = JSON.parse(request); } catch { throw new Error("journey contains an invalid public CLI request plan."); }
        if (!requestIsBounded(parsed)) throw new Error("journey contains an invalid public CLI request plan.");
        const before = Object.fromEntries(await Promise.all(expected.map(async (entry) => {
            const target = path.join(artifactDirectory, entry);
            return [entry, existsSync(target) ? await digest(target) : undefined];
        })));
        const result = spawnSync(process.execPath, [cli, ...parsed.args], {cwd: artifactDirectory, encoding: "utf8", maxBuffer: 1024 * 1024});
        const artifacts = [];
        for (const entry of expected) {
            const target = path.join(artifactDirectory, entry);
            if (existsSync(target)) {
                const sha256 = await digest(target);
                if (before[entry] !== sha256) artifacts.push({path: entry, sha256});
            }
        }
        records.push({command: ["pokie", ...parsed.args], exitCode: result.error ? 1 : (result.status ?? 1), artifacts});
    }
    return records;
}

function boundedTranscript(lines, label) {
    const transcript = lines.join("\n");
    if (transcript.length > MAX_TRANSCRIPT_CHARS) throw new Error(`${label}: journey transcript exceeds the ${MAX_TRANSCRIPT_CHARS}-character evidence limit.`);
    return transcript;
}

async function runOnce(label, arguments_) {
    const driverDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-journey-driver-"));
    // The driver never receives this directory or the control endpoint. Expected artifacts are
    // observable only through the wrapper's pre/post execution snapshots.
    const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-journey-artifacts-"));
    const inputDirectory = path.join(driverDirectory, "inputs");
    const driverScript = path.join(driverDirectory, "journey.mjs");
    const wrapperPath = path.join(driverDirectory, "invoke-public-pokie");
    const publicClientPath = path.join(artifactDirectory, "public-command-request-client");
    const requestFile = path.join(driverDirectory, "public-cli-requests.jsonl");
    const provenance = [];
    const state = {records: [], failure: undefined};
    try {
        await mkdir(inputDirectory);
        await cp(arguments_.script, driverScript);
        await writeFile(wrapperPath, "", {mode: 0o511});
        await chmod(driverScript, 0o555);
        await chmod(driverDirectory, 0o755);
        for (const input of arguments_.inputs) {
            if (!existsSync(input)) usage(`input does not exist: ${input}`);
            const destination = path.join(inputDirectory, path.basename(input));
            await cp(input, destination, {recursive: true});
            const stat = await lstat(destination);
            provenance.push(`${input} -> ${destination} (${stat.isDirectory() ? await directoryProvenance(destination) : `sha256=${await digest(destination)}`})`);
        }
        await writeFile(requestFile, "", {mode: 0o666});
        await createPublicCommandRequestClient(publicClientPath);
        const result = await driverResult(driverScript, driverDirectory, publicClientPath, {...process.env, P7_INPUT_DIR: inputDirectory, P7_PUBLIC_CLI: wrapperPath, P7_COMMAND_REQUEST_FILE: requestFile});
        state.records = await executeRequestedCommands(requestFile, arguments_.cli, artifactDirectory, arguments_.expected);
        if (result.outputExceeded) throw new Error(`${label}: driver output exceeds the ${MAX_DRIVER_OUTPUT_CHARS}-character evidence limit.`);
        if (state.records.length === 0) throw new Error(`${label}: journey did not invoke the wrapper-controlled public CLI.${result.stderr ? ` ${result.stderr}` : ""}`);
        const checks = [];
        for (const relativeArtifact of arguments_.expected) {
            const artifact = path.join(artifactDirectory, relativeArtifact);
            if (!existsSync(artifact)) throw new Error(`${label}: expected artifact was not created: ${relativeArtifact}`);
            const sha256 = await digest(artifact);
            const recorded = state.records.filter((record) => record.exitCode === 0).flatMap((record) => record.artifacts).find((entry) => entry.path === relativeArtifact && entry.sha256 === sha256);
            if (!recorded) throw new Error(`${label}: expected artifact lacks wrapper-observed public CLI provenance: ${relativeArtifact}`);
            checks.push(`${relativeArtifact} sha256=${sha256}`);
        }
        if (result.error || result.status !== 0) throw new Error(`${label}: journey failed`);
        return boundedTranscript([
            `RUN ${label}`,
            `WORKDIR ${driverDirectory}`,
            `DRIVER_COMMAND ${process.execPath} ${JSON.stringify(arguments_.script)}`,
            `DRIVER_EXIT ${result.status ?? 1}`,
            ...provenance.map((entry) => `INPUT_PROVENANCE ${entry}`),
            ...state.records.map((record) => `PUBLIC_CLI_COMMAND ${JSON.stringify(record.command)} EXIT ${record.exitCode} ARTIFACTS ${JSON.stringify(record.artifacts)}`),
            ...checks.map((entry) => `ARTIFACT_CHECK ${entry}`),
            "STDOUT",
            result.stdout,
            "STDERR",
            result.stderr,
        ], label);
    } finally {
        await rm(driverDirectory, {recursive: true, force: true});
        await rm(artifactDirectory, {recursive: true, force: true});
    }
}

export async function main(argv = process.argv) {
    const arguments_ = argumentsFrom(argv);
    const first = await runOnce("primary", arguments_);
    const second = await runOnce("independent-rerun", arguments_);
    await mkdir(arguments_.evidenceDir, {recursive: true});
    await writeFile(path.join(arguments_.evidenceDir, "journey-transcript.txt"), `${first}\nINDEPENDENT_RERUN\n${second}\n`);
    console.log("P7_JOURNEY_PASS independent rerun completed");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
