import type {OutcomeLibraryFolderIndex} from "../weightedoutcome/folder/OutcomeLibraryFolderIndex.js";
import type {MathDefinitionSnapshot} from "../diff/MathDefinitionDiff.js";
import type {SimulationReport} from "../reporting/SimulationReport.js";
import type {AuditRoundRecording} from "../replay/AuditRoundRecording.js";

export const CERTIFICATION_PREPARATION_NOTICE = "Certification-ready preparation only. Integrity verification establishes evidence consistency and reproduction, not regulatory approval, independent RNG certification, compliance sign-off, authenticity or guaranteed executable correctness.";
export const CERTIFICATION_METRIC_SEMANTICS = [
    "Exact source distributions: retained library weights only; bounded/absent generation metadata does not establish full model outcome coverage. RTP and payout multipliers are stake ratios; variance is squared ratio units, standard deviation is ratio units, maxWin is currency; probabilities are fractions (0..1). Each mode retains its own stake/denominator. No blended all-mode RTP is defined.",
    "Sampled estimates: RTP is total payout / total charged stake; stakes and payouts use the game's currency unit. A target deviation is a ratio; multiply by 100 for percentage points.",
    "Completed logical-round and accepted-subround populations remain separate. Feature attribution and per-mode denominators retain the canonical simulation report's sampling conventions.",
    "CI/convergence absent or null means unavailable, never zero. Exact source distributions have no sampling CI. Deterministic outcome sampleCount is a selection count, not a simulation population.",
] as const;
export const CERTIFICATION_PACK_SECTIONS = ["identity", "rules", "statistics", "validation", "reproduction", "support"] as const;
export type CertificationPackSection = typeof CERTIFICATION_PACK_SECTIONS[number];
export type CertificationPackFormat = "json" | "console" | "markdown" | "html" | "pdf";
/** Explicit trusted sources; no path in retained evidence is ever followed during verification. */
export type CertificationPackInputs = {
    readonly modelSource?: string;
    readonly reportFiles?: readonly string[];
    readonly replayFiles?: readonly string[];
    /** Revision labels are metadata, never substitutes for model and executable byte identities. */
    readonly sourceRevision?: string;
    readonly candidateRevision?: string;
};
export type CertificationPackTemplate = {
    readonly schemaVersion: 1;
    readonly title: string;
    readonly introduction: string;
    /** Every mandatory section exactly once. Templates cannot hide disclosures. */
    readonly sections: readonly CertificationPackSection[];
};
export type CertificationPackOutput = {
    readonly formats?: readonly CertificationPackFormat[];
    readonly templateFile?: string;
};
export type CertificationPackAttachment<T> = {readonly hash: string; readonly raw: string; readonly value: T};
/** Versioned canonical data; unavailable evidence stays explicit inside a mandatory section. */
export type CertificationPack = {
    readonly schemaVersion: 1;
    readonly identity: {
        readonly runtimeVersion: "pokie.session-runtime.v1";
        readonly modelHash: string | null;
        readonly modelArtifactHash: string | null;
        readonly sourceLibraryManifestHash: string;
        readonly sourceLibraryManifest: OutcomeLibraryFolderIndex;
        readonly sourceRevision: string | null;
        readonly candidateRevision: string | null;
    };
    readonly rules: {readonly status: "available" | "unavailable"; readonly definition: MathDefinitionSnapshot | null};
    readonly statistics: {
        readonly exact: "source-mode-distributions";
        readonly semantics: readonly string[];
        readonly estimates: readonly CertificationPackAttachment<SimulationReport>[];
        readonly unavailable: string[];
    };
    readonly validation: {
        readonly source: "deep-at-build; shallow-and-sampled-at-verification";
        readonly model: "advanced-declared-model" | "unavailable";
        readonly assumptions: readonly string[];
    };
    readonly reproduction: {
        readonly selection: "seeded-native-weighted-outcome";
        readonly runtime: "audit-round-v1" | "unavailable";
        readonly recordings: readonly CertificationPackAttachment<AuditRoundRecording>[];
        readonly commands: readonly string[];
        readonly variableMetadata: readonly string[];
    };
    readonly support: {
        readonly notice: typeof CERTIFICATION_PREPARATION_NOTICE;
        readonly coverage: "complete" | "partial" | "unavailable";
        readonly limitations: readonly string[];
        readonly sdk: "unavailable";
        readonly fairness: "unavailable";
        readonly yaml: "unimplemented; optional, non-mandatory";
    };
};

export function validateCertificationPackInputs(value: unknown): asserts value is CertificationPackInputs {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pack inputs must be an object.");
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some(key => !["modelSource", "reportFiles", "replayFiles", "sourceRevision", "candidateRevision"].includes(key))) throw new Error("Unknown pack input field.");
    for (const field of ["modelSource", "sourceRevision", "candidateRevision"]) if (input[field] !== undefined && (typeof input[field] !== "string" || !(input[field] as string).trim())) throw new Error(`Pack ${field} must be a nonempty string.`);
    for (const field of ["reportFiles", "replayFiles"]) {
        const files = input[field];
        if (files !== undefined && (!Array.isArray(files) || files.length > 100 || new Set(files).size !== files.length || !files.every(file => typeof file === "string" && file.trim()))) throw new Error(`Pack ${field} must contain up to 100 unique explicit paths.`);
    }
}
export function validateCertificationPackOutput(value: unknown): asserts value is CertificationPackOutput {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pack output must be an object.");
    const output = value as Record<string, unknown>;
    if (Object.keys(output).some(key => !["formats", "templateFile"].includes(key))) throw new Error("Unknown pack output field.");
    if (output.templateFile !== undefined && (typeof output.templateFile !== "string" || !output.templateFile.trim())) throw new Error("templateFile must be a nonempty local path.");
    if (output.formats !== undefined && (!Array.isArray(output.formats) || !output.formats.length || new Set(output.formats).size !== output.formats.length || !output.formats.every(format => ["json", "console", "markdown", "html", "pdf"].includes(format)))) throw new Error("Select unique pack formats: json, console, markdown, html, pdf. YAML is unimplemented.");
}

export function certificationPackFileName(format: CertificationPackFormat): string {
    const extension = {json: "json", console: "txt", markdown: "md", html: "html", pdf: "pdf"}[format];
    if (!extension) throw new Error(`Unsupported pack format ${String(format)}.`);
    return `pack.${extension}`;
}
