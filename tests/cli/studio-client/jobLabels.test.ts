import {describeJobDiagnostic, describeJobOperation} from "../../../cli/studio-client/src/domain/jobLabels.js";

describe("job labels", () => {
    it("turns internal operation ids into human headings", () => {
        expect(describeJobOperation("project-open-materialization")).toBe("Opening project");
        expect(describeJobOperation("outcome-library-generation")).toBe("Building exact outcome table");
        expect(describeJobOperation("replay")).toBe("Replaying round");
        expect(describeJobOperation("some-new-operation")).toBe("Some new operation");
    });

    it("replaces the audit path with a cause a math author can act on", () => {
        const raw = "audit-execution-mismatch at deliveries[1].disposition.walletPayout: Wallet payout differs from executed domain settlement.";
        expect(describeJobDiagnostic(raw)).toContain("wallet payout differs from the recorded settlement");
        expect(describeJobDiagnostic(raw)).toContain("design may have changed");
        expect(describeJobDiagnostic(raw)).not.toContain("deliveries[");
    });

    it("explains a retained verified prefix without the audit vocabulary", () => {
        expect(describeJobDiagnostic("Replay incomplete; retained verified execution prefix.")).toContain("verified");
        expect(describeJobDiagnostic("Replay incomplete; retained verified execution prefix.")).not.toContain("execution prefix");
    });

    it("keeps an already plain-language message unchanged", () => {
        expect(describeJobDiagnostic("Run the replay again with the captured parameters.")).toBe("Run the replay again with the captured parameters.");
    });

    it("turns restart-only technical wording into an instruction a producer can act on", () => {
        const raw = "Project preparation is not resumable after restart. Reopen the same project to retry.";
        expect(describeJobDiagnostic(raw)).toBe("Studio restarted before this operation finished. Run it again to continue.");
        expect(describeJobDiagnostic(raw)).not.toMatch(/resumable/i);
    });

    it("does not blame a restart for an exact-table record that may already have a current result", () => {
        const raw = "The previous exact outcome-table generation stopped before its checkpoint was validated. If Overview already shows a current exact table, this is only an old interrupted record; dismiss it. Otherwise retry the captured generation from scratch.";
        const human = describeJobDiagnostic(raw);
        expect(human).toContain("If Overview already shows a current exact table");
        expect(human).toContain("dismiss this old record");
        expect(human).not.toMatch(/Studio restarted/i);
        expect(human).not.toMatch(/Outcome Library/);
    });

    it("replaces executor and captured-destination jargon with a producer instruction", () => {
        const raw = "Studio shutdown could not confirm executor cleanup. Inspect the captured destination and saved files, then restart Studio before retrying.";
        const human = describeJobDiagnostic(raw);
        expect(human).toContain("Studio closed before it could confirm this run had finished");
        expect(human).toContain("Your files are unchanged");
        expect(human).not.toMatch(/executor|captured destination/i);
    });

    it("keeps the technical Outcome Library name out of the human summary", () => {
        expect(describeJobDiagnostic("Generated an Outcome Library at /tmp/game.")).toBe("Generated an outcome table at /tmp/game.");
    });

    it("turns raw project path errors into an actionable message", () => {
        const notDirectory = "Could not read \"/tmp/game.blueprint.json/package.json\": ENOTDIR: not a directory, open '/tmp/game.blueprint.json/package.json'";
        expect(describeJobDiagnostic(notDirectory)).toContain("isn't a project folder");
        expect(describeJobDiagnostic(notDirectory)).not.toContain("ENOTDIR");

        const missing = "ENOENT: no such file or directory, open '/tmp/game/package.json'";
        expect(describeJobDiagnostic(missing)).toContain("missing or has moved");
        expect(describeJobDiagnostic(missing)).not.toContain("ENOENT");

        const denied = "EACCES: permission denied, open '/tmp/game/package.json'";
        expect(describeJobDiagnostic(denied)).toContain("permissions");
        expect(describeJobDiagnostic(denied)).not.toContain("EACCES");
    });
});
