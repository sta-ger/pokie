import fs from "fs";
import os from "os";
import path from "path";
import {atomicallyWriteExternalDeploymentArtifactsToDirectory} from "pokie";

function siblingLeftovers(outDir: string): string[] {
    const parentDir = path.dirname(outDir);
    const base = path.basename(outDir);
    return fs.readdirSync(parentDir).filter((name) => name !== base && name.startsWith(`${base}.`));
}

describe("atomicallyWriteExternalDeploymentArtifactsToDirectory", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-externaladapter-atomic-test-"));
        fs.rmSync(outDir, {recursive: true, force: true}); // exercise the "outDir doesn't exist yet" path by default
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

    it("publishes a complete result and leaves no temp/stale siblings when outDir doesn't exist yet", () => {
        const {written, issues} = atomicallyWriteExternalDeploymentArtifactsToDirectory(
            [
                {relativePath: "index.json", content: `{"a":1}`},
                {relativePath: "base/0.json", content: `{"b":2}`},
            ],
            outDir,
        );

        expect(issues).toEqual([]);
        expect(written).toHaveLength(2);
        expect(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")).toBe(`{"a":1}`);
        expect(fs.readFileSync(path.join(outDir, "base", "0.json"), "utf-8")).toBe(`{"b":2}`);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("publishes cleanly on re-delivery too, replacing the old content with no leftovers", () => {
        atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":1}`}], outDir);
        atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":2}`}], outDir);

        expect(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")).toBe(`{"v":2}`);
        expect(fs.readdirSync(outDir)).toEqual(["index.json"]);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("preserves the whole existing output, byte for byte, and leaves no temp directory when a write fails partway through", () => {
        atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":1}`}], outDir);
        const before = fs.readFileSync(path.join(outDir, "index.json"));

        let callCount = 0;
        const failingWriteFile = (filePath: string, data: string | Buffer): void => {
            callCount++;
            if (callCount === 2) {
                throw new Error("simulated disk failure");
            }
            fs.writeFileSync(filePath, data);
        };

        expect(() =>
            atomicallyWriteExternalDeploymentArtifactsToDirectory(
                [
                    {relativePath: "a.json", content: "{}"},
                    {relativePath: "b.json", content: "{}"},
                ],
                outDir,
                {writeFile: failingWriteFile},
            ),
        ).toThrow("simulated disk failure");

        expect(fs.readdirSync(outDir)).toEqual(["index.json"]);
        expect(fs.readFileSync(path.join(outDir, "index.json"))).toEqual(before);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("restores the old outDir byte-for-byte when the publish rename fails after the old directory was moved aside", () => {
        atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":1}`}], outDir);
        const before = fs.readFileSync(path.join(outDir, "index.json"));

        // Call 1 (outDir -> stale) is real; call 2 (tempDir -> outDir, the publish step) is the simulated failure;
        // call 3, if the rollback runs, restores stale -> outDir and must also be real.
        let renameCallCount = 0;
        const failingRenameDirectory = (from: string, to: string): void => {
            renameCallCount++;
            if (renameCallCount === 2) {
                throw new Error("simulated publish rename failure");
            }
            fs.renameSync(from, to);
        };

        expect(() =>
            atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":2}`}], outDir, {
                renameDirectory: failingRenameDirectory,
            }),
        ).toThrow("simulated publish rename failure");

        expect(renameCallCount).toBe(3);
        expect(fs.readFileSync(path.join(outDir, "index.json"))).toEqual(before);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("leaves the stale backup intact and names it in the thrown error when both the publish and the rollback rename fail", () => {
        atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":1}`}], outDir);
        const before = fs.readFileSync(path.join(outDir, "index.json"));

        let renameCallCount = 0;
        const failingRenameDirectory = (from: string, to: string): void => {
            renameCallCount++;
            if (renameCallCount === 1) {
                fs.renameSync(from, to);
                return;
            }
            throw new Error(renameCallCount === 2 ? "simulated publish failure" : "simulated rollback failure");
        };

        let thrown: Error | undefined;
        try {
            atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":2}`}], outDir, {
                renameDirectory: failingRenameDirectory,
            });
        } catch (error) {
            thrown = error as Error;
        }

        expect(renameCallCount).toBe(3);
        expect(thrown?.message).toContain("simulated publish failure");
        expect(thrown?.message).toContain("simulated rollback failure");
        expect(fs.existsSync(outDir)).toBe(false); // never restored — that's exactly why manual recovery is needed

        const siblings = siblingLeftovers(outDir);
        expect(siblings.filter((name) => name.includes(".tmp-"))).toEqual([]);

        const staleSiblings = siblings.filter((name) => name.includes(".stale-"));
        expect(staleSiblings).toHaveLength(1);
        const stalePath = path.join(path.dirname(outDir), staleSiblings[0]);
        expect(thrown?.message).toContain(stalePath);
        expect(fs.readFileSync(path.join(stalePath, "index.json"))).toEqual(before);
    });

    it("reports a warning (not a thrown error) when removing the stale backup fails after a successful publish", () => {
        atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":1}`}], outDir);

        const failingRemoveDirectory = (): void => {
            throw new Error("simulated stale-backup cleanup failure");
        };

        const {issues} = atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":2}`}], outDir, {
            removeDirectory: failingRemoveDirectory,
        });

        expect(issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(issues.some((issue) => issue.code === "external-deployment-stale-output-cleanup-failed" && issue.severity === "warning")).toBe(true);
        expect(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")).toBe(`{"v":2}`); // publish itself succeeded

        const staleDirs = siblingLeftovers(outDir).filter((name) => name.includes(".stale-"));
        expect(staleDirs).toHaveLength(1);
    });

    it("leaves no temp directory when the initial publish rename fails for an outDir that doesn't exist yet", () => {
        const failingRenameDirectory = (): void => {
            throw new Error("simulated initial rename failure");
        };

        expect(() =>
            atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: "{}"}], outDir, {
                renameDirectory: failingRenameDirectory,
            }),
        ).toThrow("simulated initial rename failure");

        expect(fs.existsSync(outDir)).toBe(false);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });
});
