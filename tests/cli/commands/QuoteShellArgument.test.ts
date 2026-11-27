import {quoteShellArgument} from "../../../cli/commands/internal/quoteShellArgument.js";

describe("quoteShellArgument", () => {
    it("keeps safe paths readable", () => {
        expect(quoteShellArgument("./demo-package")).toBe("./demo-package");
        expect(quoteShellArgument("/tmp/valera/slot")).toBe("/tmp/valera/slot");
    });

    it("quotes spaces and apostrophes for copy-paste", () => {
        const quoted = quoteShellArgument("/tmp/my game's folder");
        expect(quoted.startsWith("'")).toBe(true);
        expect(quoted.endsWith("'")).toBe(true);
        expect(quoted).toContain("'\\''");
    });
});
