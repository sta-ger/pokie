import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runner = path.join(root, "scripts/run-phase7-journey.mjs");

async function driver(directory, source) {
    const file = path.join(directory, "journey.mjs");
    await writeFile(file, source);
    return file;
}

function run(script, evidence, input) {
    const arguments_ = [runner, "--script", script, "--evidence-dir", evidence, "--expect", "result.txt"];
    if (input) arguments_.push("--input", input);
    return spawnSync(process.execPath, arguments_, {encoding: "utf8"});
}

const recordingDriver = `
import {appendFile, writeFile, readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const artifact = process.env.P7_JOURNEY_DIR + "/result.txt";
await writeFile(artifact, "created by pokie");
const sha256 = createHash("sha256").update(await readFile(artifact)).digest("hex");
await appendFile(process.env.P7_COMMAND_RECORD_FILE, JSON.stringify({command: ["pokie", "build", "input"], exitCode: 0, artifacts: [{path: "result.txt", sha256}]}) + "\\n");
`;

test("retains command-level records and two distinct clean-room reruns", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-journey-test-"));
    try {
        const input = path.join(directory, "input.txt");
        await writeFile(input, "journey input");
        const result = run(await driver(directory, recordingDriver), path.join(directory, "evidence"), input);
        assert.equal(result.status, 0, result.stderr);
        const transcript = await readFile(path.join(directory, "evidence/journey-transcript.txt"), "utf8");
        assert.match(transcript, /PUBLIC_CLI_COMMAND \["pokie","build","input"\] EXIT 0/);
        const workdirs = [...transcript.matchAll(/WORKDIR (.+)/g)].map((match) => match[1]);
        assert.equal(new Set(workdirs).size, 2);
        assert.match(transcript, /INPUT_PROVENANCE .*input.txt/);
        assert.match(transcript, /ARTIFACT_CHECK result.txt sha256=/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects missing and invalid expected-artifact command records", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-journey-test-"));
    try {
        const missing = run(await driver(directory, "process.exitCode = 0;"), path.join(directory, "missing"));
        assert.equal(missing.status, 1);
        assert.match(missing.stderr, /did not write public-cli-commands.jsonl/);
        const invalid = run(await driver(directory, `
import {appendFile, writeFile} from "node:fs/promises";
await writeFile(process.env.P7_JOURNEY_DIR + "/result.txt", "unprovenanced");
await appendFile(process.env.P7_COMMAND_RECORD_FILE, JSON.stringify({command: "pokie build", exitCode: 0, artifacts: []}) + "\\n");
`), path.join(directory, "invalid"));
        assert.equal(invalid.status, 1);
        assert.match(invalid.stderr, /lacks public CLI provenance/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});
