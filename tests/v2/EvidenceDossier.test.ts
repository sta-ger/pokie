import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {
    CERTIFICATION_DOSSIER_SECTIONS,
    CERTIFICATION_PREPARATION_NOTICE,
    CertificationDossierRenderer,
    OutcomeLibraryBundleWriter,
    buildRoundArtifact,
    WinEvaluationResult,
    ValueWinComponent,
    WinningValue,
    CertificationEvidenceBundleBuilder,
    CertificationEvidenceBundleValidator,
    CertificationEvidenceBundleVerifier,
    DEFAULT_CERTIFICATION_DOSSIER_TEMPLATE,
    type CertificationEvidenceBundleManifest,
} from "@fromstan/pokie";
import {buildSourceOutcomeLibraryBundle} from "../certification/CertificationEvidenceBundleTestFixtures.js";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";
import {fractionalBetBlueprint} from "../fixtures/math/FractionalBetFixture.js";

const modes = [{modeName: "base", seed: "evidence-seed", sampleCount: 3}];

describe("canonical evidence dossier", () => {
    let directory: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-dossier-"));
    });
    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("keeps unavailable evidence and metric semantics in every format, with readable multi-page PDF tables", async () => {
        const source = path.join(directory, "source"),
            out = path.join(directory, "out");
        await buildSourceOutcomeLibraryBundle(source, ["base", "buy"]);
        const result = await new CertificationEvidenceBundleBuilder("1.3.0").buildFromBundle(source, [...modes, {...modes[0], modeName: "buy"}], out);
        expect(result.issues).toEqual([]);
        const manifest = result.manifest!;
        expect(CERTIFICATION_DOSSIER_SECTIONS.every(section => section in manifest.dossier)).toBe(true);
        expect(manifest.dossier.support).toMatchObject({coverage: "unavailable", notice: CERTIFICATION_PREPARATION_NOTICE, sdk: "unavailable", fairness: "unavailable"});
        expect(await new CertificationEvidenceBundleValidator().validate(out)).toEqual([]);
        expect(await new CertificationEvidenceBundleVerifier().verify(out, {sourceBundleDir: source})).toEqual([]);
        for (const format of manifest.presentation.formats) {
            const rendered = await new CertificationDossierRenderer().render(manifest, format);
            const text = rendered.toString();
            expect(text).toContain("unavailable");
            expect(text).toContain("preparation only");
            expect(text).toContain("source-mode-distributions");
            if (format !== "pdf") expect(text).toContain("No blended all-mode RTP");
            if (format === "pdf") {
                expect(text.startsWith("%PDF-1.4")).toBe(true);
                expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
                expect(text).toContain("Exact mode base");
                expect(text).toContain("Exact mode buy");
                expect(text).toContain("Field                           Evidence");
                expect(text).toContain("startxref");
                const xref = Number(text.match(/startxref\n(\d+)/)![1]);
                expect(text.slice(xref, xref + 4)).toBe("xref");
            }
        }
        expect(Object.keys(result.artifactHashes!)).toEqual(result.files);
    });

    it("preserves tiny nonzero probabilities and fractional stakes, escaping authored template text", async () => {
        const source = path.join(directory, "source");
        const artifact = (roundId: string, amount: number) => buildRoundArtifact({roundId, provenance: {game: {id: "precision", name: "Precision", version: "1"}, pokieVersion: "1.3.0"}, betMode: "base", stake: 1e-7,
            steps: [{screen: [["A"]], winEvaluationResult: amount ? new WinEvaluationResult({valueWins: [new ValueWinComponent(new WinningValue("A", [[0, 0]], amount))]}) : new WinEvaluationResult<string>()}]});
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "precision", outcomes: [{id: "0", weight: 999999999999999, artifact: artifact("lose", 0)}, {id: "1", weight: 1, artifact: artifact("win", 5e-7)}]}], source);
        const result = await new CertificationEvidenceBundleBuilder("1.3.0").buildFromBundle(source, modes, path.join(directory, "out"));
        const fixture = result.manifest!;
        expect(fixture.modes[0].analysis.maxWinProbability).toBe(1e-15);
        const template = {...DEFAULT_CERTIFICATION_DOSSIER_TEMPLATE, title: "<script>alert('unsafe')</script>", introduction: "Fractional stakes: 0.05, 7.5, 1e-7; identity Зорка"};
        for (const format of ["json", "console", "markdown", "html", "pdf"] as const) {
            const text = (await new CertificationDossierRenderer().render(fixture, format, template)).toString();
            expect(text).toContain("1e-7");
            expect(text).toContain("1e-15");
            expect(text).toContain("unavailable");
            if (format === "html" || format === "markdown") {
                expect(text).not.toContain("<script>");
                expect(text).toContain("&lt;script&gt;");

            }
            if (format === "pdf") expect(text).toContain("[U+0417]");
        }
        await expect(new CertificationDossierRenderer().render(fixture, "html", {...template, sections: ["identity"]})).rejects.toThrow(/mandatory section/);
    });

    it("reproduces sampled outcome reports with a library identity and no invented model hash", async () => {
        const api = await import("@fromstan/pokie");
        const source = path.join(directory, "source"),
            reportFile = path.join(directory, "sampled.json"),
            out = path.join(directory, "out");
        await buildSourceOutcomeLibraryBundle(source);
        const simulated = await api.simulateOutcomeSourceProject({type: "outcomeLibrary", rootPath: source, capabilities: api.PROJECT_TYPE_CAPABILITIES.outcomeLibrary, provenance: "fixture"}, "base", 8, new api.SeededWeightedOutcomeRandomSource("s"), "s");
        if (!simulated.supported) throw new Error("expected supported sampler");
        const report = api.projectOutcomeSourceSimulationReport(simulated.report);
        expect(report.reproducibility?.configHash).toBeUndefined();
        expect(report.reproducibility?.libraryHash).toBe(simulated.report.libraryHash);
        fs.writeFileSync(reportFile, JSON.stringify(report));
        const built = await new CertificationEvidenceBundleBuilder("1.3.0").buildFromBundle(source, modes, out, {dossier: {reportFiles: [reportFile]}});
        expect(built.issues).toEqual([]);
        expect(built.manifest?.dossier.support.coverage).toBe("unavailable");
        expect(await new CertificationEvidenceBundleVerifier().verify(out, {sourceBundleDir: source, dossier: {reportFiles: [reportFile]}})).toEqual([]);
    });

    it("binds real model/report/replay bytes and reproduces relocated inputs in fresh ESM and CJS processes", async () => {
        const runtime = emitPublicRuntime();
        try {
            const script = path.join(runtime.directory, "dossier-process.mjs");
            fs.writeFileSync(script, `
import fs from "node:fs";
import path from "node:path";
import * as api from "@fromstan/pokie";
const root = process.argv[2];
const initialize = process.argv[3] === "initialize";
const modelSource = path.join(root, "model");
const reportFiles = [path.join(root, "report.json")];
const replayFiles = [path.join(root, "replay.json")];
if (initialize) {
    fs.mkdirSync(modelSource, {recursive: true});
    const blueprint = ${JSON.stringify(fractionalBetBlueprint([0.05, 7.5, 1e-7], true))};
    fs.writeFileSync(path.join(modelSource, "package.json"), JSON.stringify({name: "dossier-model", version: "1", pokie: {entry: "index.cjs"}}));
    fs.writeFileSync(path.join(modelSource, "index.cjs"), api.renderBuiltGameModule(blueprint, "1.3.0") + '\\nconst descriptor = module.exports.getModelDescriptor; module.exports.getModelDescriptor = () => ({...descriptor(), sourceKind: "custom"});');
    const loaded = await api.loadPokieGameRuntime(modelSource);
    try {
        const generated = await api.generateExactWeightedOutcomeLibrary({libraryId: "actual-model", game: loaded.game, pokieVersion: "1.3.0"});
        const written = await new api.OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: generated.library.libraryId, outcomes: generated.library.outcomes, generator: generated.diagnostics}], path.join(root, "source"));
        if (!written.manifest) throw new Error(JSON.stringify(written.issues));
        const context = {seed: "audit-seed"};
        const session = loaded.game.createSession(context); session.setCreditsAmount(100);
        const audit = new api.ReplayRecorder().recordAudit(loaded.game, session, [{kind: "spin", roundId: "dossier-round", delivery: "composite", bet: 0.05}], {status: "calculated", durability: "detached", sessionId: "dossier"}, context).audit;
        fs.writeFileSync(replayFiles[0], JSON.stringify(audit));
    } finally {await loaded.release();}
    const simulation = await new api.ParallelSimulationRunner(modelSource, 16, {seed: "statistics", workers: 1}).run();
    const report = new api.SimulationReportBuilder().build({...simulation, requestedRounds: 16, seed: "statistics", durationMs: 12, pokieVersion: "1.3.0"});
    fs.writeFileSync(reportFiles[0], JSON.stringify(report));
}
const dossier = {modelSource, reportFiles, replayFiles, sourceRevision: "source-revision", candidateRevision: "candidate-revision"};
const out = path.join(root, initialize ? "dossier" : "reproduced");
const built = await new api.CertificationEvidenceBundleBuilder("1.3.0").buildFromBundle(path.join(root, "source"), ${JSON.stringify(modes)}, out, {dossier});
if (!built.manifest) throw new Error(JSON.stringify(built.issues));
const issues = await new api.CertificationEvidenceBundleVerifier().verify(path.join(root, "dossier"), {sourceBundleDir: path.join(root, "source"), dossier});
console.log(JSON.stringify({pid: process.pid, issues, manifest: built.manifest, artifactHashes: built.artifactHashes}));
`);
            const root = path.join(runtime.directory, "original");
            const original = JSON.parse(execFileSync(process.execPath, [script, root, "initialize"], {encoding: "utf8", timeout: 120000})) as {pid: number; issues: unknown[]; manifest: CertificationEvidenceBundleManifest; artifactHashes: Record<string, string>};
            expect(original.pid).not.toBe(process.pid);
            expect(original.issues).toEqual([]);
            expect(original.manifest.dossier.support.coverage).toBe("partial");
            expect(original.manifest.dossier.rules.definition?.fields.length).toBeGreaterThan(0);
            expect(original.manifest.dossier.statistics.estimates).toHaveLength(1);
            expect(original.manifest.dossier.reproduction.runtime).toBe("audit-round-v1");
            expect(original.manifest.dossier.rules.definition?.advanced?.executableFidelity).toBe("unverified");
            const relocated = path.join(runtime.directory, "relocated");
            fs.cpSync(root, relocated, {recursive: true});
            fs.rmSync(root, {recursive: true});
            for (const extension of ["mjs", "cjs"]) {
                const launch = path.join(runtime.directory, `verify.${extension}`);
                const content = fs.readFileSync(script, "utf8");
                fs.writeFileSync(launch, extension === "mjs" ? content : `(async () => {${content.replace('import fs from "node:fs";', 'const fs = require("node:fs");').replace('import path from "node:path";', 'const path = require("node:path");').replace('import * as api from "@fromstan/pokie";', 'const api = require("@fromstan/pokie");')}})().catch(error => {console.error(error); process.exitCode = 1;});`);
                const cold = JSON.parse(execFileSync(process.execPath, [launch, relocated, "reproduce"], {encoding: "utf8", timeout: 120000})) as typeof original;
                expect(cold.pid).not.toBe(original.pid);
                expect(cold.issues).toEqual([]);
                expect(cold.manifest.evidenceContentHash).toBe(original.manifest.evidenceContentHash);
                expect(cold.manifest.dossier.identity).toEqual(original.manifest.dossier.identity);
                fs.rmSync(path.join(relocated, "reproduced"), {recursive: true});
            }
            const attackScript = path.join(runtime.directory, "dossier-attacks.mjs");
            fs.writeFileSync(attackScript, `
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import * as api from "@fromstan/pokie";
const root = process.argv[2], cert = path.join(root, "dossier"), source = path.join(root, "source"), modelSource = path.join(root, "model");
const authorities = {modelSource, reportFiles: [path.join(root, "report.json")], replayFiles: [path.join(root, "replay.json")], sourceRevision: "source-revision", candidateRevision: "candidate-revision"};
const original = JSON.parse(fs.readFileSync(path.join(cert, "manifest.json"), "utf8"));
const hash = raw => "sha256:" + crypto.createHash("sha256").update(raw).digest("hex");
const rejects = async dossier => {
    const issues = await new api.CertificationEvidenceBundleVerifier().verify(cert, {sourceBundleDir: source, dossier});
    assert(issues.some(issue => issue.code === "certification-dossier-authority-mismatch"), JSON.stringify(issues));
};
const publish = async manifest => {
    manifest.evidenceContentHash = api.computeCertificationEvidenceContentHash(manifest);
    fs.writeFileSync(path.join(cert, "manifest.json"), JSON.stringify(manifest));
    for (const format of manifest.presentation.formats) fs.writeFileSync(path.join(cert, "dossier." + (format === "markdown" ? "md" : format === "console" ? "txt" : format)), await new api.CertificationDossierRenderer().render(manifest, format));
};
let candidate = structuredClone(original);
candidate.dossier.identity.candidateRevision = "other-candidate";
await publish(candidate); await rejects(authorities); await publish(original);
const wrongModel = path.join(root, "wrong-model"); fs.cpSync(modelSource, wrongModel, {recursive: true});
fs.appendFileSync(path.join(wrongModel, "index.cjs"), "\\n// different executable artifact with identical public game identity\\n");
await rejects({...authorities, modelSource: wrongModel});
const simulation = await new api.ParallelSimulationRunner(modelSource, 16, {seed: "other-statistics", workers: 1}).run();
const otherReport = new api.SimulationReportBuilder().build({...simulation, requestedRounds: 16, seed: "other-statistics", durationMs: 12, pokieVersion: "1.3.0"});
candidate = structuredClone(original);
const rawReport = JSON.stringify(otherReport);
candidate.dossier.statistics.estimates[0] = {raw: rawReport, hash: hash(rawReport), value: otherReport};
await publish(candidate); await rejects(authorities); await publish(original);
const badReport = structuredClone(otherReport); badReport.totalWin += 1; badReport.rtp = badReport.totalWin / badReport.totalBet;
const badFile = path.join(root, "bad-report.json"); fs.writeFileSync(badFile, JSON.stringify(badReport));
const refused = await new api.CertificationEvidenceBundleBuilder("1.3.0").buildFromBundle(source, ${JSON.stringify(modes)}, path.join(root, "refused"), {dossier: {...authorities, reportFiles: [badFile]}});
assert(!refused.manifest && refused.issues.some(issue => /deterministic execution/.test(issue.message)), JSON.stringify(refused.issues));
assert(!fs.existsSync(path.join(root, "refused")));
candidate = structuredClone(original);
const recording = candidate.dossier.reproduction.recordings[0].value;
recording.deliveries[0].after.credits += 1;
const {hash: oldHash, ...body} = recording;
recording.hash = api.computeAuditRoundHash(body);
const rawReplay = JSON.stringify(recording);
candidate.dossier.reproduction.recordings[0] = {raw: rawReplay, hash: hash(rawReplay), value: recording};
await publish(candidate);
const replacedReplay = path.join(root, "rehashed-replay.json"); fs.writeFileSync(replacedReplay, rawReplay);
await rejects({...authorities, replayFiles: [replacedReplay]});
await publish(original);
console.log(JSON.stringify({closed: ["candidate", "model", "valid-report-substitution", "false-report-math", "rehashed-runtime-replay"]}));
`);
            console.info("V2C-27 fixture identities", JSON.stringify({evidenceContentHash: original.manifest.evidenceContentHash, modelHash: original.manifest.dossier.identity.modelHash, modelArtifactHash: original.manifest.dossier.identity.modelArtifactHash, sourceManifestHash: original.manifest.sourceBundleManifestHash, templateHash: original.manifest.presentation.templateHash, pdfHash: original.artifactHashes["dossier.pdf"]}));
            const attacks = JSON.parse(execFileSync(process.execPath, [attackScript, relocated], {encoding: "utf8", timeout: 120000})) as {closed: string[]};
            expect(attacks.closed).toEqual(["candidate", "model", "valid-report-substitution", "false-report-math", "rehashed-runtime-replay"]);
            const manifest = JSON.parse(fs.readFileSync(path.join(relocated, "dossier", "manifest.json"), "utf8")) as CertificationEvidenceBundleManifest;
            for (const format of ["json", "console", "markdown", "html", "pdf"] as const) {
                const text = (await new CertificationDossierRenderer().render(manifest, format)).toString();
                expect(text).toContain("partial");
                expect(text).toContain("unverified");
                expect(text).toContain("candidate-revision");
            }
        } finally {
            runtime.dispose();
        }
    }, 180000);
});
