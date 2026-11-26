import {
    classifyPathActionErrorReason,
    describeExistingProjectOpenError,
    describeManagedSaveFailure,
    describePathActionError,
} from "../../../cli/studio-client/src/domain/pathActionError.js";

describe("describePathActionError", () => {
    it("turns a rejected managed-project default into an actionable destination message", () => {
        const raw = 'Could not determine a safe default project location (resolved to "/home/valera/POKIE Projects/demo"). Choose a destination directory explicitly.';

        expect(classifyPathActionErrorReason(raw)).toBe("destination");
        expect(describePathActionError("Your game", raw)).toBe(
            "Your game needs a destination Studio can use. Use a different Game id, or start Studio from a folder with a writable POKIE Projects location, then try again.",
        );
    });

    it("turns an existing managed Game id into a name-specific message", () => {
        const raw = 'A POKIE project with Game id "starter-slot" already exists at "/home/valera/POKIE Projects/starter-slot/blueprint.json". Choose a different Game id, or open the existing project instead.';
        expect(classifyPathActionErrorReason(raw)).toBe("name");
        expect(describePathActionError("Your game", raw)).toBe(
            "That Game id is already taken. Choose a different Game id, or open the existing project.",
        );
    });

    it("still recognizes the older exhausted managed-project wording", () => {
        const raw = 'No free managed project name for "starter-slot" after 1000 attempts. Choose a different Game id.';
        expect(classifyPathActionErrorReason(raw)).toBe("name");
        expect(describePathActionError("Your game", raw)).toBe(
            "That Game id is already taken. Choose a different Game id, or open the existing project.",
        );
    });

    it("keeps the older exhausted-location wording classified as a destination problem", () => {
        const raw = 'Could not find an available managed project location for "starter-slot" after 1000 attempts.';
        expect(classifyPathActionErrorReason(raw)).toBe("destination");
        expect(describePathActionError("Your game", raw)).toMatch(/needs a destination Studio can use/i);
    });

    it("turns a non-workbook file into an actionable workbook message", () => {
        const raw = 'Could not read "/tmp/not-par.xlsx" as a PAR sheet XLSX workbook: The input is not a ZIP archive, so it cannot be an XLSX file.';
        expect(classifyPathActionErrorReason(raw)).toBe("workbook");
        expect(describePathActionError("The PAR sheet file", raw)).toBe(
            "The PAR sheet file isn't a readable PAR workbook. Choose an .xlsx file exported from POKIE or another spreadsheet tool, then try again.",
        );
    });

    it("keeps ordinary filesystem failures classified as before", () => {
        expect(classifyPathActionErrorReason("ENOENT: no such file or directory")).toBe("absent");
        expect(classifyPathActionErrorReason("EACCES: permission denied")).toBe("permission");
        expect(classifyPathActionErrorReason("Failed to fetch")).toBe("network");
    });

    it("turns a legacy project's ENOTDIR into recovery copy instead of raw filesystem text", () => {
        const raw =
            'Could not read "/home/valera/POKIE Projects/starter-slot/blueprint.json/package.json": ENOTDIR: not a directory, open \'/home/valera/POKIE Projects/starter-slot/blueprint.json/package.json\'';
        const message = describeExistingProjectOpenError(new Error(raw));
        expect(message).toMatch(/could not be opened/i);
        expect(message).toMatch(/older POKIE project or a damaged file/i);
        expect(message).toMatch(/Choose a different Game id/i);
        expect(message).not.toMatch(/ENOTDIR|package\.json/);
    });

    it("uses ProjectOpenError.detail when the friendly message alone does not identify the failure", () => {
        const message = describeExistingProjectOpenError({
            message: "Failed to open project",
            detail: 'Could not read "/tmp/starter-slot/blueprint.json/package.json": ENOTDIR: not a directory',
        });
        expect(message).toMatch(/older POKIE project or a damaged file/i);
        expect(message).not.toMatch(/ENOTDIR|package\.json/);
    });

    it("does not promise an open action when the colliding file is not a current project", () => {
        const message = describeManagedSaveFailure(
            'A game design with Game id "starter-slot" already exists at "/tmp/starter-slot/blueprint.json", but it cannot be opened as a current POKIE project. Choose a different Game id, or move or repair the old file if you still need it.',
        );
        expect(message).toMatch(/can't open as a current project/i);
        expect(message).toMatch(/Choose a different Game id/i);
        expect(message).not.toMatch(/open the existing project/i);
    });
});
