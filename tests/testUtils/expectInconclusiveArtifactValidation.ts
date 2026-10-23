import fs from "fs";
import os from "os";
import path from "path";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";

// Structural validation remains successful. A declaration-only artifact cannot
// prove the originating executable's transition model; the public CLI returns 2.
export async function expectInconclusiveArtifactValidation(args: string[]): Promise<void> {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-validation-contract-"));
    const output = path.join(directory, "validation.json");
    try {
        expect(await new ValidateCommand().run([...args, "--out", output])).toBe(2);
        const report = JSON.parse(fs.readFileSync(output, "utf8"));
        expect(report).toMatchObject({valid: true, errors: [], advanced: {verdict: "inconclusive"}});
        expect(["failed", "cancelled", "invalid"]).not.toContain(report.advanced.status);
        expect(report.advanced.issues.filter((issue: {severity: string}) => issue.severity === "error")).toEqual([]);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
}
