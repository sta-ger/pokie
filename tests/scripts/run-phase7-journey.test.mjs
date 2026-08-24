import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runner = path.join(root, "scripts/run-phase7-journey.mjs");

async function driver(directory, source) {
    const file = path.join(directory, "journey.mjs");
    await writeFile(file, source);
    return file;
}

async function cli(directory) {
const file = path.join(directory, "pokie.mjs");
    await writeFile(file, `
import {writeFile} from "node:fs/promises";
const out = process.argv.indexOf("--out");
if (out >= 0) await writeFile(process.argv[out + 1], "created by public pokie");
if (process.argv.includes("--fail")) process.exitCode = 2;
`);
    return file;
}

function run(cliPath, script, evidence, input) {
    const arguments_ = [runner, "--cli", cliPath, "--script", script, "--evidence-dir", evidence, "--expect", "result.txt"];
    if (input) arguments_.push("--input", input);
    return spawnSync(process.execPath, arguments_, {encoding: "utf8"});
}

const recordingDriver = `
import {spawnSync} from "node:child_process";
const result = spawnSync(process.env.P7_PUBLIC_CLI, ["build", "--out", "result.txt"], {encoding: "utf8"});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exitCode = result.status;
`;

test("retains wrapper-observed public commands and two distinct clean-room reruns", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-journey-test-"));
    try {
        const input = path.join(directory, "input.txt");
        await writeFile(input, "journey input");
        const result = run(await cli(directory), await driver(directory, recordingDriver), path.join(directory, "evidence"), input);
        assert.equal(result.status, 0, result.stderr);
        const transcript = await readFile(path.join(directory, "evidence/journey-transcript.txt"), "utf8");
        assert.match(transcript, /PUBLIC_CLI_COMMAND \["pokie","build","--out","result.txt"\] EXIT 0/);
        const workdirs = [...transcript.matchAll(/WORKDIR (.+)/g)].map((match) => match[1]);
        assert.equal(new Set(workdirs).size, 2);
        assert.match(transcript, /INPUT_PROVENANCE .*input.txt/);
        assert.match(transcript, /ARTIFACT_CHECK result.txt sha256=/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects direct artifact writes and forged legacy command records", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-journey-test-"));
    try {
        const direct = await driver(directory, `
import {appendFile, writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
await writeFile(process.env.P7_JOURNEY_DIR + "/result.txt", "forged directly");
const sha256 = createHash("sha256").update("forged directly").digest("hex");
await appendFile(process.env.P7_COMMAND_RECORD_FILE ?? "forged.jsonl", JSON.stringify({command: ["pokie", "build"], exitCode: 0, artifacts: [{path: "result.txt", sha256}]}) + "\\n");
`);
        const result = run(await cli(directory), direct, path.join(directory, "direct"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /did not invoke the wrapper-controlled public CLI/);
        const mixed = await driver(directory, `
import {spawnSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
await writeFile(process.env.P7_JOURNEY_DIR + "/result.txt", "direct before wrapper");
const result = spawnSync(process.env.P7_PUBLIC_CLI, ["inspect"], {encoding: "utf8"});
process.exitCode = result.status;
`);
        const mixedResult = run(await cli(directory), mixed, path.join(directory, "mixed"));
        assert.equal(mixedResult.status, 1);
        assert.match(mixedResult.stderr, /lacks wrapper-observed public CLI provenance/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects a driver that replaces its wrapper and an artifact from a nonzero command", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-journey-test-"));
    try {
        const replacedWrapper = await driver(directory, `
import {chmod, writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
await writeFile(process.env.P7_PUBLIC_CLI, '#!/usr/bin/env node\\nimport {writeFile} from "node:fs/promises"; await writeFile(process.env.P7_JOURNEY_DIR + "/result.txt", "forged");');
await chmod(process.env.P7_PUBLIC_CLI, 0o700);
const result = spawnSync(process.env.P7_PUBLIC_CLI, [], {encoding: "utf8"});
process.exitCode = result.status;
`);
        const replacementResult = run(await cli(directory), replacedWrapper, path.join(directory, "replaced"));
        assert.equal(replacementResult.status, 1);
        assert.match(replacementResult.stderr, /did not invoke the wrapper-controlled public CLI/);
        const failedPublicCommand = await driver(directory, `
import {spawnSync} from "node:child_process";
const result = spawnSync(process.env.P7_PUBLIC_CLI, ["build", "--out", "result.txt", "--fail"], {encoding: "utf8"});
process.exitCode = 0;
`);
        const failedResult = run(await cli(directory), failedPublicCommand, path.join(directory, "failed-command"));
        assert.equal(failedResult.status, 1);
        assert.match(failedResult.stderr, /lacks wrapper-observed public CLI provenance/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("retains a bounded recursive manifest for directory inputs", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-journey-test-"));
    try {
        const input = path.join(directory, "input-directory");
        await mkdir(path.join(input, "nested"), {recursive: true});
        await writeFile(path.join(input, "nested", "input.txt"), "journey input");
        const result = run(await cli(directory), await driver(directory, recordingDriver), path.join(directory, "evidence"), input);
        assert.equal(result.status, 0, result.stderr);
        const transcript = await readFile(path.join(directory, "evidence/journey-transcript.txt"), "utf8");
        assert.match(transcript, /directory files=1 manifest-sha256=/);
        assert.match(transcript, /nested\/input.txt sha256=/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});
