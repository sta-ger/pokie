import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {buildUsageText} from "../../cli/usageText.js";

describe("public command tree", () => {
    const commands = registerCliCommands({
        version: "1.3.0",
        pokiePackageRoot: "/fake/pokie/root",
        clientRoot: "/fake/pokie/root/dist/cli/client",
        studioRoot: "/fake/pokie/root/dist/cli/studio-client",
    });

    it("uses generic project verbs and keeps Studio implicit", () => {
        const names = commands.map((command) => command.getName());
        const help = buildUsageText(commands);

        expect(names).toEqual(expect.arrayContaining(["export", "generate", "import", "sample"]));
        expect(names).not.toEqual(expect.arrayContaining(["name", "outcomelibrary", "outcomesource", "par", "stakeengine", "studio"]));
        expect(help).toContain("export");
        expect(help).not.toMatch(/pokie (name|outcomelibrary|outcomesource|par|stakeengine|studio)\b/);
    });

    it("does not label the supported browser workflows as previews", () => {
        const supportedBrowserWorkflowDescriptions = commands
            .filter((command) => command.getName() === "client" || command.getName() === "dev")
            .map((command) => command.getDescription());

        expect(supportedBrowserWorkflowDescriptions).toHaveLength(2);
        expect(supportedBrowserWorkflowDescriptions.join("\n")).not.toMatch(/\bpreview\b/i);
    });
});
