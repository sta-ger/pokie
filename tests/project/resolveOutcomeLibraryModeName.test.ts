import {resolveOutcomeLibraryModeName} from "pokie";

describe("resolveOutcomeLibraryModeName", () => {
    const modes = [{modeName: "base"}, {modeName: "buyFeature"}];

    it("defaults to the manifest's own first mode when no mode is requested", () => {
        expect(resolveOutcomeLibraryModeName(modes, undefined)).toBe("base");
    });

    it("resolves an explicitly-requested real mode, even when it isn't the first one", () => {
        expect(resolveOutcomeLibraryModeName(modes, "buyFeature")).toBe("buyFeature");
    });

    it("fails honestly, naming every real mode, for a mode name that isn't part of this library", () => {
        expect(() => resolveOutcomeLibraryModeName(modes, "bonus")).toThrow('"bonus" is not a mode of this outcome library. Available modes: base, buyFeature.');
    });
});
