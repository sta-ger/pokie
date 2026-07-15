import {OutcomeLibraryBundleWriteResult, OutcomeLibraryBundleWriter} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

export const FAIRNESS_TEST_POKIE_VERSION = "1.3.0";

// Builds a real, on-disk Outcome Library Bundle (via the production OutcomeLibraryBundleWriter, never a
// hand-crafted fixture) for the fairness slice's own tests to draw against — same "no second calculation path"
// discipline CertificationEvidenceBundleTestFixtures already follows for its own tests.
export function buildFairnessSourceBundle(outDir: string, modeNames: readonly string[] = ["base"]): Promise<OutcomeLibraryBundleWriteResult> {
    const writer = new OutcomeLibraryBundleWriter(FAIRNESS_TEST_POKIE_VERSION);
    const modes = modeNames.map((modeName) => buildOutcomeLibraryBundleModeInput(modeName, `${modeName}-lib`));
    return writer.writeToDirectory(modes, outDir);
}
