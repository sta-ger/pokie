import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {CertificationCommand} from "../../../cli/commands/CertificationCommand.js";
import {CreateCommand} from "../../../cli/commands/CreateCommand.js";
import {DiffCommand} from "../../../cli/commands/DiffCommand.js";
import {EditCommand} from "../../../cli/commands/EditCommand.js";
import {FairnessCommand} from "../../../cli/commands/FairnessCommand.js";
import {GenerateCommand} from "../../../cli/commands/GenerateCommand.js";
import {ImportCommand} from "../../../cli/commands/ImportCommand.js";
import {OptimizeCommand} from "../../../cli/commands/OptimizeCommand.js";
import {ParCommand} from "../../../cli/commands/ParCommand.js";
import {ReelCommand} from "../../../cli/commands/ReelCommand.js";
import {ReplayCommand} from "../../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../../cli/commands/SimCommand.js";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand.js";

// An explicit `--out=` must never be read as "no --out": before this check, build silently published
// into the current directory, sim/validate/report/diff/replay wrote nothing but exited 0, and fairness
// leaked a raw ENOENT for "". All of them are parsed before any project/file work, so every case below
// can use placeholder paths.
describe("explicitly empty --out values", () => {
    const cases: Array<[string, () => {run(args: string[]): Promise<unknown>}, string[]]> = [
        ["build", () => new BuildCommand("2.0.0"), ["missing.json", "--target", "tsPackage", "--out="]],
        ["certification build", () => new CertificationCommand("2.0.0"), ["build", "library", "config.json", "--out="]],
        ["create", () => new CreateCommand("2.0.0"), ["placeholder", "--blank", "--out="]],
        ["diff", () => new DiffCommand(), ["left.json", "right.json", "--out="]],
        ["edit", () => new EditCommand(), ["blueprint.json", "--out="]],
        ["fairness seed-commit", () => new FairnessCommand(), ["seed-commit", "server-seed.txt", "--out="]],
        ["fairness commit", () => new FairnessCommand(), ["commit", "commitment.json", "--client-seed", "client", "--nonce", "1", "--source", "library", "--out="]],
        ["fairness reveal", () => new FairnessCommand(), ["reveal", "commitment.json", "--server-seed", "server-seed.txt", "--source", "library", "--out="]],
        ["generate", () => new GenerateCommand("2.0.0"), ["package", "--out="]],
        ["import", () => new ImportCommand("2.0.0"), ["source.xlsx", "--out="]],
        ["par import", () => new ParCommand("2.0.0"), ["import", "source.xlsx", "--out="]],
        ["par export", () => new ParCommand("2.0.0"), ["export", "blueprint.json", "--out="]],
        ["reel generate", () => new ReelCommand(), ["generate", "blueprint.json", "--out="]],
        ["replay", () => new ReplayCommand(), ["package", "--round", "1", "--out="]],
        ["report", () => new ReportCommand(), ["sim.json", "--out="]],
        ["sim", () => new SimCommand(), ["package", "--out="]],
        ["validate", () => new ValidateCommand(), ["project", "--out="]],
    ];

    it.each(cases)("rejects empty --out for %s before touching its inputs", async (_name, create, args) => {
        await expect(Promise.resolve().then(() => create().run(args))).rejects.toThrow(/--out requires a non-empty .*path/);
    });

    it("reports empty --out for optimize as an invalid request instead of silently discarding a candidate", async () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const exitCode = await new OptimizeCommand().run(["source", "--policy", "policy.json", "--out="]);
            expect(exitCode).not.toBe(0);
            const result = JSON.parse(log.mock.calls[0][0] as string) as {
                status: string;
                diagnostics: Array<{path: string; message: string}>;
            };
            expect(result.status).toBe("invalid");
            expect(result.diagnostics).toEqual([
                expect.objectContaining({path: "out", message: expect.stringContaining("--out requires a non-empty output path")}),
            ]);
        } finally {
            log.mockRestore();
        }
    });
});
