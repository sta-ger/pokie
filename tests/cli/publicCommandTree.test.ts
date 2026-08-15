import fs from "fs";
import path from "path";

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
        const supportedBrowserWorkflows = commands
            .filter((command) => command.getName() === "client" || command.getName() === "dev")
            .flatMap((command) => [command.getDescription(), command.getCommanderCommand().helpInformation()]);
        const topLevelBrowserWorkflowHelp = buildUsageText(commands)
            .split("\n")
            .filter((line) => /^\s+(client|dev)\b/.test(line));

        expect(supportedBrowserWorkflows).toHaveLength(4);
        expect([...supportedBrowserWorkflows, ...topLevelBrowserWorkflowHelp].join("\n")).not.toMatch(/\bpreview\b/i);
    });

    it("describes the supported browser workflows as browser UI in the public docs", () => {
        const publicDocs = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "README.md"), "utf-8");

        expect(publicDocs).toContain("`pokie client <packageRoot>`, a universal browser UI talking to");
        expect(publicDocs).toContain("`pokie dev <packageRoot>`, which runs both together and opens the browser UI;");
        expect(publicDocs).toContain("| Browser UI for a running `pokie serve` | `pokie client <packageRoot>` |");
        expect(publicDocs).toContain("| `pokie serve` + `pokie client` together, with its browser UI auto-opened | `pokie dev <packageRoot>` |");
        expect(publicDocs).not.toMatch(/\bbrowser preview UI\b/i);
        expect(publicDocs).toMatch(/previewing a deterministic\s+diff by default/);
    });
});
