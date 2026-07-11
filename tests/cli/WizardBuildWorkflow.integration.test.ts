import fs from "fs";
import os from "os";
import path from "path";
import {SimulationReport} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {GameBlueprintWizard} from "../../cli/wizard/GameBlueprintWizard.js";
import {PromptAdapting} from "../../cli/wizard/PromptAdapting.js";

// A canned-answer test double for PromptAdapting — same shape as GameBlueprintWizard.test.ts's own,
// duplicated here rather than imported since that one is deliberately test-file-local.
class FakePromptAdapting implements PromptAdapting {
    public closed = false;
    private readonly answers: (string | null)[];

    constructor(answers: (string | null)[]) {
        this.answers = [...answers];
    }

    public ask(question: string): Promise<string | null> {
        if (this.answers.length === 0) {
            throw new Error(`FakePromptAdapting ran out of canned answers at question: "${question}"`);
        }
        return Promise.resolve(this.answers.shift() as string | null);
    }

    public close(): void {
        this.closed = true;
    }
}

// End-to-end happy path for "pokie build" with no arguments: BuildCommand's real GameBlueprintWizard
// and GameBlueprintValidator/GamePackageGenerator (only the terminal I/O is faked, via a canned
// PromptAdapting) build a GameBlueprint from scratch, and the resulting package is then run through
// the same rest-of-the-CLI workflow BuildWorkflow.integration.test.ts exercises for the config-driven
// path — proving the wizard hands off a package that's indistinguishable from a hand-written
// <config.json>'s, not a special case the rest of the CLI has to know about.
describe("CLI workflow (integration): pokie build (wizard) output passes validate/sim/report", () => {
    let workDir: string;
    let outDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-wizard-build-workflow-test-"));
        outDir = path.join(workDir, "built-game");
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("builds a package from wizard answers, then validates, simulates, and reports on it", async () => {
        const prompt = new FakePromptAdapting([
            "wizard-slot", // id
            "", // name -> default "Wizard Slot"
            "", // version -> default "0.1.0"
            "", // reels -> default 5
            "", // rows -> default 3
            "A,K,Q", // symbols
            "", // availableBets -> default
            "", // paylines -> default (omitted)
            "3:5,4:10,5:20", // paytable A
            "3:3,4:6,5:12", // paytable K
            "3:2,4:4,5:8", // paytable Q
            "w", // reel weighting mode
            "A:10,K:10,Q:10", // symbol weights
            outDir, // output directory
        ]);

        const buildCommand = new BuildCommand("1.3.0", undefined, undefined, undefined, new GameBlueprintWizard(), () => prompt);
        const buildExitCode = await buildCommand.run([]);

        expect(buildExitCode).toBe(0);
        expect(prompt.closed).toBe(true);
        expect(fs.existsSync(path.join(outDir, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "README.md"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "src", "generated", "index.js"))).toBe(true);

        const buildInfo = JSON.parse(fs.readFileSync(path.join(outDir, "src", "generated", "build-info.json"), "utf-8"));
        expect(buildInfo.game.id).toBe("wizard-slot");

        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);

        const simFile = path.join(workDir, "sim.json");
        await new SimCommand().run([outDir, "--rounds", "300", "--seed", "demo", "--out", simFile]);
        const report = JSON.parse(fs.readFileSync(simFile, "utf-8")) as SimulationReport;
        expect(report.game).toEqual({id: "wizard-slot", name: "Wizard Slot", version: "0.1.0"});
        expect(report.rounds).toBe(300);

        const reportFile = path.join(workDir, "sim.md");
        await new ReportCommand().run([simFile, "--format", "markdown", "--out", reportFile]);
        expect(fs.readFileSync(reportFile, "utf-8")).toContain("# Simulation Report: Wizard Slot");
    });
});
