import path from "path";
import {isPathWithin} from "../../../cli/studio/isPathWithin.js";

describe("isPathWithin", () => {
    const root = path.join(path.sep, "studio", "root");

    it("is true for the root itself", () => {
        expect(isPathWithin(root, root)).toBe(true);
    });

    it("is true for a descendant path", () => {
        expect(isPathWithin(root, path.join(root, "index.html"))).toBe(true);
        expect(isPathWithin(root, path.join(root, "nested", "file.js"))).toBe(true);
    });

    it("is false for a sibling directory that merely shares a prefix", () => {
        const sibling = path.join(path.sep, "studio", "root-but-not-really");
        expect(isPathWithin(root, sibling)).toBe(false);
    });

    it("is false for an unrelated path", () => {
        expect(isPathWithin(root, path.join(path.sep, "somewhere", "else"))).toBe(false);
    });

    it("is false for the root's own parent directory", () => {
        expect(isPathWithin(root, path.dirname(root))).toBe(false);
    });
});
