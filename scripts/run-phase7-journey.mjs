#!/usr/bin/env node
/** Run a Phase 7 workflow twice in isolated directories and retain only bounded text evidence. */
import {cp, lstat, mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";

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
    if (result.expected.some((entry) => path.isAbsolute(entry) || entry.includes(".."))) usage("--expect paths must be relative and cannot escape the journey directory.");
    return result;
}

async function digest(target) {
    const contents = await (await import("node:fs/promises")).readFile(target);
    return createHash("sha256").update(contents).digest("hex");
}

async function runOnce(label, arguments_) {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-journey-"));
    const inputDirectory = path.join(temporaryDirectory, "inputs");
    const artifactDirectory = path.join(temporaryDirectory, "artifacts");
    await mkdir(inputDirectory);
    await mkdir(artifactDirectory);
    const provenance = [];
    for (const input of arguments_.inputs) {
        if (!existsSync(input)) usage(`input does not exist: ${input}`);
        const destination = path.join(inputDirectory, path.basename(input));
        await cp(input, destination, {recursive: true});
        const stat = await lstat(destination);
        provenance.push(`${input} -> ${destination} (${stat.isDirectory() ? "directory" : `sha256=${await digest(destination)}`})`);
    }
    const result = spawnSync(process.execPath, [arguments_.script], {
        cwd: temporaryDirectory,
        env: {...process.env, P7_JOURNEY_DIR: artifactDirectory, P7_INPUT_DIR: inputDirectory},
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
    });
    const checks = [];
    for (const relativeArtifact of arguments_.expected) {
        const artifact = path.join(artifactDirectory, relativeArtifact);
        if (!existsSync(artifact)) throw new Error(`${label}: expected artifact was not created: ${relativeArtifact}`);
        checks.push(`${relativeArtifact} sha256=${await digest(artifact)}`);
    }
    const transcript = [
        `RUN ${label}`,
        `WORKDIR ${temporaryDirectory}`,
        `COMMAND ${process.execPath} ${JSON.stringify(arguments_.script)}`,
        `EXIT ${result.status ?? 1}`,
        ...provenance.map((entry) => `INPUT_PROVENANCE ${entry}`),
        ...checks.map((entry) => `ARTIFACT_CHECK ${entry}`),
        "STDOUT",
        (result.stdout ?? "").slice(0, 16000),
        "STDERR",
        (result.stderr ?? "").slice(0, 16000),
    ].join("\n");
    await rm(temporaryDirectory, {recursive: true, force: true});
    if (result.error || result.status !== 0) throw new Error(`${label}: journey failed\n${transcript}`);
    return transcript;
}

const arguments_ = argumentsFrom(process.argv);
Promise.all([])
    .then(async () => {
        const first = await runOnce("primary", arguments_);
        const second = await runOnce("independent-rerun", arguments_);
        await mkdir(arguments_.evidenceDir, {recursive: true});
        await writeFile(path.join(arguments_.evidenceDir, "journey-transcript.txt"), `${first}\nINDEPENDENT_RERUN\n${second}\n`);
        console.log("P7_JOURNEY_PASS independent rerun completed");
    })
    .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
