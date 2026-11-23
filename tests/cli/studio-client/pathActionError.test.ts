import {classifyPathActionErrorReason, describePathActionError} from "../../../cli/studio-client/src/domain/pathActionError.js";

describe("describePathActionError", () => {
    it("turns a rejected managed-project default into an actionable destination message", () => {
        const raw = 'Could not determine a safe default project location (resolved to "/home/valera/POKIE Projects/demo"). Choose a destination directory explicitly.';

        expect(classifyPathActionErrorReason(raw)).toBe("destination");
        expect(describePathActionError("Your game", raw)).toBe(
            "Your game needs a destination Studio can use. Use a different Game id, or start Studio from a folder with a writable POKIE Projects location, then try again.",
        );
    });

    it("turns an exhausted managed-project name into a name-specific message", () => {
        const raw = 'No free managed project name for "starter-slot" after 1000 attempts. Choose a different Game id.';
        expect(classifyPathActionErrorReason(raw)).toBe("name");
        expect(describePathActionError("Your game", raw)).toBe(
            "Your game name is already taken. Choose a different Game id; Studio could not find a free project folder after 1000 attempts.",
        );
    });

    it("keeps the older exhausted-location wording classified as a destination problem", () => {
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
