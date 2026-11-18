import fs from "fs";
import path from "path";

import {registerCliCommands} from "../../cli/registerCliCommands.js";

const ROOT = path.join(__dirname, "..", "..");
const PUBLIC_COMMANDS = [
    "build",
    "certification",
    "client",
    "create",
    "dev",
    "diff",
    "edit",
    "fairness",
    "generate",
    "import",
    "init",
    "inspect",
    "par",
    "optimize",
    "reel",
    "run",
    "replay",
    "report",
    "sample",
    "serve",
    "sim",
    "validate",
];
const NESTED_VERBS = [
    "certification build",
    "certification verify",
    "fairness commit",
    "fairness reveal",
    "fairness seed-commit",
    "fairness verify",
    "par export",
    "par import",
    "reel generate",
];

describe("public CLI command tree", () => {
    const commands = registerCliCommands({
        version: "2.0.0",
        pokiePackageRoot: "/fake/pokie/root",
        clientRoot: "/fake/pokie/root/dist/cli/client",
        studioRoot: "/fake/pokie/root/dist/cli/studio-client",
    });

    it("registers every public command and documents the maintained surface", () => {
        const publicNames = commands
            .filter((command) => !command.getName().startsWith("__"))
            .map((command) => command.getName());
        const maintainedDocumentation = ["README.md", "docs/README.md", "docs/cli.md", "docs/studio-frontend.md"]
            .map((file) => fs.readFileSync(path.join(ROOT, file), "utf-8"))
            .join("\n");

        expect(publicNames).toEqual(PUBLIC_COMMANDS);
        expect(maintainedDocumentation).toContain("pokie optimize");
        expect(maintainedDocumentation).not.toMatch(
            /\bpokie (?:export|studio|__studio|outcomelibrary|outcomesource|stakeengine|name)\b/,
        );
    });

    it("renders help for every public command and nested verb", () => {
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
        expect(studio?.getCommanderCommand().helpInformation()).toContain(
            "Usage: pokie [options] [projectRoot] [excess...]",
        );
        expect(studio?.getCommanderCommand().helpInformation()).not.toContain("Usage: studio");
    });
});
