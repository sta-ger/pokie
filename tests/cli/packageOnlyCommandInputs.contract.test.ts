import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {PACKAGE_ONLY_COMMAND_INPUTS} from "./fixtures/packageOnlyCommandInputs.js";

// Part of the Phase 3 current-state contract (docs/pokie-phase3-inventory.md): freezes exactly which
// public `pokie` commands require an already-loadable game package as their one input, cross-checked
// against the real registered public tree. Private handler parser coverage is deliberately separate
// and must never add a namespace to this public classification.
describe("Phase 3 current-state contract: package-only command inputs", () => {
    it("classifies every and only registered public command", () => {
        const publicCommands = registerCliCommands({
            version: "1.3.0",
            pokiePackageRoot: "/fake/pokie/root",
            clientRoot: "/fake/pokie/root/dist/cli/client",
            studioRoot: "/fake/pokie/root/dist/cli/studio-client",
        }).filter((command) => !command.getName().startsWith("__"));

        expect([...new Set(PACKAGE_ONLY_COMMAND_INPUTS.map((entry) => entry.command))].sort())
            .toEqual(publicCommands.map((command) => command.getName()).sort());
        expect(PACKAGE_ONLY_COMMAND_INPUTS.map((entry) => entry.command))
            .not.toEqual(expect.arrayContaining(["outcomelibrary", "outcomesource", "stakeengine"]));
        for (const entry of PACKAGE_ONLY_COMMAND_INPUTS.filter((candidate) => candidate.requiresLoadablePackage)) {
            expect(publicCommands.find((command) => command.getName() === entry.command)?.getCommanderCommand().helpInformation())
                .toContain("<packageRoot>");
        }
    });

    it("is exactly {client, dev, generate, inspect, replay, serve, sim}", () => {
        const packageOnly = PACKAGE_ONLY_COMMAND_INPUTS.filter((entry) => entry.requiresLoadablePackage)
            .map((entry) => (entry.verb === undefined ? entry.command : `${entry.command} ${entry.verb}`))
            .sort();

        expect(packageOnly).toEqual(["client", "dev", "generate", "inspect", "replay", "serve", "sim"].sort());
    });
});
