import fs from "node:fs";
import path from "node:path";
import * as api from "@fromstan/pokie";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {OptimizeCommand} from "../../cli/commands/OptimizeCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {dispatch} from "../../cli/dispatch.js";
import {StudioArtifactBuildService} from "../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {optimizationBlueprint, optimizationRequest} from "./fixtures/OptimizationFixture.js";

// Source-aware Producer prerequisites, not installed-candidate, browser or blind
// first-contact evidence. No independent finding is closed by these tests.
describe("V2C-34 Producer contracts", () => {
    let directory: string;
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;
    let builds: StudioArtifactBuildService;
    const output = () => log.mock.calls.flat().join("\n");
    const diagnostic = () => error.mock.calls.flat().join("\n");

    beforeEach(() => {
        directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera34-"));
        log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        error = jest.spyOn(console, "error").mockImplementation(() => undefined);
        builds = new StudioArtifactBuildService(api.POKIE_VERSION);
    });
    afterEach(async () => {
        await builds.cancelAll();
        jest.restoreAllMocks();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    async function design(): Promise<string> {
        const source = path.join(directory, "Producer design.blueprint.json");
        const create = new CreateCommand(api.POKIE_VERSION);
        expect(await dispatch([create], ["node", "pokie", "create", "producer", "--blank", "--out", source], api.POKIE_VERSION)).toBe(0);
        expect(await new api.ProjectTargetResolver().resolve(source)).toMatchObject({type: "blueprint"});
        const edited: api.GameBlueprint = {
            manifest: {id: "producer", name: "Producer design", version: "0.1.0"},
            reels: 3, rows: 1, symbols: ["A"], reelStrips: [["A"], ["A"], ["A"]],
            availableBets: [0.05], paytable: {A: {3: 2}}, paylines: [[0, 0, 0]],
        };
        // Explicitly authored bytes; preview/build must never save an editor draft.
        fs.writeFileSync(source, JSON.stringify(edited));
        return source;
    }

    it("corrects invalid authoring without publication, then previews, builds and plays the selected design", async () => {
        const source = await design();
        const original = fs.readFileSync(source);
        const destination = path.join(directory, "playable.wasm");
        const invalid = api.loadGameBlueprint(source);
        invalid.rows = 0;
        fs.writeFileSync(source, JSON.stringify(invalid));
        expect(await builds.build(source, "wasm", destination)).toMatchObject({status: "unsupported", message: expect.any(String)});
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.existsSync(api.wasmComponentManifestSidecarPath(destination))).toBe(false);
        expect(api.loadGameBlueprint(source).rows).toBe(0);

        fs.writeFileSync(source, original);
        expect(await builds.preview(source, "wasm", destination)).toMatchObject({
            status: "ok", destination, sourceType: "blueprint", destinationKind: "file",
        });
        expect(fs.existsSync(destination)).toBe(false);
        const progress: api.ArtifactBuildProgress[] = [];
        expect(await builds.build(source, "wasm", destination, {onProgress: event => progress.push(event)})).toMatchObject({
            status: "ok", outputPath: destination, outputKind: "file", sourceType: "blueprint", target: "wasm",
        });
        expect(progress.map(event => event.status)).toEqual(["running", "completed"]);
        expect(await new api.ProjectTargetResolver().resolve(destination)).toMatchObject({type: "wasm", rootPath: destination});
        const runtime = await api.loadPokieWasmFileRuntime(destination, new api.SeededPokieWasmHost("producer34"));
        try {
            expect(runtime.manifest.component).toEqual({id: "producer", version: "0.1.0"});
            expect(await runtime.createSession("producer34").play({bet: 0.05})).toMatchObject({
                stake: 0.05, payout: 0.1, screen: [["A"], ["A"], ["A"]],
            });
        } finally {
            runtime.dispose();
        }
        expect(fs.readFileSync(source)).toEqual(original);
    });

    it("preserves occupied output and source bytes, and retries into a new destination", async () => {
        const source = await design();
        const original = fs.readFileSync(source);
        const occupied = path.join(directory, "owned package");
        fs.mkdirSync(occupied);
        fs.writeFileSync(path.join(occupied, "producer-notes.txt"), "Keep my design notes.");
        expect(await builds.preview(source, "tsPackage", occupied)).toMatchObject({status: "conflict"});
        expect(await builds.build(source, "tsPackage", occupied)).toMatchObject({status: "conflict"});
        expect(fs.readdirSync(occupied)).toEqual(["producer-notes.txt"]);
        expect(fs.readFileSync(path.join(occupied, "producer-notes.txt"), "utf8")).toBe("Keep my design notes.");
        const destination = path.join(directory, "new package");
        expect(await builds.build(source, "tsPackage", destination)).toMatchObject({status: "ok", outputPath: destination});
        expect(await new api.ProjectTargetResolver().resolve(destination)).toMatchObject({type: "tsPackage"});
        expect(fs.readFileSync(source)).toEqual(original);
    });

    it("cancels real artifact work, waits for cleanup and permits a corrected retry", async () => {
        const source = await design();
        const original = fs.readFileSync(source);
        const destination = path.join(directory, "cancelled package");
        const controller = new AbortController();
        const phases: string[] = [];
        const result = await builds.build(source, "tsPackage", destination, {
            signal: controller.signal,
            onProgress: event => {
                phases.push(event.status);
                if (event.status === "running") controller.abort();
            },
        });
        expect(phases).toContain("running");
        expect(phases).not.toContain("completed");
        expect(result).toMatchObject({status: "cancelled", plan: {status: "planned"}});
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.readdirSync(directory)).toEqual([path.basename(source)]);
        expect(fs.readFileSync(source)).toEqual(original);
        expect(await builds.build(source, "tsPackage", destination)).toMatchObject({status: "ok", outputPath: destination});
        expect(fs.existsSync(path.join(destination, "dist/index.js"))).toBe(true);
        expect(fs.readFileSync(source)).toEqual(original);
    });

    it.each([
        {status: "exhausted", budget: 1, target: 0.75, exit: 5, exhaustive: false},
        {status: "infeasible", budget: 3, target: 0.9, exit: 2, exhaustive: true},
    ])("presents $status separately from completion or target attainment", async ({status, budget, target, exit, exhaustive}) => {
        const source = path.join(directory, "optimization.json");
        fs.writeFileSync(source, JSON.stringify(optimizationBlueprint()));
        const original = fs.readFileSync(source);
        const request = optimizationRequest();
        request.policy.budget = budget;
        request.targets[0].value = target;
        const policy = path.join(directory, "policy.json");
        fs.writeFileSync(policy, JSON.stringify(request));
        const destination = path.join(directory, "unattained.json");
        const scratch = path.join(directory, "scratch");
        const command = new OptimizeCommand(new api.ProjectOptimizationService(scratch));
        expect(await command.run([source, "--policy", policy, "--out", destination])).toBe(exit);
        expect(JSON.parse(output())).toMatchObject({status, evidence: {
            request, exhaustive, consumedWork: budget, evaluated: budget,
        }});
        expect(JSON.parse(output()).output).toBeUndefined();
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.readFileSync(source)).toEqual(original);
        expect(fs.readdirSync(scratch)).toEqual([]);
    });

    it("retains units, locks, budget and diff in review, saves only explicitly and rejects stale authored Apply", async () => {
        const source = path.join(directory, "optimization.json");
        fs.writeFileSync(source, JSON.stringify(optimizationBlueprint()));
        const original = fs.readFileSync(source);
        const policy = path.join(directory, "policy.json");
        const request = optimizationRequest();
        fs.writeFileSync(policy, JSON.stringify(request));
        const scratch = path.join(directory, "scratch");
        const command = new OptimizeCommand(new api.ProjectOptimizationService(scratch));
        const listeners = process.rawListeners("SIGINT");
        expect(await command.run([source, "--policy", policy])).toBe(0);
        const review = output();
        expect(JSON.parse(review)).toMatchObject({status: "success", evidence: {
            request, measured: [0.75], diff: [{path: "/paytable/A/2", before: 2, after: 3}],
        }, review: {sourcePath: source, sourceRevision: expect.any(String), candidateRevision: expect.any(String)}});
        expect(JSON.parse(review).candidate).toBeUndefined();
        expect(JSON.parse(review).output).toBeUndefined();
        expect(fs.readFileSync(source)).toEqual(original);
        expect(fs.readdirSync(scratch)).toEqual([]);

        log.mockClear();
        const destination = path.join(directory, "saved candidate.json");
        expect(await command.run([source, "--policy", policy, "--out", destination])).toBe(0);
        expect(JSON.parse(output())).toMatchObject({status: "success", output: {path: destination, type: "blueprint"}});
        expect(api.loadGameBlueprint(destination).paytable.A[2]).toBe(3);
        expect(fs.readFileSync(source)).toEqual(original);

        const reviewPath = path.join(directory, "review.json");
        fs.writeFileSync(reviewPath, review);
        fs.appendFileSync(source, "\n ");
        const changed = fs.readFileSync(source);
        log.mockClear();
        expect(await command.run([source, "--policy", policy, "--apply", reviewPath])).toBe(1);
        expect(JSON.parse(output())).toMatchObject({status: "failure", diagnostics: [{message: expect.stringContaining("run a fresh preview")}]});
        expect(fs.readFileSync(source)).toEqual(changed);
        expect(process.rawListeners("SIGINT")).toEqual(listeners);
        expect(fs.readdirSync(scratch)).toEqual([]);

        // The author restores the reviewed bytes before explicitly approving Apply.
        fs.writeFileSync(source, original);
        log.mockClear();
        expect(await command.run([source, "--policy", policy, "--apply", reviewPath])).toBe(0);
        expect(JSON.parse(output())).toMatchObject({status: "success", output: {path: source, type: "blueprint"}});
        expect(api.loadGameBlueprint(source).paytable.A[2]).toBe(3);
        expect(api.loadGameBlueprint(source).reelStrips).toEqual(optimizationBlueprint().reelStrips);
        expect(process.rawListeners("SIGINT")).toEqual(listeners);
        expect(fs.readdirSync(scratch)).toEqual([]);
    });

    it("rejects wrong report input, then renders real sampled evidence and a preparation-only dossier with valid downloads", async () => {
        const source = await design();
        const original = fs.readFileSync(source);
        const reportCommand = new ReportCommand();
        const invoke = (...args: string[]) => dispatch([reportCommand], ["node", "pokie", "report", ...args], api.POKIE_VERSION);
        const download = path.join(directory, "report.html");
        expect(await invoke(source, "--format", "html", "--out", download)).toBe(1);
        expect(diagnostic()).toContain("not a simulation report");
        expect(diagnostic()).toContain("pokie inspect");
        expect(fs.existsSync(download)).toBe(false);

        const library = path.join(directory, "outcomes");
        expect(await builds.build(source, "outcomeLibrary", library)).toMatchObject({status: "ok", outputPath: library});
        const project = (await new api.ProjectTargetResolver().resolve(library))!;
        const simulated = await api.simulateOutcomeSourceProject(project, "base", 4, new api.SeededWeightedOutcomeRandomSource("producer34"), "producer34");
        if (!simulated.supported) throw new Error("Expected the built library to support sampling");
        const report = api.projectOutcomeSourceSimulationReport(simulated.report);
        expect(report).toMatchObject({game: api.loadGameBlueprint(source).manifest, rounds: 4, requestedRounds: 4, rtp: 2,
            reproducibility: {libraryHash: simulated.report.libraryHash, actualRounds: 4}});
        const reportPath = path.join(directory, "simulation.json");
        fs.writeFileSync(reportPath, JSON.stringify(report));
        const reportBytes = fs.readFileSync(reportPath);
        expect(await invoke(reportPath, "--format", "pdf", "--out", download)).toBe(1);
        expect(diagnostic()).toContain("require a canonical dossier");
        expect(fs.existsSync(download)).toBe(false);
        expect(await invoke(reportPath, "--format", "html", "--out", download)).toBe(0);
        expect(fs.readFileSync(download, "utf8")).toContain("Producer design");
        expect(fs.readFileSync(reportPath)).toEqual(reportBytes);

        const evidence = path.join(directory, "evidence");
        const inputs = {reportFiles: [reportPath]};
        const built = await new api.CertificationEvidenceBundleBuilder(api.POKIE_VERSION).buildFromBundle(library,
            [{modeName: "base", seed: "producer34", sampleCount: 2}], evidence, {dossier: inputs});
        expect(built.issues).toEqual([]);
        expect(built.manifest).toMatchObject({game: api.loadGameBlueprint(source).manifest, dossier: {
            rules: {status: "unavailable"}, support: {coverage: "unavailable", notice: api.CERTIFICATION_PREPARATION_NOTICE},
            statistics: {exact: "source-mode-distributions", estimates: [{value: {rounds: 4}}]},
        }});
        expect(await new api.CertificationEvidenceBundleVerifier().verify(evidence, {sourceBundleDir: library, dossier: inputs})).toEqual([]);
        const pdf = path.join(directory, "dossier.pdf");
        const manifest = path.join(evidence, "manifest.json");
        expect(await invoke(manifest, "--format", "pdf", "--out", pdf)).toBe(0);
        const bytes = fs.readFileSync(pdf);
        expect(bytes.toString()).toContain("%PDF-1.4");
        expect(bytes.toString()).toContain("preparation only");
        expect(bytes.toString()).toContain("unavailable");
        expect(await invoke(manifest, "--format", "pdf", "--out", pdf)).toBe(1);
        expect(fs.readFileSync(pdf)).toEqual(bytes);
        fs.appendFileSync(reportPath, "\n ");
        expect(await new api.CertificationEvidenceBundleVerifier().verify(evidence, {sourceBundleDir: library, dossier: inputs}))
            .toEqual(expect.arrayContaining([expect.objectContaining({code: "certification-dossier-authority-mismatch", severity: "error"})]));
        expect(fs.readFileSync(source)).toEqual(original);
    });
});
