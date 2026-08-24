#!/usr/bin/env node
/** Run a Phase 7 workflow twice in clean rooms and retain wrapper-observed CLI evidence. */
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {spawn, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const MAX_INPUT_PROVENANCE_ENTRIES = 128;

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

function wrapperSource(socketPath) {
    return `#!/usr/bin/env node
import net from "node:net";
const socket = net.createConnection(${JSON.stringify(socketPath)});
let response = "";
socket.on("connect", () => socket.end(JSON.stringify({args: process.argv.slice(2)}) + "\\n"));
socket.on("data", (chunk) => { response += chunk; });
socket.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
socket.on("close", () => {
    try {
        const result = JSON.parse(response);
        process.stdout.write(result.stdout ?? "");
        process.stderr.write(result.stderr ?? "");
        process.exitCode ??= result.exitCode;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
});
`;
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

function driverResult(script, temporaryDirectory, environment) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [script], {cwd: temporaryDirectory, env: environment, encoding: "utf8"});
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", (error) => resolve({status: 1, stdout, stderr: `${stderr}${error.message}`}));
        child.on("close", (status) => resolve({status: status ?? 1, stdout, stderr}));
    });
}

async function wrapperServer(socketPath, cli, artifactDirectory, expected, records) {
    const server = net.createServer({allowHalfOpen: true}, (connection) => {
        let request = "";
        connection.on("data", (chunk) => { request += chunk; });
        connection.on("end", async () => {
            try {
                const parsed = JSON.parse(request);
                if (!Array.isArray(parsed.args) || parsed.args.some((argument) => typeof argument !== "string")) throw new Error("invalid public CLI request");
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
                const exitCode = result.error ? 1 : (result.status ?? 1);
                records.push({command: ["pokie", ...parsed.args], exitCode, artifacts});
                connection.end(JSON.stringify({exitCode, stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}${result.error?.message ?? ""}`}));
            } catch (error) { connection.end(JSON.stringify({exitCode: 1, stderr: error instanceof Error ? error.message : String(error)})); }
        });
    });
    await new Promise((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
    return server;
}

async function runOnce(label, arguments_) {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-journey-"));
    const inputDirectory = path.join(temporaryDirectory, "inputs");
    const artifactDirectory = path.join(temporaryDirectory, "artifacts");
    const wrapperPath = path.join(temporaryDirectory, "invoke-public-pokie.mjs");
    const socketPath = path.join(temporaryDirectory, "public-cli.sock");
    const provenance = [];
    const records = [];
    let transcript = "";
    try {
        await mkdir(inputDirectory);
        await mkdir(artifactDirectory);
        await writeFile(wrapperPath, wrapperSource(socketPath), {mode: 0o700});
        for (const input of arguments_.inputs) {
            if (!existsSync(input)) usage(`input does not exist: ${input}`);
            const destination = path.join(inputDirectory, path.basename(input));
            await cp(input, destination, {recursive: true});
            const stat = await lstat(destination);
            provenance.push(`${input} -> ${destination} (${stat.isDirectory() ? await directoryProvenance(destination) : `sha256=${await digest(destination)}`})`);
        }
        const server = await wrapperServer(socketPath, arguments_.cli, artifactDirectory, arguments_.expected, records);
        const result = await driverResult(arguments_.script, temporaryDirectory, {...process.env, P7_JOURNEY_DIR: artifactDirectory, P7_INPUT_DIR: inputDirectory, P7_PUBLIC_CLI: wrapperPath});
        await new Promise((resolve) => server.close(resolve));
        if (records.length === 0) throw new Error(`${label}: journey did not invoke the wrapper-controlled public CLI.`);
        const checks = [];
        for (const relativeArtifact of arguments_.expected) {
            const artifact = path.join(artifactDirectory, relativeArtifact);
            if (!existsSync(artifact)) throw new Error(`${label}: expected artifact was not created: ${relativeArtifact}`);
            const sha256 = await digest(artifact);
            const recorded = records.filter((record) => record.exitCode === 0).flatMap((record) => record.artifacts).find((entry) => entry.path === relativeArtifact && entry.sha256 === sha256);
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
