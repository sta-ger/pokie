import {parseCertificationJson} from "./parseCertificationJson.js";
import {CERTIFICATION_PREPARATION_NOTICE, CERTIFICATION_METRIC_SEMANTICS, type CertificationDossier} from "../CertificationDossier.js";
import type {CertificationEvidenceBundleManifest} from "../CertificationEvidenceBundleManifest.js";
import {validateAuditRoundRecording} from "../../replay/AuditRoundReplay.js";
import {validateDossierReport, dossierHash} from "./acquireCertificationDossier.js";
import {sha256OfBytes} from "./sha256OfBytes.js";

function closed(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(key => Reflect.apply(Object.prototype.hasOwnProperty, value, [key]))) throw new Error(`Missing, unknown or duplicated dossier fields; expected ${keys.join(", ")}.`);
}
function strings(value: unknown): asserts value is string[] {
    if (!Array.isArray(value) || !value.every(item => typeof item === "string")) throw new Error("Expected dossier text list.");
}
function hash(value: unknown): void {
    if (typeof value !== "string" || !(/^sha256:[a-f0-9]{64}$/).test(value)) throw new Error("Invalid dossier SHA-256 identity.");
}
/** Closed sections, integrity-bound payloads, and cross-section invariants. Live authority comparison is separate. */
export function validateCertificationDossier(value: unknown, manifest: CertificationEvidenceBundleManifest): asserts value is CertificationDossier {
    closed(value, ["schemaVersion", "identity", "rules", "statistics", "validation", "reproduction", "support"]);
    if (value.schemaVersion !== 1) throw new Error("Unsupported dossier version; expected 1. Legacy sample-only bundles are not launch dossiers.");
    closed(value.identity, ["runtimeVersion", "modelHash", "modelArtifactHash", "sourceBundleManifestHash", "sourceBundleManifest", "sourceRevision", "candidateRevision"]);
    closed(value.rules, ["status", "definition"]);
    closed(value.statistics, ["exact", "semantics", "estimates", "unavailable"]);
    closed(value.validation, ["source", "model", "assumptions"]);
    closed(value.reproduction, ["selection", "runtime", "recordings", "commands", "variableMetadata"]);
    closed(value.support, ["notice", "coverage", "limitations", "sdk", "fairness", "yaml"]);
    const d = value as unknown as CertificationDossier;
    if (![manifest.pokieVersion, manifest.artifactPokieVersion].every(version => (/^1\.3\.\d+(?:[-+][A-Za-z0-9.-]+)?$/).test(version))) throw new Error("Unsupported dossier producer/artifact runtime; launch dossier v1 supports POKIE 1.3.x only.");
    const source = d.identity.sourceBundleManifest;
    if (source.schemaVersion !== 1) throw new Error("Unsupported retained source-bundle manifest version; expected 1.");
    if (source.configHash !== manifest.configHash || source.artifactPokieVersion !== manifest.artifactPokieVersion || dossierHash(source.game) !== dossierHash(manifest.game)) throw new Error("Contradictory retained source provenance.");
    for (const mode of manifest.modes) {
        const original = source.modes.find(entry => entry.modeName === mode.modeName);
        if (!original || ["betMode", "stake", "libraryId", "libraryHash", "outcomeCount", "totalWeight", "analysis"].some(field => dossierHash(Reflect.get(mode, field)) !== dossierHash(Reflect.get(original, field)))) throw new Error("Mode statistics/identity contradict the retained source manifest.");
    }
    if (dossierHash(d.identity.sourceBundleManifest) !== d.identity.sourceBundleManifestHash) throw new Error("Source manifest identity does not bind its retained bytes/values.");
    if (d.identity.runtimeVersion !== "pokie.session-runtime.v1" || d.identity.sourceBundleManifestHash !== manifest.sourceBundleManifestHash) throw new Error("Incompatible runtime or inconsistent source identity.");
    for (const revision of [d.identity.sourceRevision, d.identity.candidateRevision]) if (revision !== null && (typeof revision !== "string" || !revision.trim())) throw new Error("Invalid revision label.");
    if (d.identity.modelHash !== null) {
        hash(d.identity.modelHash);
        hash(d.identity.modelArtifactHash);

    } else if (d.identity.modelArtifactHash !== null) throw new Error("Model artifact without model identity.");
    if (d.identity.modelHash !== null && d.identity.modelHash !== manifest.configHash) throw new Error("Dossier model differs from artifact configHash.");
    if (d.rules.definition === null) {
        if (d.rules.status !== "unavailable" || d.identity.modelHash !== null || d.support.coverage !== "unavailable" || d.validation.model !== "unavailable") throw new Error("Unavailable model was presented as supported.");
    } else {
        const definition = d.rules.definition;
        closed(definition, ["identity", "support", "fields", "diagnostics", "limits", ...(definition.authored === undefined ? [] : ["authored"]), ...(definition.effective === undefined ? [] : ["effective"]), ...(definition.advanced === undefined ? [] : ["advanced"])]);
        if (definition.identity.revision !== d.identity.modelHash) throw new Error("Model definition revision differs from artifact identity.");
        if (d.rules.status !== "available" || !d.identity.modelHash || !["complete", "partial"].includes(definition.support) || d.support.coverage !== (definition.support === "complete" ? "complete" : "partial") || d.validation.model !== "advanced-declared-model") throw new Error("Invalid model support disclosure.");
        if (definition.identity.descriptorVersion !== 1 || definition.identity.blueprintSchemaVersion !== 1) throw new Error("Unsupported model descriptor/Blueprint version.");
        if (definition.advanced && (definition.advanced.schemaVersion !== 1 || definition.advanced.scope !== "declared-model" || !["declarative-runtime-contract", "unverified"].includes(definition.advanced.executableFidelity))) throw new Error("Incompatible advanced validation schema/fidelity scope.");
        if (!Array.isArray(definition.fields) || !Array.isArray(definition.diagnostics) || !Array.isArray(definition.limits)) throw new Error("Missing model coverage/diagnostics.");
    }
    if (dossierHash(d.statistics.semantics) !== dossierHash(CERTIFICATION_METRIC_SEMANTICS)) throw new Error("Altered metric semantics.");
    if (d.statistics.exact !== "source-mode-distributions" || !Array.isArray(d.statistics.estimates)) throw new Error("Unsupported statistical evidence version.");
    for (const attachment of [...d.statistics.estimates, ...d.reproduction.recordings]) {
        closed(attachment, ["hash", "raw", "value"]);
        hash(attachment.hash);
        if (typeof attachment.raw !== "string" || sha256OfBytes(attachment.raw) !== attachment.hash || dossierHash(parseCertificationJson(attachment.raw)) !== dossierHash(attachment.value)) throw new Error("Altered evidence attachment bytes/value.");
    }
    for (const report of d.statistics.estimates) validateDossierReport(report.value, d.identity.modelHash, {...manifest, schemaVersion: 1, modes: manifest.modes.map(mode => ({...mode, indexFile: "", outcomesFile: ""}))});
    if (d.validation.source !== "deep-at-build; shallow-and-sampled-at-verification" || d.reproduction.selection !== "seeded-native-weighted-outcome" || d.reproduction.runtime !== (d.reproduction.recordings.length ? "audit-round-v1" : "unavailable")) throw new Error("Inconsistent validation/reproduction scope.");
    for (const replay of d.reproduction.recordings) {
        validateAuditRoundRecording(replay.value);
        if (replay.value.identity.modelHash !== d.identity.modelHash) throw new Error("Replay belongs to another model.");
    }
    for (const list of [d.statistics.unavailable, d.validation.assumptions, d.reproduction.commands, d.reproduction.variableMetadata, d.support.limitations]) strings(list);
    if (!d.validation.assumptions.length || !d.reproduction.commands.length || !d.support.limitations.length || d.support.notice !== CERTIFICATION_PREPARATION_NOTICE || d.support.sdk !== "unavailable" || d.support.fairness !== "unavailable" || d.support.yaml !== "unimplemented; optional, non-mandatory") throw new Error("Missing preparation-only/scoped support disclosures.");
}
