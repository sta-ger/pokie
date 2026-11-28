import {validateParSheetExportRequest} from "../../../cli/studio/blueprint/validateParSheetExportRequest.js";

describe("validateParSheetExportRequest", () => {
    it.each([".xlsx", ".XLSX"])("accepts a PAR workbook path with the %s suffix", (suffix) => {
        expect(validateParSheetExportRequest({path: `/tmp/game${suffix}`, blueprint: {}}).path).toBe(`/tmp/game${suffix}`);
    });

    it.each(["", "   ", "/tmp/game.par", "/tmp/game.json", "/tmp/game.xlsx/child.json"])(
        "rejects the unreadable PAR workbook path %p",
        (path) => {
            expect(() => validateParSheetExportRequest({path, blueprint: {}})).toThrow(
                path.trim().length === 0 ? /"path" is required/ : /file ending in "\.xlsx"/,
            );
        },
    );

    it("leaves an intermediate file segment to the destination check", () => {
        expect(validateParSheetExportRequest({path: "/tmp/game.xlsx/child.xlsx", blueprint: {}}).path).toBe("/tmp/game.xlsx/child.xlsx");
    });
});
