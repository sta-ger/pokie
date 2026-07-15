import fs from "fs";
import os from "os";
import path from "path";
import {LocalFileExternalDeploymentRuntimeAdapter} from "pokie";

describe("LocalFileExternalDeploymentRuntimeAdapter", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-local-runtime-adapter-test-"));
    });

    afterEach(() => {
        const parentDir = path.dirname(outDir);
        const base = path.basename(outDir);
        for (const name of fs.readdirSync(parentDir)) {
            if (name === base || name.startsWith(`${base}.`)) {
                fs.rmSync(path.join(parentDir, name), {recursive: true, force: true});
            }
        }
    });

    it("delivers by atomically writing every artifact under outDir", async () => {
        const adapter = new LocalFileExternalDeploymentRuntimeAdapter(outDir);

        const result = await adapter.deliver({artifacts: [{relativePath: "index.json", content: `{"a":1}`}], issues: []});

        expect(result.delivered).toBe(true);
        expect(result.details).toEqual({outDir, fileCount: 1});
        expect(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")).toBe(`{"a":1}`);
    });

    it("rejects and leaves the previous output entirely untouched when the underlying write fails", async () => {
        await new LocalFileExternalDeploymentRuntimeAdapter(outDir).deliver({artifacts: [{relativePath: "index.json", content: `{"v":1}`}], issues: []});
        const before = fs.readFileSync(path.join(outDir, "index.json"));

        const failingWriteFile = (): void => {
            throw new Error("simulated disk failure");
        };
        const adapter = new LocalFileExternalDeploymentRuntimeAdapter(outDir, {writeFile: failingWriteFile});

        await expect(adapter.deliver({artifacts: [{relativePath: "index.json", content: `{"v":2}`}], issues: []})).rejects.toThrow("simulated disk failure");

        expect(fs.readFileSync(path.join(outDir, "index.json"))).toEqual(before);
        const parentDir = path.dirname(outDir);
        const base = path.basename(outDir);
        const leftovers = fs.readdirSync(parentDir).filter((name) => name !== base && name.startsWith(`${base}.`));
        expect(leftovers).toEqual([]);
    });

    it("never publishes a partial artifact set when one artifact among several fails to write", async () => {
        let callCount = 0;
        const failingWriteFile = (filePath: string, data: string | Buffer): void => {
            callCount++;
            if (callCount === 2) {
                throw new Error("simulated disk failure");
            }
            fs.writeFileSync(filePath, data);
        };
        const adapter = new LocalFileExternalDeploymentRuntimeAdapter(outDir, {writeFile: failingWriteFile});

        await expect(
            adapter.deliver({
                artifacts: [
                    {relativePath: "a.json", content: "{}"},
                    {relativePath: "b.json", content: "{}"},
                ],
                issues: [],
            }),
        ).rejects.toThrow("simulated disk failure");

        expect(fs.existsSync(outDir) ? fs.readdirSync(outDir) : []).toEqual([]);
    });
});
