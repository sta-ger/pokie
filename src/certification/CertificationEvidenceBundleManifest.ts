import type {PokieGameManifest} from "../gamepackage/PokieGameManifest.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {WeightedOutcomeLibraryAnalysis} from "../weightedoutcome/WeightedOutcomeLibraryAnalysis.js";

// Tracks this type's own shape (not the pokie package version), same convention as
// OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION/STAKE_ENGINE_MANIFEST_SCHEMA_VERSION.
export const CERTIFICATION_EVIDENCE_BUNDLE_MANIFEST_SCHEMA_VERSION = 1;

// One mode's certification evidence: the same libraryHash/outcomeCount/totalWeight/analysis an
// OutcomeLibraryBundleManifestModeEntry already carries — read straight off the source bundle's own manifest.json
// and embedded verbatim, never recomputed — plus this mode's own sampled-draws provenance.
export type CertificationEvidenceBundleModeEntry = {
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
    readonly samplesHash: string; // sha256:<hex> of the exact bytes of samplesFile, the same "hash the exact bytes" convention as OutcomeLibraryBundleIndexEntry.recordHash
};

// The source outcome-library bundle's own deep validation ({deep: true}), run once at build time and embedded
// verbatim — never a second, differently-derived notion of "valid". "ranAt" is separate from the manifest's own
// "generatedAt" only in spirit (both are stamped from the same builder call); kept as its own field so a reader
// never has to assume they're the same thing.
export type CertificationEvidenceDeepValidation = {
    readonly ranAt: string;
    readonly issues: readonly ValidationIssue[];
};

// POKIE's own provenance for a "pokie certification build" run — same "who/what version/when + files
// inventory" convention as OutcomeLibraryBundleManifest/StakeEngineManifest, deliberately built *on top of* an
// existing Outcome Library Bundle rather than introducing any new outcome-selection or metrics-calculation
// logic: every hash/metric here is either read verbatim off the source bundle's own manifest.json, or produced
// by drawing samples through OutcomeLibraryBundleReading.drawOutcome (the same weighted-draw algorithm the
// pre-generated runtime itself uses).
export type CertificationEvidenceBundleManifest = {
    readonly schemaVersion: number;
    readonly generatedBy: string;
    readonly pokieVersion: string;
    readonly generatedAt: string;
    readonly game: PokieGameManifest;
    readonly configHash?: string;
    readonly artifactPokieVersion: string;
    // Where the source Outcome Library Bundle was read from at build time — informational (a directory can
    // move), never itself compared at verify time; see CertificationEvidenceVerifyOptions.sourceBundleDir for
    // how a verifier is actually pointed at the source bundle.
    readonly sourceBundleDir: string;
    // sha256 of the source bundle's own manifest.json, canonicalized the same way computeWeightedOutcomeLibraryHash
    // hashes a library — lets a verifier confirm the exact source-bundle-manifest state this evidence was built
    // against, independent of any single mode's own libraryHash.
    readonly sourceBundleManifestHash: string;
    readonly modes: readonly CertificationEvidenceBundleModeEntry[];
    readonly deepValidation: CertificationEvidenceDeepValidation;
    readonly files: readonly string[];
};
