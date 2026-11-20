import fs from "fs";
import {certificationSourceHash, packHash} from "./internal/acquireCertificationPack.js";
import {parseCertificationJson} from "./internal/parseCertificationJson.js";
import {isCertificationPackIndexShape, isModeEntryShape} from "./internal/certificationPackBundleShapeGuards.js";
import {computeCertificationPackContentHash} from "./computeCertificationPackContentHash.js";
import {CERTIFICATION_PACK_SECTIONS, CERTIFICATION_PREPARATION_NOTICE, type CertificationPackFormat, type CertificationPackTemplate} from "./CertificationPack.js";
import type {CertificationPackIndex} from "./CertificationPackIndex.js";
import type {CertificationPackRendering} from "./CertificationPackRendering.js";
import {CertificationPackBuildCancelledError} from "./CertificationPackBuildOptions.js";
import {validateCertificationPack} from "./internal/validateCertificationPack.js";
import {renderLocalPackPdf} from "./internal/renderLocalPackPdf.js";

export const DEFAULT_CERTIFICATION_PACK_TEMPLATE: CertificationPackTemplate = {
    schemaVersion: 1, title: "POKIE evidence pack", introduction: "Independent assessment preparation", sections: CERTIFICATION_PACK_SECTIONS,
};
export function validateCertificationPackTemplate(value: unknown): asserts value is CertificationPackTemplate {
    const t = value as CertificationPackTemplate;
    if (!t || typeof t !== "object" || Object.keys(t).sort().join(",") !== "introduction,schemaVersion,sections,title" || t.schemaVersion !== 1 || typeof t.title !== "string" || !t.title.trim() || typeof t.introduction !== "string" || t.title.length > 200 || t.introduction.length > 4000 || !Array.isArray(t.sections) || t.sections.length !== CERTIFICATION_PACK_SECTIONS.length || new Set(t.sections).size !== t.sections.length || !t.sections.every(s => CERTIFICATION_PACK_SECTIONS.includes(s))) throw new Error("Invalid pack template v1: title, introduction and every mandatory section exactly once are required; executable syntax and resources are unsupported.");
}
export function loadCertificationPackTemplate(file: string): CertificationPackTemplate {
    certificationSourceHash(file);
    const template = parseCertificationJson(fs.readFileSync(file, "utf8"));
    validateCertificationPackTemplate(template);
    return template;
}
export type CertificationPackTable = {title: string; rows: readonly (readonly [string, string])[]};
/** String(number) preserves fractional stakes and small nonzero probabilities without fixed-decimal rounding. */
function display(value: unknown): string {
    if (value === null || value === undefined) return "unavailable";
    if (typeof value === "string") return value;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}
function rows(value: unknown, prefix = ""): [string, string][] {
    if (value && typeof value === "object") {
        const entries = Object.entries(value);
        if (!entries.length) return [[prefix, Array.isArray(value) ? "[]" : "{}"]];
        return entries.flatMap(([key, child]) => rows(child, prefix ? `${prefix}.${key}` : key));
    }
    return [[prefix, display(value)]];
}
export function certificationPackTables(index: CertificationPackIndex, template: CertificationPackTemplate = index.presentation.template): CertificationPackTable[] {
    if (!isCertificationPackIndexShape(index) || index.schemaVersion !== 2 || !index.modes.length || !index.modes.every(isModeEntryShape) || computeCertificationPackContentHash(index) !== index.evidenceContentHash) throw new Error("Invalid canonical pack index/content identity.");
    validateCertificationPack(index.pack, index);
    validateCertificationPackTemplate(template);
    const pack = index.pack;
    return template.sections.flatMap(section => {
        const table: CertificationPackTable = {title: section, rows: rows(pack[section])};
        if (section === "identity") return [table, {title: "Output identities", rows: rows({evidenceContentHash: index.evidenceContentHash, game: index.game, recordPokieVersion: index.recordPokieVersion, templateHash: index.presentation.templateHash, templateArtifactHash: index.presentation.templateArtifactHash, renderedTemplateHash: packHash(template)})}];
        if (section === "rules" && pack.rules.definition) {
            const definition = pack.rules.definition;
            const effective = definition.effective && typeof definition.effective === "object" && !Array.isArray(definition.effective) ? definition.effective : {};
            const authored = definition.authored && typeof definition.authored === "object" && !Array.isArray(definition.authored) ? definition.authored : {};
            return [
                {title: "Model rules / PAR representation", rows: rows({support: definition.support, identity: definition.identity, limits: definition.limits})},
                ...Array.from(new Set([...Object.keys(authored), ...Object.keys(effective)])).sort().map(field => ({title: `Model ${field}`, rows: rows({authored: authored[field] ?? null, effective: effective[field] ?? null})})),
                {title: "Field authority and conversion diagnostics", rows: rows({fields: definition.fields, diagnostics: definition.diagnostics})},
                {title: "Advanced model validation", rows: rows(definition.advanced ?? null)},
            ];
        }
        if (section === "statistics") return [
            {title: "Metric semantics", rows: pack.statistics.semantics.map((value, index) => [String(index + 1), value] as const)},
            ...index.modes.map(mode => ({title: `Exact mode ${mode.modeName}`, rows: rows({betMode: mode.betMode, stake: mode.stake, libraryHash: mode.libraryHash, outcomeCount: mode.outcomeCount, ...mode.analysis, confidenceInterval95: "unavailable (exact source distribution)", convergence: "unavailable (not sampled)", seed: mode.sampleSeed, sampleCount: mode.sampleCount})})),
            {title: section, rows: rows({...pack.statistics, estimates: pack.statistics.estimates.map(attachment => ({hash: attachment.hash, report: attachment.value}))})},
        ];
        if (section === "reproduction") return [{title: section, rows: rows({...pack.reproduction, recordings: pack.reproduction.recordings.map(recording => ({hash: recording.hash, recording: recording.value}))})}];
        if (section === "validation") return [table, {title: "Deep source validation", rows: rows(index.deepValidation.issues)}];
        return [table];
    });
}
function html(value: string): string {
    return value.replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]!));
}
function markdown(value: string): string {
    return html(value).replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>").replace(/[`*_[\]\\]/g, "\\$&");
}

export class CertificationPackRenderer implements CertificationPackRendering {
    public async render(index: CertificationPackIndex, format: CertificationPackFormat, inputTemplate?: CertificationPackTemplate, signal?: AbortSignal): Promise<string | Buffer> {
        if (signal?.aborted) throw new CertificationPackBuildCancelledError();
        const template = inputTemplate ?? index.presentation.template;
        const tables = certificationPackTables(index, template);
        switch (format) {
            case "json": return JSON.stringify(index, null, 4) + "\n";
            case "console": return `${template.title}\n${template.introduction}\n${CERTIFICATION_PREPARATION_NOTICE}\n\n${tables.map(table => `${table.title}\n${table.rows.map(([key, value]) => `${key}: ${value}`).join("\n")}`).join("\n\n")}\n`;
            case "markdown": return `# ${markdown(template.title)}\n\n${markdown(template.introduction)}\n\n${CERTIFICATION_PREPARATION_NOTICE}\n\n${tables.map(table => `## ${markdown(table.title)}\n\n| Field | Evidence |\n| --- | --- |\n${table.rows.map(([key, value]) => `| ${markdown(key)} | ${markdown(value)} |`).join("\n")}`).join("\n\n")}\n`;
            case "html": return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${html(template.title)}</title><style>body{font:14px sans-serif;margin:2em}table{border-collapse:collapse;width:100%;margin-bottom:2em}td,th{border:1px solid #999;padding:6px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}td:first-child{width:32%}</style></head><body><h1>${html(template.title)}</h1><p>${html(template.introduction)}</p><p>${html(CERTIFICATION_PREPARATION_NOTICE)}</p>${tables.map(table => `<h2>${html(table.title)}</h2><table><thead><tr><th>Field</th><th>Evidence</th></tr></thead><tbody>${table.rows.map(([key, value]) => `<tr><td>${html(key)}</td><td>${html(value)}</td></tr>`).join("")}</tbody></table>`).join("")}</body></html>\n`;
            case "pdf": {
                const pdf = await renderLocalPackPdf(template, tables, signal);
                return pdf;
            }
            default: throw new Error(`Unsupported pack format: ${String(format)}. YAML is optional and unimplemented.`);
        }
    }
}
