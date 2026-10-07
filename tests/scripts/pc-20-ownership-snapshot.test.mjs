import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "@jest/globals";

test.each(["gone", "live-unverified"])("ownership capture terminates with a %s process between ps and identity lookup", async (mode) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pc20-snapshot-race-"));
    const bin = path.join(directory, "bin"), registry = path.join(directory, "resources.ndjson");
    const secret = randomBytes(32).toString("hex"), operationId = randomBytes(16).toString("hex");
    const record = {schemaVersion:1, operationId, action:"registry-ready", kind:"registry", resourceId:"registry:race-test"};
    const signature = createHash("sha256").update(secret).update("\0").update(JSON.stringify(record)).digest("hex");
    try {
        await mkdir(bin);
        // A stale ps row is real on Linux: the process may be reaped before
        // processSnapshot reads /proc/<pid>/stat. Keep it deterministic here.
        await writeFile(path.join(bin, "ps"), `#!${process.execPath}\nprocess.stdout.write('2147483646 ' + process.ppid + ' S\\n');\n`, {mode:0o755});
        await writeFile(registry, `${JSON.stringify({...record, signature})}\n`);
        const moduleUrl = pathToFileURL(path.resolve("scripts/pc-20-release-completion.mjs")).href;
        const source = `
            import {createPc20OwnershipTracker} from ${JSON.stringify(moduleUrl)};
            if (${JSON.stringify(mode)} === 'live-unverified') {
                const realKill = process.kill;
                process.kill = (pid, signal) => pid === 2147483646 && signal === 0 ? true : realKill(pid, signal);
            }
            const tracker = createPc20OwnershipTracker(process.pid, ${JSON.stringify(registry)}, ${JSON.stringify(secret)}, {operationId:${JSON.stringify(operationId)}});
            try {
                let failure;
                try { tracker.capture({final:true}); } catch (error) { failure = error; }
                if (${JSON.stringify(mode)} === 'live-unverified') {
                    if (!failure?.message.includes('could not retain an identity')) throw new Error('unverified live process was accepted');
                } else if (failure) throw failure;
                if (tracker.ownedProcesses.has(2147483646)) throw new Error('stale PID became signal authority');
                process.stdout.write('captured');
            } finally { tracker.stop(); }
        `;
        const output = execFileSync(process.execPath, ["--input-type=module", "-e", source], {
            encoding:"utf8", timeout:5_000,
            env:{...process.env, PATH:`${bin}${path.delimiter}${process.env.PATH ?? ""}`},
        });
        assert.equal(output, "captured");
    } finally { await rm(directory, {recursive:true, force:true}); }
});
