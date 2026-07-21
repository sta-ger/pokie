import {normalizeServerSeedFileContents} from "../../../../cli/commands/internal/normalizeServerSeedFileContents.js";

describe("normalizeServerSeedFileContents", () => {
    it("strips a single terminal LF added by a text editor", () => {
        expect(normalizeServerSeedFileContents("my-secret-seed\n")).toBe("my-secret-seed");
    });

    it("strips a single terminal CRLF added by a text editor", () => {
        expect(normalizeServerSeedFileContents("my-secret-seed\r\n")).toBe("my-secret-seed");
    });

    it("preserves a leading space", () => {
        expect(normalizeServerSeedFileContents(" leading-space-seed\n")).toBe(" leading-space-seed");
    });

    it("preserves intentional trailing spaces before the final line ending", () => {
        expect(normalizeServerSeedFileContents("trailing-spaces-seed   \n")).toBe("trailing-spaces-seed   ");
    });

    it("leaves content with no trailing line ending untouched", () => {
        expect(normalizeServerSeedFileContents("no-trailing-newline-seed")).toBe("no-trailing-newline-seed");
    });

    it("removes at most one terminal line ending, not repeated ones", () => {
        expect(normalizeServerSeedFileContents("seed\n\n")).toBe("seed\n");
    });

    it("throws on an empty file", () => {
        expect(() => normalizeServerSeedFileContents("")).toThrow(RangeError);
    });

    it("throws on a file containing only a line ending", () => {
        expect(() => normalizeServerSeedFileContents("\n")).toThrow(RangeError);
        expect(() => normalizeServerSeedFileContents("\r\n")).toThrow(RangeError);
    });
});
