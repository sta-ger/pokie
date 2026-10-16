import path from "node:path";
import {spawnSync} from "node:child_process";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";

it("compares delivered generated Node entries and independently instantiated modules outside Jest source resolution", () => {
    const candidate = emitPublicRuntime();
    try {
        const result = spawnSync(process.execPath, [path.resolve("tests/fixtures/wasm/verifyDeliveredSharedMath.cjs"), candidate.directory], {encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024});
        if (result.stdout) console.log(result.stdout.trim());
        expect({status: result.status, error: result.error?.message, stderr: result.stderr}).toEqual({status: 0, error: undefined, stderr: ""});
        const report = JSON.parse(result.stdout.trim());
        expect(report.native).toBe(true);
        expect(report.negatives).toEqual(["changed-bytes", "swapped-component", "old-abi", "rehashed-code", "rehashed-model-code"]);
        expect(report.receipts).toHaveLength(34);
    } finally {
        candidate.dispose();
    }
}, 180000);
