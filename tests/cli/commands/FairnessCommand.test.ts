import fs from "fs";
import os from "os";
import path from "path";
import {FairnessCommand} from "../../../cli/commands/FairnessCommand.js";

describe("FairnessCommand --out diagnostics", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-fairness-out-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("rejects a folder --out destination before attempting to write a commitment", async () => {
        const out = path.join(workDir, "folder.json");
        fs.mkdirSync(out);
        const writeFile = jest.fn();
        const command = new FairnessCommand(
            undefined,
            undefined,
            undefined,
            undefined,
            () => ({schemaVersion: 1, algorithmVersion: "pokie-fairness-hmac-sha256-v1", serverSeedHash: "sha256:x", issuedAt: new Date().toISOString()}),
            undefined,
            () => "correct horse battery staple",
            () => false,
            writeFile,
        );

        await expect(command.run(["seed-commit", "server-seed.txt", "--out", out, "--overwrite"])).rejects.toThrow(
            `"${out}" is a folder, not a file. Choose a different file path.`,
        );
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("treats a dangling --out symlink as occupied and never writes its target", async () => {
        const seed = path.join(workDir, "server-seed.txt");
        fs.writeFileSync(seed, "correct horse battery staple");
        const target = path.join(workDir, "external.json");
        const out = path.join(workDir, "dangling.json");
        fs.symlinkSync(target, out);
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            await expect(new FairnessCommand().run(["seed-commit", seed, "--out", out])).rejects.toThrow(
                `"${out}" already exists. Rerun with --overwrite to replace it.`,
            );
            expect(fs.existsSync(target)).toBe(false);
            expect(fs.readlinkSync(out)).toBe(target);
        } finally {
            log.mockRestore();
        }
    });
});
