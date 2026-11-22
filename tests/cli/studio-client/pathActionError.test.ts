import {classifyPathActionErrorReason, describePathActionError} from "../../../cli/studio-client/src/domain/pathActionError.js";

describe("describePathActionError", () => {
    it("turns a rejected managed-project default into an actionable destination message", () => {
        const raw = 'Could not determine a safe default project location (resolved to "/home/valera/POKIE Projects/demo"). Choose a destination directory explicitly.';

        expect(classifyPathActionErrorReason(raw)).toBe("destination");
        expect(describePathActionError("Your game", raw)).toBe(
            "Your game needs a destination Studio can use. Choose a destination folder explicitly, or start Studio from a different folder and try again.",
        );
    });

    it("classifies an exhausted managed-project location as a destination problem", () => {
        const raw = 'Could not find an available managed project location for "starter-slot" after 1000 attempts.';
        expect(classifyPathActionErrorReason(raw)).toBe("destination");
        expect(describePathActionError("Your game", raw)).toMatch(/needs a destination Studio can use/i);
    });

    it("keeps ordinary filesystem failures classified as before", () => {
        expect(classifyPathActionErrorReason("ENOENT: no such file or directory")).toBe("absent");
        expect(classifyPathActionErrorReason("EACCES: permission denied")).toBe("permission");
        expect(classifyPathActionErrorReason("Failed to fetch")).toBe("network");
    });
});
