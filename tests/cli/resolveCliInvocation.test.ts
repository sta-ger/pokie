import path from "path";
import {isTopLevelHelpRequest, resolveCliInvocation} from "../../cli/resolveCliInvocation.js";

const KNOWN_COMMANDS = ["build", "create", "serve", "sim", "studio", "validate"];

describe("isTopLevelHelpRequest", () => {
    it.each([["--help"], ["-h"]])('recognizes "pokie %s" as a request for the CLI\'s own help', (flag) => {
        expect(isTopLevelHelpRequest(["node", "pokie", flag])).toBe(true);
    });

    it("still recognizes the flag when other arguments follow it", () => {
        expect(isTopLevelHelpRequest(["node", "pokie", "--help", "build"])).toBe(true);
    });

    it("is not a top-level help request when the flag belongs to a command", () => {
        expect(isTopLevelHelpRequest(["node", "pokie", "build", "--help"])).toBe(false);
        expect(isTopLevelHelpRequest(["node", "pokie", "studio", "--help"])).toBe(false);
    });

    it("leaves every other invocation alone, including bare \"pokie\" and Studio's own flags", () => {
        expect(isTopLevelHelpRequest(["node", "pokie"])).toBe(false);
        expect(isTopLevelHelpRequest(["node", "pokie", "--no-open"])).toBe(false);
        expect(isTopLevelHelpRequest(["node", "pokie", "."])).toBe(false);
        expect(isTopLevelHelpRequest(["node", "pokie", "help"])).toBe(false);
    });

    // The regression this guards: resolveCliInvocation routes any leading "-"-prefixed token to
    // StudioCommand, so without the help check running first, "pokie --help" launched Studio.
    it("covers the flags that resolveCliInvocation would otherwise hand to StudioCommand", () => {
        for (const flag of ["--help", "-h"]) {
            expect(resolveCliInvocation(["node", "pokie", flag], KNOWN_COMMANDS, () => false)).toEqual({
                commandName: "studio",
                args: [flag],
            });
            expect(isTopLevelHelpRequest(["node", "pokie", flag])).toBe(true);
        }
    });
});

describe("resolveCliInvocation", () => {
    it('resolves to studio with no args when nothing is given ("pokie")', () => {
        const invocation = resolveCliInvocation(["node", "pokie"], KNOWN_COMMANDS, () => false);

        expect(invocation).toEqual({commandName: "studio", args: []});
    });

    it('resolves "." to a studio project invocation ("pokie .")', () => {
        const pathExists = jest.fn(() => true);

        const invocation = resolveCliInvocation(["node", "pokie", "."], KNOWN_COMMANDS, pathExists);

        expect(invocation).toEqual({commandName: "studio", args: ["."]});
        expect(pathExists).toHaveBeenCalledWith(".");
    });

    it('resolves an existing relative path to a studio project invocation ("pokie <path>")', () => {
        const pathExists = (candidate: string): boolean => candidate === "./sample-slot";

        const invocation = resolveCliInvocation(["node", "pokie", "./sample-slot"], KNOWN_COMMANDS, pathExists);

        expect(invocation).toEqual({commandName: "studio", args: ["./sample-slot"]});
    });

    it('resolves an existing absolute path to a studio project invocation ("pokie <path>")', () => {
        const absolute = path.resolve("/tmp/sample-slot");
        const pathExists = (candidate: string): boolean => candidate === absolute;

        const invocation = resolveCliInvocation(["node", "pokie", absolute], KNOWN_COMMANDS, pathExists);

        expect(invocation).toEqual({commandName: "studio", args: [absolute]});
    });

    it('does not treat a non-existent path as a studio invocation ("pokie <missing-path>")', () => {
        const invocation = resolveCliInvocation(["node", "pokie", "./does-not-exist"], KNOWN_COMMANDS, () => false);

        expect(invocation).toBeUndefined();
    });

    it('resolves a bare option to a studio invocation carrying it ("pokie --no-open")', () => {
        const pathExists = jest.fn(() => false);

        const invocation = resolveCliInvocation(["node", "pokie", "--no-open"], KNOWN_COMMANDS, pathExists);

        expect(invocation).toEqual({commandName: "studio", args: ["--no-open"]});
        // An option-shaped first token is never even checked against the filesystem.
        expect(pathExists).not.toHaveBeenCalled();
    });

    it('resolves an explicit "pokie studio" (no path) to a home studio invocation', () => {
        const invocation = resolveCliInvocation(["node", "pokie", "studio"], KNOWN_COMMANDS, () => false);

        expect(invocation).toEqual({commandName: "studio", args: []});
    });

    it('resolves "pokie studio ." to a studio project invocation', () => {
        const invocation = resolveCliInvocation(["node", "pokie", "studio", "."], KNOWN_COMMANDS, () => false);

        expect(invocation).toEqual({commandName: "studio", args: ["."]});
    });

    it('resolves "pokie studio <path>" to a studio project invocation', () => {
        const invocation = resolveCliInvocation(["node", "pokie", "studio", "./sample-slot"], KNOWN_COMMANDS, () => false);

        expect(invocation).toEqual({commandName: "studio", args: ["./sample-slot"]});
    });

    it("dispatches an existing command unchanged, forwarding the rest of the args", () => {
        const pathExists = jest.fn(() => false);

        const invocation = resolveCliInvocation(
            ["node", "pokie", "sim", "./sample-slot", "--rounds", "500"],
            KNOWN_COMMANDS,
            pathExists,
        );

        expect(invocation).toEqual({commandName: "sim", args: ["./sample-slot", "--rounds", "500"]});
        // A known command name always wins over path-existence — the filesystem is never even checked.
        expect(pathExists).not.toHaveBeenCalled();
    });

    it("dispatches every other existing command unchanged", () => {
        for (const commandName of ["build", "create", "serve", "validate"]) {
            const invocation = resolveCliInvocation(["node", "pokie", commandName, "arg"], KNOWN_COMMANDS, () => false);

            expect(invocation).toEqual({commandName, args: ["arg"]});
        }
    });

    it("does not silently treat an unknown command as a path when it doesn't exist", () => {
        const invocation = resolveCliInvocation(["node", "pokie", "bogus-command"], KNOWN_COMMANDS, () => false);

        expect(invocation).toBeUndefined();
    });

    it("uses the real filesystem by default", () => {
        const invocation = resolveCliInvocation(["node", "pokie", "."], KNOWN_COMMANDS);

        expect(invocation).toEqual({commandName: "studio", args: ["."]});
    });
});
