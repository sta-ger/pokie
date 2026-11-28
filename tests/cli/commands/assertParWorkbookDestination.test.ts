import fs from "fs";
import os from "os";
import path from "path";
import {assertParWorkbookDestination} from "../../../cli/commands/internal/assertParWorkbookDestination.js";

describe("assertParWorkbookDestination", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-par-destination-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("requires the xlsx suffix POKIE uses to recognize a PAR workbook", () => {
        expect(() => assertParWorkbookDestination(path.join(workDir, "game.par.xlsx"))).not.toThrow();
        expect(() => assertParWorkbookDestination(path.join(workDir, "GAME.XLSX"))).not.toThrow();
        expect(() => assertParWorkbookDestination(path.join(workDir, "game"))).toThrow(/ending in "\.xlsx"/);
    });

    it("rejects a folder named like a workbook before the exporter stages a file", () => {
        const folder = path.join(workDir, "folder.xlsx");
        fs.mkdirSync(folder);
        expect(() => assertParWorkbookDestination(folder)).toThrow(`"${folder}" is a folder, not a file. Choose a different file path.`);
    });
});
