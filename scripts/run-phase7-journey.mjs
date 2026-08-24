#!/usr/bin/env node
/** Run a Phase 7 workflow twice in clean rooms and retain wrapper-observed CLI evidence. */
import {chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const COMMAND_RECORD_NAME = "public-cli-commands.jsonl";

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
    if (result.expected.some((entry) => !safeArtifactPath(entry))) usage("--expect paths must be relative and cannot escape the journey directory.");
    return result;
}

async function digest(target) {
    return createHash("sha256").update(await readFile(target)).digest("hex");
}

function wrapperSource(cli, artifactDirectory, recordPath, expected) {
    return `#!/usr/bin/env node
import {appendFile, readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import path from "node:path";
const cli = ${JSON.stringify(cli)};
const artifactDirectory = ${JSON.stringify(artifactDirectory)};
const recordPath = ${JSON.stringify(recordPath)};
const expected = ${JSON.stringify(expected)};
const digest = async (target) => createHash("sha256").update(await readFile(target)).digest("hex");
const before = Object.fromEntries(await Promise.all(expected.map(async (entry) => {
    const target = path.join(artifactDirectory, entry);
    return [entry, existsSync(target) ? await digest(target) : undefined];
})));
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {cwd: artifactDirectory, encoding: "utf8", maxBuffer: 1024 * 1024});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
const artifacts = [];
for (const entry of expected) {
    const target = path.join(artifactDirectory, entry);
    if (existsSync(target)) {
        const sha256 = await digest(target);
        if (before[entry] !== sha256) artifacts.push({path: entry, sha256});
    }
}
await appendFile(recordPath, JSON.stringify({command: ["pokie", ...process.argv.slice(2)], exitCode: result.status ?? 1, artifacts}) + "\\n");
process.exitCode ??= result.status ?? 1;
`;
}

async function commandRecords(recordPath, label) {
    if (!existsSync(recordPath)) throw new Error(`${label}: journey did not invoke the wrapper-controlled public CLI.`);
    const lines = (await readFile(recordPath, "utf8")).split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error(`${label}: wrapper recorded no public CLI command records.`);
    return lines.map((line, index) => {
        let record;
        try { record = JSON.parse(line); } catch { throw new Error(`${label}: command record ${index + 1} is not JSON.`); }
        if (!Array.isArray(record.command) || record.command[0] !== "pokie" || !Number.isInteger(record.exitCode)) throw new Error(`${label}: wrapper command record ${index + 1} is invalid.`);
        if (!Array.isArray(record.artifacts)) throw new Error(`${label}: wrapper command record ${index + 1} has no artifact checks.`);
        return record;
    });
}

async function runOnce(label, arguments_) {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-journey-"));
    const controlDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-journey-control-"));
    const inputDirectory = path.join(temporaryDirectory, "inputs");
    const artifactDirectory = path.join(temporaryDirectory, "artifacts");
    const recordPath = path.join(controlDirectory, COMMAND_RECORD_NAME);
    const wrapperPath = path.join(controlDirectory, "invoke-public-pokie.mjs");
    const provenance = [];
    let transcript = "";
    try {
        await mkdir(inputDirectory);
        await mkdir(artifactDirectory);
        await writeFile(wrapperPath, wrapperSource(arguments_.cli, artifactDirectory, recordPath, arguments_.expected), {mode: 0o700});
        await chmod(wrapperPath, 0o700);
        for (const input of arguments_.inputs) {
            if (!existsSync(input)) usage(`input does not exist: ${input}`);
            const destination = path.join(inputDirectory, path.basename(input));
            await cp(input, destination, {recursive: true});
            const stat = await lstat(destination);
            provenance.push(`${input} -> ${destination} (${stat.isDirectory() ? "directory" : `sha256=${await digest(destination)}`})`);
        }
        const result = spawnSync(process.execPath, [arguments_.script], {
            cwd: temporaryDirectory,
            env: {...process.env, P7_JOURNEY_DIR: artifactDirectory, P7_INPUT_DIR: inputDirectory, P7_PUBLIC_CLI: wrapperPath},
            encoding: "utf8",
            maxBuffer: 1024 * 1024,
        });
        const records = await commandRecords(recordPath, label);
        const checks = [];
        for (const relativeArtifact of arguments_.expected) {
            const artifact = path.join(artifactDirectory, relativeArtifact);
            if (!existsSync(artifact)) throw new Error(`${label}: expected artifact was not created: ${relativeArtifact}`);
            const sha256 = await digest(artifact);
            const recorded = records.flatMap((record) => record.artifacts).find((entry) => entry.path === relativeArtifact && entry.sha256 === sha256);
            if (!recorded) throw new Error(`${label}: expected artifact lacks wrapper-observed public CLI provenance: ${relativeArtifact}`);
            checks.push(`${relativeArtifact} sha256=${sha256}`);
        }
        transcript = [
            `RUN ${label}`,
            `WORKDIR ${temporaryDirectory}`,
            `DRIVER_COMMAND ${process.execPath} ${JSON.stringify(arguments_.script)}`,
            `DRIVER_EXIT ${result.status ?? 1}`,
            ...provenance.map((entry) => `INPUT_PROVENANCE ${entry}`),
            ...records.map((record) => `PUBLIC_CLI_COMMAND ${JSON.stringify(record.command)} EXIT ${record.exitCode} ARTIFACTS ${JSON.stringify(record.artifacts)}`),
            ...checks.map((entry) => `ARTIFACT_CHECK ${entry}`),
            "STDOUT",
            (result.stdout ?? "").slice(0, 16000),
            "STDERR",
            (result.stderr ?? "").slice(0, 16000),
        ].join("\n");
        if (result.error || result.status !== 0) throw new Error(`${label}: journey failed\n${transcript}`);
        return transcript;
    } finally {
        await rm(temporaryDirectory, {recursive: true, force: true});
        await rm(controlDirectory, {recursive: true, force: true});
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
