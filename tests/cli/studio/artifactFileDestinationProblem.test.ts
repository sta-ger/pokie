import fs from "fs";
import os from "os";
import path from "path";
import {describeFileTargetDestinationProblem} from "../../../cli/studio/build/artifactFileDestinationProblem.js";

describe("describeFileTargetDestinationProblem", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-file-target-suffix-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it.each([
        ["parWorkbook", ".xlsx"],
        ["wasm", ".wasm"],
        ["blueprint", ".json"],
    ] as const)("requires the %s file target to keep POKIE's own %s suffix", (target, suffix) => {
        const destination = path.join(workDir, "artifact");

        expect(describeFileTargetDestinationProblem(target, destination)).toContain(`ending in "${suffix}"`);
        expect(describeFileTargetDestinationProblem(target, `${destination}.wrong`)).toContain(`ending in "${suffix}"`);
        expect(describeFileTargetDestinationProblem(target, `${destination}${suffix}`)).toBeUndefined();
        expect(describeFileTargetDestinationProblem(target, `${destination}${suffix.toUpperCase()}`)).toBeUndefined();
    });

    it.each(["tsPackage", "outcomeLibrary", "stakeAdapter"] as const)("leaves the directory target %s free of a file suffix rule", (target) => {
        expect(describeFileTargetDestinationProblem(target, path.join(workDir, "output"))).toBeUndefined();
    });

    it("reports a directory named like a file instead of treating it as an existing artifact", () => {
        const destination = path.join(workDir, "folder.xlsx");
        fs.mkdirSync(destination);

        expect(describeFileTargetDestinationProblem("parWorkbook", destination)).toBe(
            `"${destination}" is a folder, not a file. Choose a file name for this PAR workbook.`,
        );
    });

    it("leaves an existing regular file to the ordinary never-overwrite conflict check", () => {
        const destination = path.join(workDir, "existing.xlsx");
        fs.writeFileSync(destination, "old workbook");

        expect(describeFileTargetDestinationProblem("parWorkbook", destination)).toBeUndefined();
    });
});
