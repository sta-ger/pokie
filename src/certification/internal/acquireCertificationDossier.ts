import {simulateOutcomeSourceProject} from "../../project/simulateOutcomeSourceProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../project/ProjectCapabilities.js";
import {projectOutcomeSourceSimulationReport} from "../../reporting/projectOutcomeSourceSimulationReport.js";
import {SeededWeightedOutcomeRandomSource} from "../../pregenerated/SeededWeightedOutcomeRandomSource.js";
import {parseCertificationJson} from "./parseCertificationJson.js";
import {ParallelSimulationRunner} from "../../simulation/parallel/ParallelSimulationRunner.js";
import {SimulationReportBuilder} from "../../reporting/SimulationReportBuilder.js";
import fs from "fs";
import path from "path";
import {MathDefinitionSourceReader} from "../../diff/MathDefinitionSourceReader.js";
import type {MathDefinitionSnapshot} from "../../diff/MathDefinitionDiff.js";
import {loadPokieGameRuntime} from "../../gamepackage/loadPokieGame.js";
import {toCanonicalJson} from "../../json/toCanonicalJson.js";
import {AuditRoundReplay, validateAuditRoundRecording} from "../../replay/AuditRoundReplay.js";
import type {SimulationReport} from "../../reporting/SimulationReport.js";
import {validateSimulationReportExtensions, validateSimulationStatisticsForReport} from "../../reporting/validateSimulationReportExtensions.js";
import type {OutcomeLibraryBundleManifest} from "../../weightedoutcome/bundle/OutcomeLibraryBundleManifest.js";
import {CERTIFICATION_METRIC_SEMANTICS, CERTIFICATION_PREPARATION_NOTICE, type CertificationDossier, type CertificationDossierInputs} from "../CertificationDossier.js";
import {CertificationEvidenceBundleBuildCancelledError} from "../CertificationEvidenceBundleBuildOptions.js";
import {sha256OfBytes} from "./sha256OfBytes.js";

export function dossierHash(value: unknown): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson(value)));
}

/** Paths are caller-selected, physical, bounded inputs. Directory identity includes every executable/config byte. */
export function certificationSourceHash(source: string): string {
    const entries: {name: string; hash: string}[] = [];
    let bytes = 0;
    const visit = (file: string, name: string): void => {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) throw new Error(`Dossier source contains a symbolic link: ${name}`);
        if (stat.isDirectory()) {
            for (const child of fs.readdirSync(file).sort()) {
                if (["node_modules", ".git"].includes(child)) continue;
                visit(path.join(file, child), `${name}/${child}`);
            }
        } else {
            if (!stat.isFile() || (bytes += stat.size) > 64 * 1024 * 1024 || entries.length >= 10000) throw new Error("Dossier source exceeds the 64 MiB / 10000 file acquisition limit.");
            entries.push({name, hash: sha256OfBytes(fs.readFileSync(file))});
        }
    };
    visit(source, ".");
    return dossierHash(entries);
}

export function stableDefinition(snapshot: MathDefinitionSnapshot): MathDefinitionSnapshot {
    const result = JSON.parse(JSON.stringify(snapshot)) as MathDefinitionSnapshot;
    Reflect.deleteProperty(result.identity, "location");
    return result;
}

export function validateDossierReport(value: unknown, modelHash: string | null, source: OutcomeLibraryBundleManifest): asserts value is SimulationReport {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a canonical simulation report.");
    const report = value as SimulationReport;
    if (report.schemaVersion !== 1) throw new Error("Unsupported or legacy report version; regenerate a canonical v1 report from the selected runtime.");
    validateSimulationReportExtensions(value as Record<string, unknown>);
    if (report.game?.id !== source.game.id || report.game?.name !== source.game.name || report.game?.version !== source.game.version || !report.reproducibility) throw new Error("Simulation report game/provenance differs from the selected source.");
    if (report.reproducibility.libraryHash !== undefined) {
        const native = report as SimulationReport & {libraryHash?: string; libraryId?: string; modeName?: string};
        const mode = source.modes.find(entry => entry.modeName === native.modeName);
        validateSimulationStatisticsForReport(Reflect.get(native, "statistics"));
        if (report.targetRtp !== undefined) throw new Error("Native outcome bundles have no declared RTP target authority; do not infer one from their exact distribution.");
        if (!mode || report.reproducibility.configHash !== undefined || mode.libraryHash !== report.reproducibility.libraryHash || mode.libraryHash !== native.libraryHash || mode.libraryId !== native.libraryId || report.betMode !== native.modeName) throw new Error("Outcome-source report does not bind the selected mode/library; a library hash is not a model hash.");
    } else if (!modelHash || report.reproducibility.configHash !== modelHash) throw new Error("Simulation report does not bind the selected actual model; game name/version alone is insufficient.");
    if (report.reproducibility.seed !== report.seed || dossierHash(report.reproducibility.game) !== dossierHash(report.game)) throw new Error("Contradictory simulation seed/game reproducibility metadata.");
    if (report.reproducibility.pokieVersion !== source.artifactPokieVersion) throw new Error("Simulation report runtime version is incompatible with the source artifacts.");
    for (const field of ["totalBet", "totalWin", "rtp", "hitFrequency", "maxWin", "durationMs", "spinsPerSecond"] as const) if (!Number.isFinite(report[field]) || report[field] < 0) throw new Error(`Invalid simulation report ${field}.`);
    if (!Number.isSafeInteger(report.rounds) || !Number.isSafeInteger(report.requestedRounds) || report.rounds < 0 || report.requestedRounds < report.rounds || report.reproducibility.actualRounds !== report.rounds || report.reproducibility.requestedRounds !== report.requestedRounds) throw new Error("Inconsistent simulation report populations.");
    if (report.targetRtp === undefined && report.rtpDeviation !== undefined || report.targetRtp !== undefined && (!Number.isFinite(report.targetRtp) || !Number.isFinite(report.rtpDeviation) || Math.abs(report.rtpDeviation! - (report.rtp - report.targetRtp)) > 1e-10)) throw new Error("Simulation target/deviation metadata is inconsistent; deviations use ratio units.");
    if (report.totalBet > 0 && Math.abs(report.rtp - report.totalWin / report.totalBet) > 1e-10) throw new Error("Simulation report RTP contradicts its stake/payout amounts.");
    if (report.reproducibility.libraryHash === undefined && report.betMode !== undefined && !source.modes.some(mode => mode.betMode === report.betMode)) throw new Error("Simulation report mode is not in the selected source.");
}

function readJson(file: string): {hash: string; raw: string; value: unknown} {
    certificationSourceHash(file);
    const bytes = fs.readFileSync(file);
    return {hash: sha256OfBytes(bytes), raw: bytes.toString("utf8"), value: parseCertificationJson(bytes.toString("utf8"))};
}

export async function acquireCertificationDossier(source: OutcomeLibraryBundleManifest, sourceBundleManifestHash: string, providedInputs: CertificationDossierInputs | undefined, signal?: AbortSignal, sourceBundleDir?: string): Promise<CertificationDossier> {
    const inputs = providedInputs ?? {};
    const check = (): void => {
        if (signal?.aborted) throw new CertificationEvidenceBundleBuildCancelledError();
    };
    check();
    let definition: MathDefinitionSnapshot | null = null;
    let modelHash: string | null = null;
    let modelArtifactHash: string | null = null;
    let loaded: Awaited<ReturnType<typeof loadPokieGameRuntime>> | undefined;
    try {
        if (inputs.modelSource) {
            modelArtifactHash = certificationSourceHash(inputs.modelSource);
            if (fs.statSync(inputs.modelSource).isDirectory()) loaded = await loadPokieGameRuntime(inputs.modelSource);
            definition = stableDefinition(await new MathDefinitionSourceReader().read(loaded?.game ?? inputs.modelSource, {signal}));
            check();
            if (["invalid", "failed", "cancelled", "unsupported"].includes(definition.support)) throw new Error(`Model evidence acquisition ${definition.support}: ${definition.diagnostics.map(issue => issue.message).join("; ")}`);
            if (definition.identity.descriptorVersion !== 1 || definition.identity.blueprintSchemaVersion !== 1) throw new Error("Unsupported model descriptor/Blueprint version; expected 1. Legacy descriptors cannot establish a launch model.");
            modelHash = loaded ? loaded.game.getConfigHash?.() ?? null : definition.identity.revision ?? null;
            if (!modelHash || modelHash !== source.configHash || definition.identity.revision !== modelHash) throw new Error("Selected model identity does not match source artifact configHash and the acquired definition revision; caller labels are not model authority.");
            if (certificationSourceHash(inputs.modelSource) !== modelArtifactHash) throw new Error("Model source changed during acquisition.");
        }
        const estimates: CertificationDossier["statistics"]["estimates"][number][] = [];
        for (const file of inputs.reportFiles ?? []) {
            check();
            const attachment = readJson(file);
            validateDossierReport(attachment.value, modelHash, source);
            const report = attachment.value;
            if (report.seed === null || !report.seed.trim() || !report.reproducibility?.workerSeedStrategy || !Number.isSafeInteger(report.workers) || report.workers! < 1) throw new Error("Reproducible sampled evidence requires a seed, workers and seed strategy; otherwise keep statistics unavailable.");
            let reproduced: SimulationReport;
            let seedStrategy: string;
            if (report.reproducibility.libraryHash !== undefined) {
                if (!sourceBundleDir || report.workers !== 1 || !report.betMode) throw new Error("Outcome-source report reproduction requires the explicit source bundle, mode and single-process sampler.");
                const result = await simulateOutcomeSourceProject({type: "outcomeLibrary", rootPath: sourceBundleDir, capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary, provenance: "explicit dossier authority"}, report.betMode, report.requestedRounds, new SeededWeightedOutcomeRandomSource(report.seed), report.seed, {signal});
                if (!result.supported) throw new Error(result.diagnostic.message);
                reproduced = projectOutcomeSourceSimulationReport(result.report);
                if (dossierHash(Reflect.get(report, "statistics")) !== dossierHash(result.report.statistics)) throw new Error("Outcome-source statistics differ from deterministic execution.");
                const stableReplay = (value: unknown): unknown => {
                    if (!value || typeof value !== "object") return null;
                    const {timestamp: _time, durationMs: _duration, ...stable} = value as Record<string, unknown>;
                    return stable;
                };
                if (dossierHash(stableReplay(Reflect.get(report, "lastReplay"))) !== dossierHash(stableReplay(result.report.lastReplay))) throw new Error("Outcome-source replay sample differs from deterministic selection.");
                seedStrategy = result.report.workerSeedStrategy!;
            } else {
                if (!inputs.modelSource || !loaded) throw new Error("Runtime statistics require an explicitly selected executable package; a definition alone cannot grant execution.");
                const declaredTarget = loaded.game.getBetModes?.().find(mode => mode.id === report.betMode)?.targetRtp;
                if (report.targetRtp !== undefined && report.targetRtp !== declaredTarget) throw new Error("Simulation report declared RTP target differs from the selected model's mode declaration.");
                const result = await new ParallelSimulationRunner(inputs.modelSource, report.requestedRounds, {
                    seed: report.seed, workers: report.workers, signal, betModeId: report.betMode, convergence: report.convergence, requireCleanup: true,
                }).run();
                reproduced = new SimulationReportBuilder().build({...result, requestedRounds: report.requestedRounds, seed: report.seed, durationMs: report.durationMs, pokieVersion: source.artifactPokieVersion, targetRtp: report.targetRtp});
                if (result.configHash !== modelHash) throw new Error("Reproduced simulation model differs from the report.");
                seedStrategy = result.workerSeedStrategy;
            }
            const fields = ["rounds", "totalBet", "totalWin", "rtp", "hitFrequency", "maxWin", "averageBet", "averagePayout", "volatility", "averagePayoutConfidenceInterval95", "rtpConfidenceInterval95", "convergence", "stopReason", "diagnostics", "sampling", "logicalRounds", "analytics", "modifiers", "weightedBonus", "reelSequences", "breakdown", "jackpot", "payoutHistogram", "maxWinFrequency"] as const;
            for (const field of fields) {
                if (report[field] !== undefined && dossierHash(report[field]) !== dossierHash(reproduced[field])) throw new Error(`Simulation report ${field} differs from deterministic execution of the selected model.`);
            }
            if (report.reproducibility.workerSeedStrategy !== seedStrategy) throw new Error("Reproduced simulation model/seed strategy differs from the report.");
            estimates.push({hash: attachment.hash, raw: attachment.raw, value: report});
        }
        const recordings: CertificationDossier["reproduction"]["recordings"][number][] = [];
        if (inputs.replayFiles?.length) {
            if (!loaded) throw new Error("Executable replay requires an explicitly selected runtime package; build the model with pokie build first.");
            for (const file of inputs.replayFiles) {
                check();
                const attachment = readJson(file);
                validateAuditRoundRecording(attachment.value, loaded.game);
                new AuditRoundReplay().replay(loaded.game, attachment.value, signal);
                recordings.push({hash: attachment.hash, raw: attachment.raw, value: attachment.value});
            }
        }
        check();
        let coverage: CertificationDossier["support"]["coverage"] = "unavailable";
        if (definition) coverage = definition.support === "complete" ? "complete" : "partial";
        return {
            schemaVersion: 1,
            identity: {runtimeVersion: "pokie.session-runtime.v1", modelHash, modelArtifactHash, sourceBundleManifestHash, sourceBundleManifest: source, sourceRevision: inputs.sourceRevision ?? null, candidateRevision: inputs.candidateRevision ?? null},
            rules: {status: definition ? "available" : "unavailable", definition},
            statistics: {exact: "source-mode-distributions", semantics: CERTIFICATION_METRIC_SEMANTICS, estimates, unavailable: estimates.length ? estimates.flatMap((attachment, index) => ["rtpConfidenceInterval95", "convergence", "analytics", "stopReason"].filter(key => Reflect.get(attachment.value, key) === undefined).map(key => `Report ${index}: ${key} unavailable`)) : ["Sampled simulation, CI, convergence and feature statistics unavailable; exact outcome distributions have no sampling CI."]},
            validation: {source: "deep-at-build; shallow-and-sampled-at-verification", model: definition ? "advanced-declared-model" : "unavailable", assumptions: ["Declared model validation does not prove custom executable fidelity.", "Source outcome validation is exhaustive at build; verification rechecks structure and selected outcomes, not every outcome."]},
            reproduction: {selection: "seeded-native-weighted-outcome", runtime: recordings.length ? "audit-round-v1" : "unavailable", recordings, commands: ["pokie certification build SOURCE CONFIG.json --out NEW_DOSSIER", "pokie certification verify DOSSIER --source SOURCE --authorities AUTHORITIES.json", "pokie report DOSSIER/manifest.json --format pdf --out dossier.pdf"], variableMetadata: ["generatedAt", "sourceBundleDir", "deepValidation.ranAt", "simulation durationMs/spinsPerSecond and command paths are observational; attached raw report hashes remain exact"]},
            support: {notice: CERTIFICATION_PREPARATION_NOTICE, coverage, limitations: [...(definition?.limits ?? []), "Local PDF uses selectable standard-font text with lossless [U+XXXX] notation for non-ASCII characters; JSON/HTML retain Unicode glyphs.", ...(!definition ? ["Readable originating model unavailable; outcome-only evidence cannot establish model rules or executable fidelity."] : []), ...(recordings.length ? ["Runtime replay covers only attached captures; partial captures remain partial."] : ["Executable state/command replay unavailable; outcome selection is not runtime replay."]), "SDK evidence unavailable: local compatibility is not provider acceptance.", "Fairness evidence unavailable: deterministic/HMAC verification cannot prove precommit timing or general game fairness."], sdk: "unavailable", fairness: "unavailable", yaml: "unimplemented; optional, non-mandatory"},
        };
    } finally {
        await releaseDossierRuntime(loaded);
    }
}

async function releaseDossierRuntime(loaded: Awaited<ReturnType<typeof loadPokieGameRuntime>> | undefined): Promise<void> {
    if (!loaded) return;
    const failures: unknown[] = [];
    try {
        await loaded.game.release?.();
    } catch (error) {
        failures.push(error);
    }
    try {
        await loaded.release();
    } catch (error) {
        failures.push(error);
    }
    if (failures.length) throw new Error(`Dossier runtime cleanup failed: ${failures.map(String).join("; ")}`);
}
