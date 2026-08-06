import {validateLoadBlueprintRequest} from "../../../cli/studio/blueprint/validateLoadBlueprintRequest.js";
import {validateSaveBlueprintRequest} from "../../../cli/studio/blueprint/validateSaveBlueprintRequest.js";
import {validateOpenProjectRequest} from "../../../cli/studio/home/validateOpenProjectRequest.js";
import {validateDeploymentRunRequest} from "../../../cli/studio/deployment/validateDeploymentRunRequest.js";
import {validateStakeEngineExportRequest} from "../../../cli/studio/stakeengine/validateStakeEngineExportRequest.js";
import {validateStakeEngineExportValidateRequest} from "../../../cli/studio/stakeengine/validateStakeEngineExportValidateRequest.js";
import {validateRuntimeSpinRequest} from "../../../cli/studio/runtime/validateRuntimeSpinRequest.js";
import {validateStartRuntimeRequest} from "../../../cli/studio/runtime/validateStartRuntimeRequest.js";
import {validateOutcomeLibrarySelector} from "../../../cli/studio/outcomeLibrary/validateOutcomeLibrarySelector.js";
import {validateOutcomeLibrarySelectRequest} from "../../../cli/studio/outcomeLibrary/validateOutcomeLibrarySelectRequest.js";
import {validateCertificationSourceValidateRequest} from "../../../cli/studio/certification/validateCertificationSourceValidateRequest.js";
import {validateCertificationBuildRequest} from "../../../cli/studio/certification/validateCertificationBuildRequest.js";
import {validateFairnessConfigureRequest} from "../../../cli/studio/fairness/validateFairnessConfigureRequest.js";
import {validateFairnessGenerateRequest} from "../../../cli/studio/fairness/validateFairnessGenerateRequest.js";
import {validateFairnessVerifyRequest} from "../../../cli/studio/fairness/validateFairnessVerifyRequest.js";

// Phase 2's own starting point: this file freezes the *actual* shape of Studio's request/response
// contracts for the flows named in the phase's inventory, as executable assertions, before any
// redesign work touches them -- a future step that intentionally changes one of these contracts is
// expected to edit the matching `it` here too, not regress it by accident. This is deliberately not a
// re-test of what each validator already covers on its own (see validateDeploymentRunRequest.test.ts /
// validateReplayRequest.test.ts) -- it exists to pin the *cross-flow* shape differences and gaps an
// isolated per-file test suite doesn't make visible on its own.

describe("Contract baseline: New Blueprint (Open)", () => {
    it("Open Project takes only a projectRoot -- no blueprint, mode, or credentials", () => {
        expect(validateOpenProjectRequest({projectRoot: "/games/a"})).toEqual({projectRoot: "/games/a"});
        expect(() => validateOpenProjectRequest({})).toThrow('"projectRoot" is required.');
    });
});

describe("Contract baseline: Design Game (Load / Save)", () => {
    it("Load takes only a path; Save additionally takes an overwrite flag (defaulting to false) -- neither is scoped to the active project", () => {
        expect(validateLoadBlueprintRequest({path: "./blueprint.json"})).toEqual({path: "./blueprint.json"});
        expect(() => validateLoadBlueprintRequest({})).toThrow('"path" is required.');

        expect(validateSaveBlueprintRequest({path: "./blueprint.json", blueprint: {manifest: {id: "a"}}})).toEqual({
            path: "./blueprint.json",
            blueprint: {manifest: {id: "a"}},
            overwrite: false,
        });
        expect(() => validateSaveBlueprintRequest({blueprint: {}})).toThrow('"path" is required.');
        expect(() => validateSaveBlueprintRequest({path: "x"})).toThrow('"blueprint" is required.');
    });

    // "unvalidated save" contract: unlike Build (which runs the full GameBlueprintValidator before
    // writing anything -- see StudioBlueprintService.build()), Save's own request-validation layer only
    // checks that `blueprint` is present at all (`=== undefined`), never its shape, and
    // StudioBlueprintService.save() itself never calls validate() either -- it serializes and writes
    // whatever was sent, valid or not. A blueprint that would fail Validate/Build outright can still be
    // saved to disk via this same Load/Save pair Design Game's own guided editor uses. Frozen behavior,
    // not something this baseline changes.
    it("Save accepts a blueprint of any shape -- it is never validated at this layer or by the service that writes it, unlike Build", () => {
        expect(() => validateSaveBlueprintRequest({path: "x", blueprint: "not-a-blueprint-object"})).not.toThrow();
        expect(() => validateSaveBlueprintRequest({path: "x", blueprint: {}})).not.toThrow();
        expect(() => validateSaveBlueprintRequest({path: "x", blueprint: null})).not.toThrow();
    });

});

describe("Contract baseline: Runtime retry/debug", () => {
    it("a spin request's requestId is an optional idempotency key, and expectedSessionVersion an optional optimistic-concurrency guard", () => {
        expect(validateRuntimeSpinRequest({})).toEqual({requestId: undefined, expectedSessionVersion: undefined});
        expect(validateRuntimeSpinRequest({requestId: "retry-1", expectedSessionVersion: 3})).toEqual({requestId: "retry-1", expectedSessionVersion: 3});
        expect(() => validateRuntimeSpinRequest({requestId: 5})).toThrow('"requestId" must be a string when given.');
        expect(() => validateRuntimeSpinRequest({expectedSessionVersion: 0})).toThrow('"expectedSessionVersion" must be a positive integer when given.');
        expect(() => validateRuntimeSpinRequest({expectedSessionVersion: 1.5})).toThrow('"expectedSessionVersion" must be a positive integer when given.');
    });

    it("starting a runtime defaults debug to on (Studio's own full-inspection capture policy) and repositoryMode to 'memory'", () => {
        expect(validateStartRuntimeRequest({})).toEqual({
            host: undefined,
            port: undefined,
            debug: true,
            seed: undefined,
            repositoryMode: "memory",
            preGeneratedLibrarySelector: undefined,
            preGeneratedLibraryExpectedHash: undefined,
        });
        expect(validateStartRuntimeRequest({debug: false, repositoryMode: "file"})).toEqual(
            expect.objectContaining({debug: false, repositoryMode: "file"}),
        );
        expect(() => validateStartRuntimeRequest({debug: "yes"})).toThrow('"debug" must be a boolean when given.');
        expect(() => validateStartRuntimeRequest({repositoryMode: "disk"})).toThrow('"repositoryMode" must be "memory" or "file" when given.');
    });
});

describe("Contract baseline: Deployment (target/registry/preflight/deploy) vs. Stake Engine Export", () => {
    it("Deployment carries a targetId (looked up against the target registry) and a publish flag (false=preflight, true=deploy) -- Stake Engine Export has neither", () => {
        const deployment = validateDeploymentRunRequest({
            targetId: "local-json-example",
            modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
        });
        expect(deployment).toEqual({
            targetId: "local-json-example",
            modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
            publish: false,
        });
        expect("targetId" in deployment).toBe(true);
        expect("publish" in deployment).toBe(true);

        const exportRequest = validateStakeEngineExportRequest({
            modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}],
            outDir: "out",
        });
        expect("targetId" in exportRequest).toBe(false);
        expect("publish" in exportRequest).toBe(false);
    });

    it("Export (unlike Deployment) requires an outDir and defaults overwrite to false -- Deployment has no output-directory concept at all", () => {
        const exportRequest = validateStakeEngineExportRequest({modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}], outDir: "out"});
        expect(exportRequest).toEqual({modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}], outDir: "out", overwrite: false});
        expect(() => validateStakeEngineExportRequest({modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}]})).toThrow(
            '"outDir" must be a non-empty string.',
        );
        expect(
            "outDir" in validateDeploymentRunRequest({targetId: "t", modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}]}),
        ).toBe(false);
    });

    it("Export's own mode rows carry a per-mode 'cost' (Stake's payout-multiplier unit conversion) that Deployment's modes never need", () => {
        expect(() =>
            validateDeploymentRunRequest({targetId: "t", modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}]}),
        ).not.toThrow();
        expect(() => validateStakeEngineExportRequest({modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}], outDir: "out"})).toThrow(
            "modes[0].cost must be a number.",
        );
    });

    it("the Validate-only Stake Engine Export request carries just modes -- no outDir/overwrite, since it never writes anything", () => {
        const validateOnly = validateStakeEngineExportValidateRequest({modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}]});
        expect(validateOnly).toEqual({modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}]});
        expect("outDir" in validateOnly).toBe(false);
        expect("overwrite" in validateOnly).toBe(false);
    });
});

describe("Contract baseline: Outcome Libraries selector, and the missing package-to-library mapping", () => {
    it("a selector is one of exactly three kinds -- json/bundle/stakeengine -- each with its own required fields", () => {
        expect(validateOutcomeLibrarySelector({kind: "json", path: "lib.json"}, "selector")).toEqual({kind: "json", path: "lib.json"});
        expect(validateOutcomeLibrarySelector({kind: "bundle", bundleDir: "bundle", modeName: "base"}, "selector")).toEqual({
            kind: "bundle",
            bundleDir: "bundle",
            modeName: "base",
        });
        expect(validateOutcomeLibrarySelector({kind: "stakeengine", stakeDir: "stake", modeName: "base"}, "selector")).toEqual({
            kind: "stakeengine",
            stakeDir: "stake",
            modeName: "base",
        });
        expect(() => validateOutcomeLibrarySelector({kind: "csv"} as never, "selector")).toThrow(
            '"selector.kind" must be one of "json", "bundle", "stakeengine".',
        );
    });

    it("Select defaults an absent selector to {} rather than throwing a distinct 'missing selector' error", () => {
        expect(() => validateOutcomeLibrarySelectRequest({})).toThrow('"selector.kind" must be one of "json", "bundle", "stakeengine".');
    });

    // "missing package-to-library" contract: neither a Deployment nor a Stake Engine Export mode's
    // `modeName` is ever checked, at this request-validation layer, against the bet modes the active
    // project's own game package actually declares (see GameBlueprint's own `betModes`/`availableBets`).
    // A modeName that doesn't correspond to any real package bet mode is accepted here exactly like one
    // that does -- the only place that distinction is *ever* enforced is StakeEngineExportValidator's own
    // domain-level pass (modeName format/uniqueness/provenance across an already-loaded set of libraries,
    // never "does this name exist in the package"), which runs later against the resolved libraries, not
    // against the request. This is the current, frozen behavior -- not something this baseline changes.
    it("accepts a modeName that matches no bet mode the game package actually declares, for both Deployment and Stake Engine Export", () => {
        const noSuchMode = "totally-unrelated-mode-name-not-in-any-package";

        expect(() =>
            validateDeploymentRunRequest({
                targetId: "local-json-example",
                modes: [{modeName: noSuchMode, librarySelector: {kind: "json", path: "base.json"}}],
            }),
        ).not.toThrow();
        expect(() =>
            validateStakeEngineExportRequest({modes: [{modeName: noSuchMode, librarySelector: {kind: "json", path: "base.json"}, cost: 1}], outDir: "out"}),
        ).not.toThrow();
        expect(() => validateStakeEngineExportValidateRequest({modes: [{modeName: noSuchMode, librarySelector: {kind: "json", path: "base.json"}, cost: 1}]})).not.toThrow();

        // Nor does the outcome-library selector itself: a bundle/stakeengine selector's own `modeName`
        // is just a lookup key resolved lazily against the bundle/export directory on disk, never
        // cross-checked against the project's package at this layer either.
        expect(() => validateOutcomeLibrarySelector({kind: "bundle", bundleDir: "bundle", modeName: noSuchMode}, "selector")).not.toThrow();
    });
});

describe("Contract baseline: Certification (validate-source / build)", () => {
    it("Validate-source takes only a bundleDir -- Build additionally requires an outDir and a non-empty modes array", () => {
        expect(validateCertificationSourceValidateRequest({bundleDir: "./outcomes/bundle"})).toEqual({bundleDir: "./outcomes/bundle"});
        expect(() => validateCertificationSourceValidateRequest({})).toThrow('"bundleDir" must be a non-empty string.');

        expect(() =>
            validateCertificationBuildRequest({bundleDir: "./outcomes/bundle", modes: [{modeName: "base", seed: "s1", sampleCount: 10}]}),
        ).toThrow('"outDir" must be a non-empty string.');
        expect(() => validateCertificationBuildRequest({bundleDir: "./outcomes/bundle", outDir: "out"})).toThrow(
            '"modes" must be a non-empty array.',
        );
    });

    // "shape-only mode check" contract: unlike the UI's own `isModeValid` (CertificationTab.tsx), which
    // requires a positive integer sampleCount before a row counts as complete, this request-validation
    // layer only checks `typeof sampleCount === "number"` -- a non-positive or non-integer sample count
    // is accepted here exactly like a valid one. The only place that distinction is enforced is
    // CertificationEvidenceBundleBuilder's own domain-level pass, which runs later against the already-
    // validated request, never as a 400 here. This is the current, frozen behavior -- not something this
    // baseline changes.
    it("Build's own mode shape check is type-only -- it accepts a non-positive or non-integer sampleCount the UI's own isModeValid would reject", () => {
        expect(() =>
            validateCertificationBuildRequest({
                bundleDir: "./outcomes/bundle",
                outDir: "out",
                modes: [{modeName: "base", seed: "s1", sampleCount: -5}],
            }),
        ).not.toThrow();
        expect(() =>
            validateCertificationBuildRequest({
                bundleDir: "./outcomes/bundle",
                outDir: "out",
                modes: [{modeName: "base", seed: "s1", sampleCount: 1.5}],
            }),
        ).not.toThrow();
    });
});

describe("Contract baseline: Provably Fair (configure / generate / verify)", () => {
    it("Configure requires all four of bundleDir/modeName/serverSeed/clientSeed plus a numeric nonce -- Generate needs only bundleDir/commitment/serverSeed", () => {
        expect(() => validateFairnessConfigureRequest({bundleDir: "b", modeName: "base", serverSeed: "s", clientSeed: "c"})).toThrow(
            '"nonce" must be a number.',
        );
        expect(validateFairnessConfigureRequest({bundleDir: "b", modeName: "base", serverSeed: "s", clientSeed: "c", nonce: 1})).toEqual({
            bundleDir: "b",
            modeName: "base",
            serverSeed: "s",
            clientSeed: "c",
            nonce: 1,
        });

        expect(() => validateFairnessGenerateRequest({bundleDir: "b", commitment: {}, serverSeed: "s"})).not.toThrow();
        expect(() => validateFairnessGenerateRequest({bundleDir: "b", serverSeed: "s"})).toThrow('"commitment" must be an object.');
    });

    // "unchecked commitment" contract: Verify requires `proof` to be an object, but never validates
    // `commitment` at all -- it's passed straight through even when entirely absent. This is narrower
    // than the UI's own gating (ProvablyFairTab's `resolveVerifyInputs` requires *both* a proof and a
    // commitment to exist before enabling the "Verify" button), so a request sent outside that UI (or a
    // future UI variant with looser gating) can ask the server to verify a proof with no commitment at
    // all -- FairnessRoundProofVerifier's own structural checks are what actually catches that, not this
    // layer. Frozen behavior, not something this baseline changes.
    it("Verify requires only a proof object -- commitment is never checked at this layer, even though the UI requires both before enabling 'Verify'", () => {
        expect(() => validateFairnessVerifyRequest({proof: {}})).not.toThrow();
        expect(validateFairnessVerifyRequest({proof: {round: 1}}).commitment).toBeUndefined();
        expect(() => validateFairnessVerifyRequest({proof: "not-an-object"} as never)).toThrow('"proof" must be an object.');
    });
});
