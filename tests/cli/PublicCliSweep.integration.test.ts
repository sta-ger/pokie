import fs from "fs";
import path from "path";

import {registerCliCommands} from "../../cli/registerCliCommands.js";

const ROOT = path.join(__dirname, "..", "..");
const PUBLIC_COMMANDS = [
    "build", "certification", "client", "create", "dev", "diff", "edit", "export", "fairness", "generate", "init", "import", "inspect", "par", "reel", "replay", "report", "serve", "sample", "sim", "validate",
];
const NESTED_VERBS = [
    "certification build", "certification verify", "fairness commit", "fairness reveal", "fairness seed-commit", "fairness verify", "par export", "par import", "reel generate",
];

describe("PC-15 public CLI sweep contract", () => {
    const commands = registerCliCommands({
        version: "1.3.0",
        pokiePackageRoot: "/fake/pokie/root",
        clientRoot: "/fake/pokie/root/dist/cli/client",
        studioRoot: "/fake/pokie/root/dist/cli/studio-client",
    });

    it("keeps the registered command tree, maintained docs, and inventory on the complete public contract", () => {
        const publicNames = commands.filter((command) => !command.getName().startsWith("__")).map((command) => command.getName());
        const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "evidence", "p7-01-cli-inventory", "coverage-map.json"), "utf-8")) as {
            initialInventory: {rootCommands: string[]; nestedVerbs: string[]};
        };
        const maintainedDocumentation = ["README.md", "docs/README.md", "docs/cli.md", "docs/studio-frontend.md"]
            .map((file) => fs.readFileSync(path.join(ROOT, file), "utf-8"))
            .join("\n");

        expect(publicNames).toEqual(PUBLIC_COMMANDS);
        expect(inventory.initialInventory).toEqual({rootCommands: PUBLIC_COMMANDS, nestedVerbs: NESTED_VERBS});
        expect(maintainedDocumentation).not.toMatch(/\bpokie (?:studio|__studio|outcomelibrary|outcomesource|stakeengine|name)\b/);
    });

    it("renders help for every public command, nested verb, and implicit Studio entry without legacy names", () => {
        for (const command of commands.filter((candidate) => !candidate.getName().startsWith("__"))) {
            const help = command.getCommanderCommand().helpInformation();
            expect(help).toContain(`Usage: ${command.getName()}`);
            expect(help).not.toMatch(/\b(?:__studio|outcomesource)\b/);
        }

        for (const verb of NESTED_VERBS) {
            const [parentName, childName] = verb.split(" ");
            const parent = commands.find((command) => command.getName() === parentName)?.getCommanderCommand();
            const child = parent?.commands.find((command) => command.name() === childName);
            expect(child?.helpInformation()).toContain(`Usage: ${parentName} ${childName}`);
        }

        const studio = commands.find((command) => command.getName() === "__studio");
        expect(studio?.getCommanderCommand().helpInformation()).toContain("Usage: pokie [options] [projectRoot] [excess...]");
        expect(studio?.getCommanderCommand().helpInformation()).not.toContain("Usage: studio");
    });
});
