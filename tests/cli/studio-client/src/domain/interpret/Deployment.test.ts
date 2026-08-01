import {
    canAddDeploymentMode,
    classifyDeploymentModeRow,
    collectStageIssues,
    computeDeploymentConfigureBlockers,
    describeBuildModesUnavailable,
    describeDeploymentModeRowStatus,
    describeDeploymentOutcome,
    describeDeploymentRunResult,
    describeDeploymentTargetsList,
    describeTargetCapability,
    describeTargetRequirements,
    discoverDeploymentModeLibrarySelector,
    remainingDeploymentModeChoices,
    splitIssuesBySeverity,
    usedDeploymentModeNames,
} from "../../../../../../cli/studio-client/src/domain/interpret/Deployment";
import type {
    StudioDeploymentModeInput,
    StudioDeploymentRunView,
    StudioDeploymentStageSummary,
    StudioDeploymentTargetSummary,
    StudioOutcomeLibraryRegistryView,
    ValidationIssue,
} from "../../../../../../cli/studio-client/src/api/types";

function mode(modeName: string, librarySelector: StudioDeploymentModeInput["librarySelector"] = {kind: "json", path: ""}): StudioDeploymentModeInput {
    return {modeName, librarySelector};
}

function registryOk(overrides: Partial<Extract<StudioOutcomeLibraryRegistryView, {status: "ok"; buildStatus: "compatible"}>> = {}): StudioOutcomeLibraryRegistryView {
    return {
        status: "ok",
        bundleDir: "outcomelibrary",
        buildStatus: "compatible",
        game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        currentGame: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        artifactPokieVersion: "1.0.0",
        currentPokieVersion: "1.0.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        modes: [],
        ...overrides,
    };
}

const MISSING_REGISTRY: StudioOutcomeLibraryRegistryView = {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"};

function target(overrides: Partial<StudioDeploymentTargetSummary> = {}): StudioDeploymentTargetSummary {
    return {id: "local-json-example", version: "1.0.0", requirements: {}, capabilities: [], ...overrides};
}

function stage(key: StudioDeploymentStageSummary["key"], status: StudioDeploymentStageSummary["status"]): StudioDeploymentStageSummary {
    return {key, label: key, status, issues: []};
}

function baseView(overrides: Partial<StudioDeploymentRunView> = {}): StudioDeploymentRunView {
    return {
        targetId: "local-json-example",
        publish: false,
        stages: [],
        descriptorIssues: [],
        compatibilityIssues: [],
        projectionIssues: [],
        artifactIssues: [],
        ...overrides,
    };
}

describe("describeDeploymentTargetsList", () => {
    it("reports empty for no targets", () => {
        expect(describeDeploymentTargetsList([])).toEqual({status: "empty"});
    });

    it("reports loaded with the given targets", () => {
        const targets = [target()];
        expect(describeDeploymentTargetsList(targets)).toEqual({status: "loaded", targets});
    });
});

describe("describeDeploymentRunResult", () => {
    it("passes the server's own stages through unchanged — never re-deriving them", () => {
        const stages = [stage("descriptor", "ok"), stage("compatibility", "error")];
        const view = baseView({stages});

        const result = describeDeploymentRunResult(view);

        expect(result.stages).toBe(stages); // same reference — no transform applied
    });

    it("is ok only when every stage is not an error", () => {
        const view = baseView({
            stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage("projection", "skipped")],
        });

        expect(describeDeploymentRunResult(view).ok).toBe(true);
    });

    it("is not ok when any stage reports an error, however far the pipeline otherwise got", () => {
        const view = baseView({
            stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage("artifactValidation", "error")],
        });

        expect(describeDeploymentRunResult(view).ok).toBe(false);
    });

    it("extracts the generated artifacts from generation, defaulting to empty when there is none", () => {
        const withArtifacts = describeDeploymentRunResult(baseView({generation: {artifacts: [{relativePath: "a.json", content: "{}"}], issues: []}}));
        expect(withArtifacts.artifacts).toEqual([{relativePath: "a.json", content: "{}"}]);

        const withoutGeneration = describeDeploymentRunResult(baseView());
        expect(withoutGeneration.artifacts).toEqual([]);
    });

    it("carries publish and delivered through as-is", () => {
        const result = describeDeploymentRunResult(baseView({publish: true, delivery: {delivered: true}}));

        expect(result.publish).toBe(true);
        expect(result.delivered).toBe(true);
    });

    it("delivered is undefined when there is no delivery", () => {
        expect(describeDeploymentRunResult(baseView()).delivered).toBeUndefined();
    });
});

describe("describeDeploymentOutcome", () => {
    it("is incompatible when the descriptor stage errors", () => {
        const result = describeDeploymentRunResult(baseView({stages: [stage("descriptor", "error")]}));
        expect(describeDeploymentOutcome(result)).toBe("incompatible");
    });

    it("is incompatible when the compatibility stage errors", () => {
        const result = describeDeploymentRunResult(baseView({stages: [stage("descriptor", "ok"), stage("compatibility", "error")]}));
        expect(describeDeploymentOutcome(result)).toBe("incompatible");
    });

    it("is validation-failure when projection/generation/artifactValidation errors, even though compatibility passed", () => {
        for (const key of ["projection", "generation", "artifactValidation"] as const) {
            const result = describeDeploymentRunResult(
                baseView({stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage(key, "error")]}),
            );
            expect(describeDeploymentOutcome(result)).toBe("validation-failure");
        }
    });

    it("is transport-failure when diagnostic or delivery errors despite otherwise-valid content", () => {
        for (const key of ["diagnostic", "delivery"] as const) {
            const result = describeDeploymentRunResult(
                baseView({
                    publish: true,
                    stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage("artifactValidation", "ok"), stage(key, "error")],
                }),
            );
            expect(describeDeploymentOutcome(result)).toBe("transport-failure");
        }
    });

    it("is partial when every stage passes and this was a preview (publish: false)", () => {
        const result = describeDeploymentRunResult(baseView({publish: false, stages: [stage("descriptor", "ok"), stage("diagnostic", "ok")]}));
        expect(describeDeploymentOutcome(result)).toBe("partial");
    });

    it("is success when every stage passes and this was a real deploy (publish: true)", () => {
        const result = describeDeploymentRunResult(
            baseView({publish: true, stages: [stage("descriptor", "ok"), stage("diagnostic", "ok"), stage("delivery", "ok")]}),
        );
        expect(describeDeploymentOutcome(result)).toBe("success");
    });

    it("classifies by the first failing stage even when a later stage also failed (skipped doesn't count as an error)", () => {
        const result = describeDeploymentRunResult(
            baseView({stages: [stage("descriptor", "ok"), stage("compatibility", "error"), stage("projection", "skipped")]}),
        );
        expect(describeDeploymentOutcome(result)).toBe("incompatible");
    });
});

describe("collectStageIssues", () => {
    it("flattens issues from only the requested stage keys, preserving server-computed content", () => {
        const compatIssue: ValidationIssue = {code: "X", severity: "error", message: "nope"};
        const projectionIssue: ValidationIssue = {code: "Y", severity: "warning", message: "hmm"};
        const stages: StudioDeploymentStageSummary[] = [
            {key: "descriptor", label: "d", status: "ok", issues: []},
            {key: "compatibility", label: "c", status: "error", issues: [compatIssue]},
            {key: "projection", label: "p", status: "ok", issues: [projectionIssue]},
        ];

        expect(collectStageIssues(stages, ["descriptor", "compatibility"])).toEqual([compatIssue]);
        expect(collectStageIssues(stages, ["projection"])).toEqual([projectionIssue]);
        expect(collectStageIssues(stages, ["diagnostic"])).toEqual([]);
    });
});

describe("splitIssuesBySeverity", () => {
    it("puts only error-severity issues in errors, folding warning and info into warnings", () => {
        const issues: ValidationIssue[] = [
            {code: "a", severity: "error", message: "e"},
            {code: "b", severity: "warning", message: "w"},
            {code: "c", severity: "info", message: "i"},
        ];

        const {errors, warnings} = splitIssuesBySeverity(issues);

        expect(errors).toEqual([issues[0]]);
        expect(warnings).toEqual([issues[1], issues[2]]);
    });
});

describe("describeTargetCapability", () => {
    it("returns a friendly description for a known capability id", () => {
        expect(describeTargetCapability("multiMode")).toBe("More than one bet mode in a single deployment");
    });

    it("falls back to the raw id for an unrecognized (third-party) capability", () => {
        expect(describeTargetCapability("myVendor.replayUrls")).toBe("myVendor.replayUrls");
    });
});

describe("describeTargetRequirements", () => {
    it("describes every declared requirement in plain language", () => {
        const lines = describeTargetRequirements({minPokieVersion: "1.2.0", symbolAlphabet: "numeric", requiresHomogeneousProvenance: true});
        expect(lines).toEqual([
            "Every deployed mode's outcome library must have been built with pokie v1.2.0 or newer.",
            "Every symbol must be a numeric id -- string symbols are rejected.",
            "Every mode in one deployment must come from the same game build (id, version, config).",
        ]);
    });

    it("reports 'no special requirements' when nothing was declared", () => {
        expect(describeTargetRequirements({})).toEqual(["No special requirements -- accepts any compatible outcome library."]);
    });

    it("does not mention symbolAlphabet when it is 'any' (the permissive default)", () => {
        expect(describeTargetRequirements({symbolAlphabet: "any"})).toEqual(["No special requirements -- accepts any compatible outcome library."]);
    });
});

describe("usedDeploymentModeNames", () => {
    it("collects every non-blank mode name except the excluded row's own", () => {
        const rows = [mode("base"), mode("bonus"), mode("")];
        expect(usedDeploymentModeNames(rows, 0)).toEqual(new Set(["bonus"]));
        expect(usedDeploymentModeNames(rows, -1)).toEqual(new Set(["base", "bonus"]));
    });
});

describe("remainingDeploymentModeChoices", () => {
    it("is undefined when the project's own build modes aren't known yet", () => {
        expect(remainingDeploymentModeChoices(undefined, [mode("base")], 0)).toBeUndefined();
    });

    it("excludes modes already claimed by another row, but keeps this row's own current choice", () => {
        const rows = [mode("base"), mode("bonus")];
        expect(remainingDeploymentModeChoices(["base", "bonus", "superbonus"], rows, 0)).toEqual(["base", "superbonus"]);
        expect(remainingDeploymentModeChoices(["base", "bonus", "superbonus"], rows, 1)).toEqual(["bonus", "superbonus"]);
    });
});

describe("canAddDeploymentMode", () => {
    it("is false once one mode already exists and the target doesn't declare multiMode", () => {
        expect(canAddDeploymentMode(["base", "bonus"], [mode("base")], false)).toBe(false);
    });

    it("is true for a multiMode target with a remaining build mode", () => {
        expect(canAddDeploymentMode(["base", "bonus"], [mode("base")], true)).toBe(true);
    });

    it("is false for a multiMode target once every build mode is already used", () => {
        expect(canAddDeploymentMode(["base", "bonus"], [mode("base"), mode("bonus")], true)).toBe(false);
    });

    it("is false when build modes aren't known yet, even for a multiMode target with room to spare", () => {
        expect(canAddDeploymentMode(undefined, [mode("base")], true)).toBe(false);
        expect(canAddDeploymentMode(undefined, [mode("base")], false)).toBe(false);
    });
});

describe("describeBuildModesUnavailable", () => {
    it("is undefined once the project's own build modes are known", () => {
        expect(describeBuildModesUnavailable(["base"])).toBeUndefined();
        expect(describeBuildModesUnavailable([])).toBeUndefined();
    });

    it("gives an actionable domain-language reason when build modes aren't known yet, never a raw schema path", () => {
        const message = describeBuildModesUnavailable(undefined);
        expect(message).toBeDefined();
        expect(message).toContain("build");
        expect(message?.includes("/")).toBe(false);
    });
});

describe("discoverDeploymentModeLibrarySelector", () => {
    it("returns a bundle selector for a mode the registry reports compatible", () => {
        const registry = registryOk({modes: [{modeName: "base", libraryId: "lib", bundleDir: "outcomelibrary", buildStatus: "compatible", outcomeCount: 1, totalWeight: 1, rtp: 0.95, hash: "h"}]});
        expect(discoverDeploymentModeLibrarySelector("base", registry)).toEqual({kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"});
    });

    it("returns undefined for a mode the registry only reports as stale/wrong", () => {
        const registry = registryOk({modes: [{modeName: "base", libraryId: "lib", bundleDir: "outcomelibrary", buildStatus: "wrong", outcomeCount: 1, totalWeight: 1, rtp: 0.95, hash: "h"}]});
        expect(discoverDeploymentModeLibrarySelector("base", registry)).toBeUndefined();
    });

    it("returns undefined when the registry has nothing built at all", () => {
        expect(discoverDeploymentModeLibrarySelector("base", MISSING_REGISTRY)).toBeUndefined();
    });
});

describe("classifyDeploymentModeRow", () => {
    it("is unselected for a blank mode name", () => {
        expect(classifyDeploymentModeRow(mode(""), 0, [mode("")], MISSING_REGISTRY)).toBe("unselected");
    });

    it("is duplicate when another row already claims the same mode name", () => {
        const rows = [mode("base", {kind: "json", path: "a.json"}), mode("base", {kind: "json", path: "b.json"})];
        expect(classifyDeploymentModeRow(rows[0], 0, rows, MISSING_REGISTRY)).toBe("duplicate");
    });

    it("is missing when a mode is picked but the librarySelector is blank", () => {
        expect(classifyDeploymentModeRow(mode("base"), 0, [mode("base")], MISSING_REGISTRY)).toBe("missing");
    });

    it("is wrongBuild when the chosen bundle selector is registry-known but stale/wrong", () => {
        const registry = registryOk({modes: [{modeName: "base", libraryId: "lib", bundleDir: "outcomelibrary", buildStatus: "stale", outcomeCount: 1, totalWeight: 1, rtp: 0.95, hash: "h"}]});
        const row = mode("base", {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"});
        expect(classifyDeploymentModeRow(row, 0, [row], registry)).toBe("wrongBuild");
    });

    it("is invalid when the last run's own load-error named this exact mode", () => {
        const row = mode("base", {kind: "json", path: "base.json"});
        expect(classifyDeploymentModeRow(row, 0, [row], MISSING_REGISTRY, 'mode "base": "base.json" is not valid JSON.')).toBe("invalid");
    });

    it("is not invalid when the last run's own load-error named a different mode", () => {
        const row = mode("base", {kind: "json", path: "base.json"});
        expect(classifyDeploymentModeRow(row, 0, [row], MISSING_REGISTRY, 'mode "bonus": "bonus.json" is not valid JSON.')).toBe("ready");
    });

    it("is ready for a picked mode with a non-blank selector and no known problem", () => {
        const row = mode("base", {kind: "json", path: "base.json"});
        expect(classifyDeploymentModeRow(row, 0, [row], MISSING_REGISTRY)).toBe("ready");
    });

    it("is ready for a registry-compatible bundle selector", () => {
        const registry = registryOk({modes: [{modeName: "base", libraryId: "lib", bundleDir: "outcomelibrary", buildStatus: "compatible", outcomeCount: 1, totalWeight: 1, rtp: 0.95, hash: "h"}]});
        const row = mode("base", {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"});
        expect(classifyDeploymentModeRow(row, 0, [row], registry)).toBe("ready");
    });
});

describe("describeDeploymentModeRowStatus", () => {
    it("describes every status with a label and color", () => {
        expect(describeDeploymentModeRowStatus("ready")).toEqual({label: "Ready", color: "green"});
        expect(describeDeploymentModeRowStatus("missing")).toEqual({label: "Missing library", color: "red"});
        expect(describeDeploymentModeRowStatus("wrongBuild").color).toBe("yellow");
    });
});

describe("computeDeploymentConfigureBlockers", () => {
    it("is empty when every row is ready", () => {
        const rows = [mode("base", {kind: "json", path: "base.json"})];
        expect(computeDeploymentConfigureBlockers(rows, ["ready"])).toEqual([]);
    });

    it("names each blocked row in plain language, never a raw schema path", () => {
        const rows = [mode("base"), mode("")];
        const blockers = computeDeploymentConfigureBlockers(rows, ["missing", "unselected"]);

        expect(blockers).toEqual(["base: choose, generate, or pick a compatible outcome library from the hub.", "Row 2: pick a bet mode."]);
        expect(blockers.some((message) => message.includes("/"))).toBe(false);
    });
});
