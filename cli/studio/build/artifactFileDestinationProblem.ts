import fs from "fs";
import path from "path";
import type {OutputFormat} from "@fromstan/pokie";

// The file-shaped build targets POKIE can reopen later. Directory targets are deliberately absent: their
// destination is created (or accepted empty) as a folder, so a suffix is neither expected nor meaningful.
const FILE_TARGET_EXTENSIONS: Partial<Record<OutputFormat, string>> = {
    blueprint: ".json",
    parWorkbook: ".xlsx",
    wasm: ".wasm",
};

const FILE_TARGET_LABELS: Partial<Record<OutputFormat, string>> = {
    blueprint: "game design",
    parWorkbook: "PAR workbook",
    wasm: "WASM module",
};

// Studio bypasses BuildCommand, so this mirrors the same "POKIE must be able to reopen its own artifact"
// boundary for the file-shaped targets while leaving directory targets untouched. Unlike a generic
// destination-occupied check, a wrong suffix or a directory named like a file is a caller-input problem, not
// an "existing output" conflict: the Build tab shows it as an error instead of claiming a build record is
// missing for a file that cannot exist.
export function describeFileTargetDestinationProblem(target: OutputFormat, destination: string): string | undefined {
    const expected = FILE_TARGET_EXTENSIONS[target];
    if (expected === undefined) return undefined;
    const label = FILE_TARGET_LABELS[target] ?? target;

    if (path.extname(destination).toLowerCase() !== expected) {
        return `A ${label} must be saved as a file ending in "${expected}"; "${destination}" does not. Add the suffix so POKIE can reopen the output.`;
    }

    try {
        // stat (not lstat) so a linked folder named like an artifact is still reported as a folder; a broken
        // link stays with the ordinary existing-destination conflict path.
        if (fs.statSync(destination).isDirectory()) {
            return `"${destination}" is a folder, not a file. Choose a file name for this ${label}.`;
        }
    } catch (error) {
        // A missing destination is exactly what a new artifact needs. Anything else (permissions, an I/O
        // failure) is not a suffix/type verdict and stays with the existing destination checks.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
    }
    return undefined;
}
