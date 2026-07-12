import {resolveCommandName} from "../../cli/resolveCommandName.js";

describe("resolveCommandName", () => {
    it('resolves to "studio" when no command is given', () => {
        expect(resolveCommandName(["node", "pokie"])).toBe("studio");
    });

    it("passes an explicit command name through unchanged", () => {
        expect(resolveCommandName(["node", "pokie", "serve"])).toBe("serve");
    });

    it("ignores anything past the command name", () => {
        expect(resolveCommandName(["node", "pokie", "create", "my-game"])).toBe("create");
    });
});
