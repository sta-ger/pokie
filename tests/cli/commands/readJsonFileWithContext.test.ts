import {readJsonFileWithContext} from "../../../cli/commands/internal/readJsonFileWithContext.js";

describe("readJsonFileWithContext", () => {
    it("returns the parsed value unchanged", () => {
        expect(readJsonFileWithContext(() => ({ok: true}), "input.json", "the input file")).toEqual({ok: true});
    });

    it("names the file, its purpose and the recovery instead of a raw JSON.parse error", () => {
        const failure = (() => {
            try {
                readJsonFileWithContext(() => {
                    throw new SyntaxError("Expected property name or '}' in JSON at position 1");
                }, "bad.json", "the round proof");
            } catch (error) {
                return error;
            }
            return undefined;
        })();

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain('Could not read the round proof "bad.json"');
        expect((failure as Error).message).toContain("Expected property name");
        expect((failure as Error).message).toContain("contains valid JSON");
    });
});
