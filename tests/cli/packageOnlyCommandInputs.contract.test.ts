import {CLI_COMMAND_DESCRIPTORS} from "./fixtures/cliCommandInventory.js";
import {PACKAGE_ONLY_COMMAND_INPUTS} from "./fixtures/packageOnlyCommandInputs.js";

// Part of the Phase 3 current-state contract (docs/pokie-phase3-inventory.md): freezes exactly which
// public `pokie` commands require an already-loadable game package as their one input, cross-checked
// against the real, independently-frozen CLI_COMMAND_DESCRIPTORS (tests/cli/fixtures/cliCommandInventory.ts)
// so PACKAGE_ONLY_COMMAND_INPUTS can never silently drift out of sync with a command/verb addition,
// rename, or removal there.
describe("Phase 3 current-state contract: package-only command inputs", () => {
    it("has exactly one classification entry per (command, verb) pair CLI_COMMAND_DESCRIPTORS declares, plus init", () => {
        const descriptorKeys = CLI_COMMAND_DESCRIPTORS.flatMap((descriptor) => descriptor.verbs.map((verb) => `${descriptor.name}::${verb.verb ?? "(default)"}`));
        // `init` has no CLI_COMMAND_DESCRIPTORS verb entries at all (see that fixture's own comment on
        // why) -- added here explicitly rather than derived, so this coverage check still proves every
        // *other* command/verb pair is accounted for.
        const expectedKeys = [...descriptorKeys, "init::(no verbs)"].sort();

        const classifiedKeys = PACKAGE_ONLY_COMMAND_INPUTS.map((entry) => `${entry.command}::${entry.verb ?? "(default)"}`).sort();

        expect(classifiedKeys).toEqual(expectedKeys);
    });

    it("never marks a verb requiresLoadablePackage unless its own frozen positional is literally 'packageRoot'", () => {
        for (const entry of PACKAGE_ONLY_COMMAND_INPUTS) {
            if (entry.verb === "(no verbs)") {
                continue;
            }
            const descriptor = CLI_COMMAND_DESCRIPTORS.find((candidate) => candidate.name === entry.command);
            const verbDescriptor = descriptor?.verbs.find((candidate) => candidate.verb === entry.verb);
            expect(verbDescriptor).toBeDefined();

            const firstPositional = verbDescriptor?.positionals[0];
            if (entry.requiresLoadablePackage) {
                expect(firstPositional).toBe("packageRoot");
            } else {
                expect(firstPositional).not.toBe("packageRoot");
            }
        }
    });

    it("is exactly {client, dev, inspect, outcomelibrary generate, replay, serve, sim, validate}", () => {
        const packageOnly = PACKAGE_ONLY_COMMAND_INPUTS.filter((entry) => entry.requiresLoadablePackage)
            .map((entry) => (entry.verb === undefined ? entry.command : `${entry.command} ${entry.verb}`))
            .sort();

        expect(packageOnly).toEqual(["client", "dev", "inspect", "outcomelibrary generate", "replay", "serve", "sim", "validate"].sort());
    });
});
