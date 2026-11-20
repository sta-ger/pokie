import type {CertificationPack, CertificationPackFormat, CertificationPackTemplate} from "./CertificationPack.js";
import type {PokieGameInfo} from "../gamepackage/PokieGameInfo.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {WeightedOutcomeLibraryAnalysis} from "../weightedoutcome/WeightedOutcomeLibraryAnalysis.js";

// Tracks this type's own shape (not the pokie package version), same convention as
// OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION/STAKE_ENGINE_INFO_SCHEMA_VERSION.
export const CERTIFICATION_PACK_INDEX_SCHEMA_VERSION = 2;

// One mode's certification evidence: the same libraryHash/outcomeCount/totalWeight/analysis an
// OutcomeLibraryFolderIndexModeEntry already carries — read straight off the source bundle's own index.json
// and embedded verbatim, never recomputed — plus this mode's own sampled-draws provenance.
export type CertificationPackModeEntry = {
    readonly modeName: string;
    readonly betMode: string;
    readonly stake: number;
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly outcomeCount: number;
    readonly totalWeight: number;
    readonly analysis: WeightedOutcomeLibraryAnalysis;
    readonly sampleSeed: string;
    readonly sampleCount: number;
    readonly samplesFile: string; // "samples_<modeName>.jsonl"
    readonly samplesHash: string; // sha256:<hex> of the exact bytes of samplesFile, the same "hash the exact bytes" convention as OutcomeLibraryFolderIndexEntry.recordHash
};

// The source outcome-library bundle's own deep validation ({deep: true}), run once at build time and embedded
// verbatim — never a second, differently-derived notion of "valid". "ranAt" is separate from the manifest's own
// "generatedAt" only in spirit (both are stamped from the same builder call); kept as its own field so a reader
// never has to assume they're the same thing.
export type CertificationPackDeepValidation = {
    readonly ranAt: string;
    readonly issues: readonly ValidationIssue[];
};

// POKIE's own provenance for a "pokie certification build" run — same "who/what version/when + files
// inventory" convention as OutcomeLibraryFolderIndex/StakeEngineInfo, deliberately built *on top of* an
// existing Outcome Library Bundle rather than introducing any new outcome-selection or metrics-calculation
// logic: every hash/metric here is either read verbatim off the source bundle's own index.json, or produced
// by drawing samples through OutcomeLibraryFolderReading.drawOutcome (the same weighted-draw algorithm the
// pre-generated runtime itself uses).
export type CertificationPackIndex = {
    readonly pack: CertificationPack;
    readonly presentation: {readonly template: CertificationPackTemplate; readonly templateHash: string; readonly templateArtifactHash: string | null; readonly formats: readonly CertificationPackFormat[]};
    readonly schemaVersion: number;
    readonly generatedBy: string;
    readonly pokieVersion: string;
    readonly generatedAt: string;
    readonly game: PokieGameInfo;
    readonly configHash?: string;
    readonly artifactPokieVersion: string;
    // Where the source Outcome Library Bundle was read from at *build* time — purely informational (a
    // directory can move, and this field is only ever as trustworthy as whoever last wrote this index.json).
    // CertificationPackVerifying.verify NEVER reads this field and never falls back to it: a caller
    // must always give an explicit CertificationPackVerifyOptions.sourceLibraryDir (or "--source <folder>"
    // on the CLI), or verification reports a diagnostic and reads nothing outside certDir.
    readonly sourceLibraryDir: string;
    // sha256 of the source bundle's own index.json, canonicalized the same way computeWeightedOutcomeLibraryHash
    // hashes a library — lets a verifier confirm the exact source-bundle-manifest state this evidence was built
    // against, independent of any single mode's own libraryHash.
    readonly sourceLibraryManifestHash: string;
    readonly modes: readonly CertificationPackModeEntry[];
    readonly deepValidation: CertificationPackDeepValidation;
    readonly files: readonly string[];
    // computeCertificationPackContentHash(this manifest) — a deterministic identity over every field above
    // except "generatedAt"/"sourceLibraryDir" (and "deepValidation.ranAt", a timestamp for the same reason):
    // the same source-bundle snapshot sampled with the same modes/seeds/sampleCounts always produces the same
    // evidenceContentHash, regardless of when or where it was (re)built. Recomputed and compared by
    // CertificationPackValidator as a single, unified self-consistency check covering every other
    // field in this manifest at once.
    readonly evidenceContentHash: string;
};
