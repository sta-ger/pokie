import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {spawnSync} from "node:child_process";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";
import {createPackageExtractionTestEnvironment} from "./fixtures/PackageExtractionFixture.js";

let disposeRuntimeStorage: () => void;
beforeAll(() => {
    // Native child processes inherit the same private storage for every real SDK snapshot.
    disposeRuntimeStorage = createPackageExtractionTestEnvironment({stageRuntime: false, memoryBacked: true});
});
afterAll(() => disposeRuntimeStorage());


it("compares delivered generated Node entries and independently instantiated modules outside Jest source resolution", () => {
    const candidate = emitPublicRuntime({temporaryRoot: os.tmpdir()});
    try {
        // The native proof also recompiles generated TS. Its compiler used to resolve
        // accidentally from the checkout ancestor; declare that test-only tool explicitly.
        fs.symlinkSync(path.resolve("node_modules/typescript"), path.join(candidate.directory, "node_modules/typescript"), "junction");
        const names = new Set<string>();
        // Snapshot dependencies may install process-lifetime exit handlers. Give each
        // bounded group a fresh native process; keep warnings fatal in every group.
        for (let first = 0; first < 34; first += 5) {
            const directory = path.join(candidate.directory, `group-${first}`);
            fs.mkdirSync(directory);
            const result = spawnSync(process.execPath, [path.resolve("tests/fixtures/wasm/verifyDeliveredSharedMath.cjs"), directory, String(first), String(Math.min(first + 5, 34))], {
                // child_process defaults read Node's real environment, not Jest's process.env copy.
                env: {...process.env, TMPDIR: os.tmpdir()}, encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024,
            });
            if (result.stdout) console.log(result.stdout.trim());
            expect({status: result.status, error: result.error?.message, stderr: result.stderr}).toEqual({status: 0, error: undefined, stderr: ""});
            const report = JSON.parse(result.stdout.trim());
            expect(report.native).toBe(true);
            expect(report.fixtureCount).toBe(34);
            expect(report.configurationChecks).toEqual(["lines", "ways", "clusters"]);
            expect(report.negatives).toEqual(["cluster-grid-too-small", "cluster-grid-too-small-explicit", "ways-no-payable-symbols",
                ...(first === 0 ? ["changed-bytes", "swapped-component", "old-abi", "rehashed-code", "rehashed-model-code"] : [])]);
            expect(report.receipts).toHaveLength(Math.min(5, 34 - first));
            for (const receipt of report.receipts as {name: string}[]) {
                expect(names.has(receipt.name)).toBe(false);
                names.add(receipt.name);
            }
        }
        expect(names.size).toBe(34);
    } finally {
        candidate.dispose();
    }
}, 300000);
