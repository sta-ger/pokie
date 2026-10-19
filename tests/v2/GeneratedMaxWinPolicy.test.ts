import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import * as api from "@fromstan/pokie";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {DiffCommand} from "../../cli/commands/DiffCommand.js";
import {PACKAGE_EXTRACTION_TEST_TIMEOUT, writeDescriptorPackage} from "./fixtures/PackageExtractionFixture.js";

// Exact model from the retained installed-consumer-recovery-rerun/consumer/valid.json.
// Source regressions only: native installation and production compilation remain controller-owned.
const model: api.GameBlueprint = {manifest: {id: "valid", name: "Valid", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"], reelStrips: [["A", "B"], ["B", "A"]], paytable: {A: {2: 2}, B: {2: 1}}, availableBets: [0.05, 7.5]};
const none: api.MathDefinitionMaxWinPolicy = {type: "none", scope: "logical-round", authority: "POKIE generated runtime: no payout cap"};
const declared: api.MathDefinitionMaxWinPolicy = {type: "declared", value: 7.5, unit: "currency", scope: "paid-entry", authority: "explicit collaborator"};
const unknown: api.MathDefinitionMaxWinPolicy = {type: "unknown", authority: "explicit unknown"};
const malformed = {...declared, value: "7.5"};

function expectFidelityBoundary(report: api.AdvancedModelValidationReport): void {
    expect(report).toMatchObject({status: "unsupported", verdict: "inconclusive", structuralValid: true, executableFidelity: "unverified"});
    expect(report.checks).toContainEqual(expect.objectContaining({id: "source.executable-fidelity", status: "unknown"}));
}
function expectDefault(snapshot: api.MathDefinitionSnapshot, kind: string): void {
    expect(snapshot).toMatchObject({support: "complete", identity: {kind, descriptorKind: "generated", descriptorVersion: 1, blueprintSchemaVersion: 1}, effective: {maxWinPolicy: none}});
    expect(snapshot.authored).not.toHaveProperty("maxWinPolicy");
    expect(snapshot.fields).toContainEqual({path: "maxWinPolicy", status: "defaulted", authority: none.authority});
    expect(snapshot.diagnostics.some(issue => issue.code === "max-win-policy-unknown")).toBe(false);
}

it.each(["cjs", "typed source"])("uses the generated descriptor default for the real %s renderer without asserting executable fidelity", async format => {
    const source = format === "cjs" ? api.renderBuiltGameModule(model, api.POKIE_VERSION) : ts.transpileModule(
        api.renderBuiltGameModuleSource(model, api.POKIE_VERSION),
        {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}},
    ).outputText;
    const module = {exports: {}};
    // Keep plain descriptor data in the reader's realm, as with the native CJS loader.
    // eslint-disable-next-line no-new-func -- execute only the current renderer's source in this test realm.
    new Function("require", "module", "exports", source)((name: string) => {
        if (name !== "@fromstan/pokie") throw new Error(`Unexpected generated dependency ${name}`);
        return api;
    }, module, module.exports);
    const game = module.exports as api.PokieGame;
    const descriptor = await game.getModelDescriptor!();
    expect(descriptor).toMatchObject({sourceKind: "generated", model});
    expect(descriptor).not.toHaveProperty("maxWinPolicy");
    const createSession = jest.spyOn(game, "createSession");
    const reader = new api.MathDefinitionSourceReader();
    const snapshot = await reader.read(game);
    expectDefault(snapshot, "package");
    expectFidelityBoundary(snapshot.advanced!);
    const projected = await api.validateMathDefinitionSnapshot(await reader.read(game, {analysisOnly: true}));
    expect(projected).toEqual(snapshot.advanced);
    expect(await new api.AdvancedModelSourceValidator(reader).validate(game)).toEqual(projected);
    const diff = await api.compareMathDefinitions(game, game);
    expect(diff.status).toBe("partial");
    expectDefault(diff.left, "package");
    expectDefault(diff.right, "package");
    expect(diff.left.advanced!.issues.some(issue => issue.code === "max-win-policy-unknown")).toBe(false);
    expect(diff.left.advanced!.checks).toContainEqual(expect.objectContaining({id: "invariants.runtime", status: "pass"}));
    expect(createSession).not.toHaveBeenCalled();
    createSession.mockRestore();
});

it("retains explicit policy precedence and custom/legacy unknown defaults across coordinated label and declaration edits", async () => {
    const descriptor: api.PackageModelDescriptor = {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "generated", model};
    const game: api.PokieGame = {getManifest: () => model.manifest, getModelDescriptor: () => descriptor, createSession: jest.fn(() => {
        throw new Error("Declaration analysis must not run borrowed executable code");
    })};
    const reader = new api.MathDefinitionSourceReader();
    for (const sourceKind of ["generated", "custom"] as const) {
        descriptor.sourceKind = sourceKind;
        for (const policy of [undefined, none, unknown, declared]) {
            if (policy === undefined) Reflect.deleteProperty(descriptor, "maxWinPolicy");
            else descriptor.maxWinPolicy = policy;
            const bytes = JSON.stringify(descriptor);
            const snapshot = await reader.read(game, {analysisOnly: true});
            const expected = policy ?? (sourceKind === "generated" ? none : {type: "unknown", authority: "Custom executable cap policy is undeclared"});
            expect(snapshot.effective).toHaveProperty("maxWinPolicy", expected);
            if (policy === undefined) expect(snapshot.authored).not.toHaveProperty("maxWinPolicy");
            else expect(snapshot.authored).toHaveProperty("maxWinPolicy", policy);
            expect(snapshot.fields).toContainEqual({path: "maxWinPolicy", status: policy ? "exact" : "defaulted", authority: expected.authority});
            const report = await api.validateMathDefinitionSnapshot(snapshot);
            expect(report.executableFidelity).toBe("unverified");
            expect(report.verdict).not.toBe("proved-within-assumptions");
            expect(report.issues.some(issue => issue.code === "max-win-policy-unknown")).toBe(expected.type === "unknown");
            expect(JSON.stringify(descriptor)).toBe(bytes);
        }
    }
    const legacy = {...game};
    Reflect.deleteProperty(legacy, "getModelDescriptor");
    const legacySnapshot = await reader.read(legacy, {analysisOnly: true});
    expect(legacySnapshot).toMatchObject({support: "partial", identity: {kind: "package", descriptorKind: "legacy"}, effective: {maxWinPolicy: {type: "unknown"}}});
    expect(game.createSession).not.toHaveBeenCalled();
    // The wrapper remains the authority for direct Blueprint declarations, even though its
    // internal extraction produces a generated descriptor with no policy.
    expect((await reader.read({kind: "blueprint", model, maxWinPolicy: unknown}, {analysisOnly: true})).effective).toHaveProperty("maxWinPolicy", unknown);
    expect((await reader.read({kind: "blueprint", model}, {analysisOnly: true})).effective).toHaveProperty("maxWinPolicy.type", "none");
});

it("shares generated defaults, explicit unknowns and malformed-policy rejection through package reads, validation and CLI diff with repaired reuse", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "generated-policy-"));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const reader = new api.MathDefinitionSourceReader();
    const sourceValidator = new api.AdvancedModelSourceValidator(reader);
    const validate = new ValidateCommand();
    const diff = new DiffCommand();
    const source = writeDescriptorPackage(root, {model});
    const blueprint = path.join(root, "valid.json");
    fs.writeFileSync(blueprint, JSON.stringify(model));
    try {
        for (const policy of [undefined, unknown, malformed, undefined, undefined]) {
            writeDescriptorPackage(root, {model, descriptorBody: `return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "generated", model${policy === undefined ? "" : `, maxWinPolicy: ${JSON.stringify(policy)}`}};`});
            const bytes = fs.readFileSync(path.join(source, "index.js"));
            const snapshot = await reader.read(source);
            const report = await sourceValidator.validate(source);
            log.mockClear();
            const exit = await validate.run([source, "--format", "json"]);
            const cli = JSON.parse(log.mock.calls[0][0]) as {valid: boolean; advanced: api.AdvancedModelValidationReport};
            expect(cli.valid).toBe(true);
            expect(cli.advanced).toEqual(report);
            if (policy === malformed) {
                expect(snapshot.support).toBe("failed");
                expect(snapshot.diagnostics).toContainEqual(expect.objectContaining({code: "package-model-read-failed", message: expect.stringContaining("maxWinPolicy: expected finite non-negative value and payout unit")}));
                expect(report).toMatchObject({status: "failed", verdict: "inconclusive"});
                expect(exit).toBe(3);
            } else {
                expect(exit).toBe(2); // Executable fidelity remains unknown even after the policy repair.
                expectFidelityBoundary(report);
                expect(report.issues.some(issue => issue.code === "max-win-policy-unknown")).toBe(policy === unknown);
                if (policy === undefined) expectDefault(snapshot, "tsPackage");
                else expect(snapshot.effective).toHaveProperty("maxWinPolicy", unknown);
            }
            log.mockClear();
            expect(await diff.run([blueprint, source, "--comparison", "definition", "--ci", "--format", "json"])).toBe(2);
            const comparison = JSON.parse(log.mock.calls[0][0]) as api.MathDefinitionDiff;
            expect(comparison.right).toMatchObject({identity: {kind: "tsPackage", descriptorKind: "generated"}});
            expect(comparison.right.effective).toEqual(snapshot.effective);
            expect(comparison.right.diagnostics).toEqual(snapshot.diagnostics);
            expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(bytes);
        }
    } finally {
        log.mockRestore();
        fs.rmSync(root, {recursive: true, force: true});
    }
}, PACKAGE_EXTRACTION_TEST_TIMEOUT);
