import fs from "fs";
import os from "os";
import path from "path";
import {SimulationReport} from "pokie";
import {InitCommand} from "../../cli/commands/InitCommand.js";
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

// Answers every question with Enter (an empty line), without a fixed queue to run out of — the whole
// point of the Enter-only test below is that no question ever *needs* a typed answer, so a canned
// list of the right length would quietly encode the very thing under test.
class AlwaysEnterPrompt implements PromptAdapting {
    public readonly questions: string[] = [];
    public closed = false;

    public ask(question: string): Promise<string | null> {
        this.questions.push(question);
        return Promise.resolve("");
    }

    public close(): void {
        this.closed = true;
    }
}

// End-to-end happy path for "pokie init" with no name: InitCommand's real GameBlueprintWizard (moved
// here from "pokie build", which no longer offers it) and GameBlueprintValidator/GamePackageGenerator
// (only the terminal I/O is faked, via a canned PromptAdapting) build a GameBlueprint from scratch, the
// resulting package is verified on the spot (PokieGamePackageValidator, the same check "pokie validate"
// runs), and is then run through the same rest-of-the-CLI workflow BuildWorkflow.integration.test.ts
// exercises for the config-driven path — proving the wizard hands off a package that's
// indistinguishable from a hand-written <config.json>'s, not a special case the rest of the CLI has to
// know about.
describe("CLI workflow (integration): pokie init (wizard) output passes validate/sim/report", () => {
    let workDir: string;
    let outDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-wizard-init-workflow-test-"));
        outDir = path.join(workDir, "built-game");
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("prepares a package from wizard answers, then validates, simulates, and reports on it", async () => {
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

        const initCommand = new InitCommand("1.3.0", undefined, undefined, undefined, undefined, new GameBlueprintWizard(), () => prompt);
        const initExitCode = await initCommand.run([]);

        expect(initExitCode).toBe(0);
        expect(prompt.closed).toBe(true);
        expect(fs.existsSync(path.join(outDir, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "README.md"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "dist", "index.js"))).toBe(true);

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const game = require(path.join(outDir, "dist", "index.js")) as {getManifest(): {id: string}};
        expect(game.getManifest().id).toBe("wizard-slot");

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

    // The Enter-only contract, end to end. Nothing here is typed: the run accepts the suggested game
    // id/name, the default reels/rows/symbols/bets, the default payouts for every symbol, the default
    // reel weighting, and the default output directory. Reaching exit code 0 at all already proves the
    // paytable defaults were applied — an Enter-only run used to produce an empty paytable, which
    // GameBlueprintValidator rejects with "blueprint-paytable-empty" before anything is written.
    it("prepares, validates and simulates a package when every question is answered with Enter", async () => {
        const prompt = new AlwaysEnterPrompt();
        // The default output directory is resolved against the process working directory, so it's
        // pointed at the temp dir — otherwise accepting that default (which is the point of the test)
        // would write a package into the repository.
        const cwdSpy = jest.spyOn(process, "cwd").mockReturnValue(workDir);

        try {
            const initCommand = new InitCommand("1.3.0", undefined, undefined, undefined, undefined, new GameBlueprintWizard(), () => prompt);
            const initExitCode = await initCommand.run([]);

            expect(initExitCode).toBe(0);
            expect(prompt.closed).toBe(true);
            expect(prompt.questions.length).toBeGreaterThan(0);

            // The wizard suggests a fresh random id per run, so the package directory is discovered
            // rather than hardcoded — exactly one is expected to have been created.
            const created = fs.readdirSync(workDir);
            expect(created).toHaveLength(1);
            const projectRoot = path.join(workDir, created[0]);

            expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(true);

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const game = require(path.join(projectRoot, "dist", "index.js")) as {getManifest(): {id: string}};
            expect(game.getManifest().id).toBe(created[0]);

            expect(await new ValidateCommand().run([projectRoot])).toBe(0);

            const simFile = path.join(workDir, "enter-only-sim.json");
            await new SimCommand().run([projectRoot, "--rounds", "200", "--seed", "demo", "--out", simFile]);

            const report = JSON.parse(fs.readFileSync(simFile, "utf-8")) as SimulationReport;
            expect(report.rounds).toBe(200);
            expect(report.game.id).toBe(created[0]);
        } finally {
            cwdSpy.mockRestore();
        }
    });
});
