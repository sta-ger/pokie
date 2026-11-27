import fs from "fs";
import os from "os";
import path from "path";
import {assertDeclaredOutcomeLibraryMode} from "../../../cli/commands/internal/assertDeclaredOutcomeLibraryMode.js";

describe("assertDeclaredOutcomeLibraryMode", () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-mode-"));
        fs.writeFileSync(path.join(directory, "index.json"), JSON.stringify({modes: [{modeName: "base"}, {modeName: "ante"}]}));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("accepts a declared mode", async () => {
        await expect(assertDeclaredOutcomeLibraryMode(directory, "ante")).resolves.toBeUndefined();
    });

    it("lists the declared modes instead of surfacing a raw index_<mode>.json ENOENT", async () => {
        const failure = await assertDeclaredOutcomeLibraryMode(directory, "nope").catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain('Mode "nope" is not declared');
        expect((failure as Error).message).toContain('Available modes: "base", "ante"');
        expect((failure as Error).message).not.toContain("ENOENT");
    });

    it("explains an unreadable or mode-less index without pretending the mode exists", async () => {
        fs.writeFileSync(path.join(directory, "index.json"), JSON.stringify({modes: []}));
        await expect(assertDeclaredOutcomeLibraryMode(directory, "base")).rejects.toThrow(/declares no usable modes/);

        fs.writeFileSync(path.join(directory, "index.json"), "{");
        await expect(assertDeclaredOutcomeLibraryMode(directory, "base")).rejects.toThrow(/Could not read the Outcome Library index/);
    });
});
