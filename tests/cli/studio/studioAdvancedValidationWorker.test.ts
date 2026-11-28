import fs from "fs";
import os from "os";
import path from "path";
import {StudioAdvancedValidationWorker} from "../../../cli/studio/validation/StudioAdvancedValidationWorker.js";

function temporaryWorker(source: string): {root: string; entry: string} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-advanced-worker-"));
    const entry = path.join(root, "entry.js");
    fs.writeFileSync(entry, source);
    return {root, entry};
}

describe("StudioAdvancedValidationWorker", () => {
    const roots: string[] = [];
    afterEach(() => {
        for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
    });

    it("returns a report posted by the worker", async () => {
        const {root, entry} = temporaryWorker(`
const {parentPort} = require("node:worker_threads");
parentPort.ref();
parentPort.postMessage({report: {schemaVersion: 1, status: "unsupported", marker: "from-worker"}});
`);
        roots.push(root);
        const validator = new StudioAdvancedValidationWorker("/does/not/matter", entry);

        await expect(validator.validate("ignored")).resolves.toMatchObject({schemaVersion: 1, marker: "from-worker"});
    });

    it("turns an aborted request into the validator's normal cancelled report", async () => {
        const {root, entry} = temporaryWorker(`
const {parentPort} = require("node:worker_threads");
parentPort.ref();
setInterval(() => undefined, 1000);
`);
        roots.push(root);
        const validator = new StudioAdvancedValidationWorker("/does/not/matter", entry);
        const controller = new AbortController();
        const pending = validator.validate("ignored", {signal: controller.signal});
        controller.abort();

        await expect(pending).resolves.toMatchObject({status: "cancelled"});
    });

    it("falls back to the in-process validator when the worker entry is absent", async () => {
        const validator = new StudioAdvancedValidationWorker("/does/not/matter", path.join(os.tmpdir(), "missing-advanced-worker.js"));

        await expect(validator.validate("ignored", {signal: AbortSignal.abort()})).resolves.toMatchObject({status: "cancelled"});
    });
});
