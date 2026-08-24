#!/usr/bin/env node
/** Run a Phase 7 workflow twice in clean rooms and retain public-CLI execution evidence. */
import {cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const COMMAND_RECORD_NAME = "public-cli-commands.jsonl";

function usage(message) {
    throw new Error(`${message}\nUsage: node scripts/run-phase7-journey.mjs --script <journey.mjs> --evidence-dir <current-step-dir> [--input <file-or-dir>]... [--expect <relative-artifact>]...`);
}

function argumentsFrom(argv) {
    const result = {script: undefined, evidenceDir: undefined, inputs: [], expected: []};
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index];
        const value = argv[++index];
        if (!value) usage(`${argument} requires a value.`);
        if (argument === "--script") result.script = path.resolve(value);
        else if (argument === "--evidence-dir") result.evidenceDir = path.resolve(value);
        else if (argument === "--input") result.inputs.push(path.resolve(value));
        else if (argument === "--expect") result.expected.push(value);
        else usage(`Unknown argument ${argument}.`);
    }
    if (!result.script || !existsSync(result.script)) usage("--script must name the journey driver.");
    if (!result.evidenceDir) usage("--evidence-dir is required.");
    if (result.expected.length === 0) usage("at least one --expect artifact is required.");
    if (result.expected.some((entry) => path.isAbsolute(entry) || entry.split(/[\\/]+/).includes(".."))) usage("--expect paths must be relative and cannot escape the journey directory.");
    return result;
}

async function digest(target) {
    return createHash("sha256").update(await readFile(target)).digest("hex");
}

function safeArtifactPath(relativePath) {
    return typeof relativePath === "string" && relativePath.length > 0 && !path.isAbsolute(relativePath) && !relativePath.split(/[\\/]+/).includes("..");
}

function publicCommand(record) {
    if (typeof record.command === "string") return /^pokie(?:\s|$)/.test(record.command);
    return Array.isArray(record.command) && record.command.length > 0 && (record.command[0] === "pokie" || /(?:^|[\\/])pokie(?:\.js)?$/.test(record.command[0]));
}

async function commandRecords(recordPath, label) {
    if (!existsSync(recordPath)) throw new Error(`${label}: journey did not write ${COMMAND_RECORD_NAME}.`);
    const lines = (await readFile(recordPath, "utf8")).split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error(`${label}: ${COMMAND_RECORD_NAME} contains no public CLI command records.`);
    return lines.map((line, index) => {
        let record;
        try { record = JSON.parse(line); } catch { throw new Error(`${label}: command record ${index + 1} is not JSON.`); }
        if (!publicCommand(record) || !Number.isInteger(record.exitCode)) throw new Error(`${label}: command record ${index + 1} must contain a public pokie command and integer exitCode.`);
        if (!Array.isArray(record.artifacts)) throw new Error(`${label}: command record ${index + 1} must record created artifacts.`);
        for (const artifact of record.artifacts) {
            if (!safeArtifactPath(artifact.path) || !/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? "")) throw new Error(`${label}: command record ${index + 1} has an invalid artifact check.`);
        }
        return record;
    });
}

async function runOnce(label, arguments_) {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-journey-"));
    const inputDirectory = path.join(temporaryDirectory, "inputs");
    const artifactDirectory = path.join(temporaryDirectory, "artifacts");
    const recordPath = path.join(temporaryDirectory, COMMAND_RECORD_NAME);
    const provenance = [];
    let transcript = "";
    try {
        await mkdir(inputDirectory);
        await mkdir(artifactDirectory);
        for (const input of arguments_.inputs) {
            if (!existsSync(input)) usage(`input does not exist: ${input}`);
            const destination = path.join(inputDirectory, path.basename(input));
            await cp(input, destination, {recursive: true});
            const stat = await lstat(destination);
            provenance.push(`${input} -> ${destination} (${stat.isDirectory() ? "directory" : `sha256=${await digest(destination)}`})`);
        }
        const result = spawnSync(process.execPath, [arguments_.script], {
            cwd: temporaryDirectory,
            env: {...process.env, P7_JOURNEY_DIR: artifactDirectory, P7_INPUT_DIR: inputDirectory, P7_COMMAND_RECORD_FILE: recordPath},
            encoding: "utf8",
            maxBuffer: 1024 * 1024,
        });
        const records = await commandRecords(recordPath, label);
        const checks = [];
        for (const relativeArtifact of arguments_.expected) {
            const artifact = path.join(artifactDirectory, relativeArtifact);
            if (!existsSync(artifact)) throw new Error(`${label}: expected artifact was not created: ${relativeArtifact}`);
            const sha256 = await digest(artifact);
            const recorded = records.flatMap((record) => record.artifacts).find((entry) => entry.path === relativeArtifact);
            if (!recorded) throw new Error(`${label}: expected artifact lacks public CLI provenance: ${relativeArtifact}`);
            if (recorded.sha256 !== sha256) throw new Error(`${label}: expected artifact hash does not match its command record: ${relativeArtifact}`);
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
