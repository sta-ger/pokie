import {
    computeFairnessCommitment,
    computeFairnessServerSeedCommitment,
    FairnessCommitment,
    OutcomeLibraryFolderReader,
    OutcomeLibraryFolderWriteResult,
    OutcomeLibraryFolderWriter,
} from "@fromstan/pokie";
import {buildOutcomeLibraryFolderModeInput} from "../weightedoutcome/folder/OutcomeLibraryFolderTestFixtures.js";

export const FAIRNESS_TEST_POKIE_VERSION = "1.3.0";

// Builds a real, on-disk Outcome Library Bundle (via the production OutcomeLibraryFolderWriter, never a
// hand-crafted fixture) for the fairness slice's own tests to draw against — same "no second calculation path"
// discipline CertificationPackTestFixtures already follows for its own tests.
export function buildFairnessSourceBundle(outDir: string, modeNames: readonly string[] = ["base"]): Promise<OutcomeLibraryFolderWriteResult> {
    const writer = new OutcomeLibraryFolderWriter(FAIRNESS_TEST_POKIE_VERSION);
    const modes = modeNames.map((modeName) => buildOutcomeLibraryFolderModeInput(modeName, `${modeName}-lib`));
    return writer.writeToDirectory(modes, outDir);
}

// Mirrors the genuine two-step commit flow (computeFairnessServerSeedCommitment first, then
// computeFairnessCommitment) against a real, already-built bundle's own live libraryId/libraryHash — never a
// hand-crafted commitment — so every fairness test builds on top of the same commit step the production code
// itself goes through.
export async function issueFairnessCommitmentFor(
    libraryDir: string,
    modeName: string,
    options: {serverSeed: string; clientSeed?: string; nonce?: number},
): Promise<FairnessCommitment> {
    const index = await new OutcomeLibraryFolderReader().readModeIndex(libraryDir, modeName);
    const serverSeedCommitment = computeFairnessServerSeedCommitment({serverSeed: options.serverSeed});
    return computeFairnessCommitment({
        serverSeedCommitment,
        clientSeed: options.clientSeed ?? "player-client-seed",
        nonce: options.nonce ?? 0,
        libraryId: index.libraryId,
        libraryHash: index.libraryHash,
        modeName,
    });
}
