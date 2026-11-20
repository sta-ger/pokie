import {OutcomeLibraryFolderWriteResult, OutcomeLibraryFolderWriter} from "@fromstan/pokie";
import {buildOutcomeLibraryFolderModeInput} from "../weightedoutcome/folder/OutcomeLibraryFolderTestFixtures.js";

export const CERTIFICATION_TEST_POKIE_VERSION = "1.3.0";

// Builds a real, on-disk Outcome Library Bundle (via the production OutcomeLibraryFolderWriter, never a
// hand-crafted fixture) for a certification/evidence bundle's own tests to build on top of — the same
// "no second calculation path" discipline the production code follows applies to its own tests too: what the
// certification bundle claims about a source bundle is always cross-checked against a bundle actually written
// by OutcomeLibraryFolderWriter, never a stub.
export function buildSourceOutcomeLibraryFolder(outDir: string, modeNames: readonly string[] = ["base"]): Promise<OutcomeLibraryFolderWriteResult> {
    const writer = new OutcomeLibraryFolderWriter(CERTIFICATION_TEST_POKIE_VERSION);
    const modes = modeNames.map((modeName) => buildOutcomeLibraryFolderModeInput(modeName, `${modeName}-lib`));
    return writer.writeToDirectory(modes, outDir);
}
