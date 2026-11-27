import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryFolderWriter} from "@fromstan/pokie";
import {StudioOutcomeLibraryGenerateService} from "../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import type {ValidatedOutcomeLibraryGenerateEstimateRequest} from "../../../cli/studio/outcomeLibrary/validateOutcomeLibraryGenerateEstimateRequest.js";
import type {ValidatedOutcomeLibraryGenerateRequest} from "../../../cli/studio/outcomeLibrary/validateOutcomeLibraryGenerateRequest.js";
import {buildOutcomeLibraryFolderModeInput} from "../../weightedoutcome/folder/OutcomeLibraryFolderTestFixtures.js";

describe("StudioOutcomeLibraryGenerateService preflight destinations", () => {
    let directory: string;
    let blueprintPath: string;
    let conventionalLibrary: string;

    beforeEach(async () => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-preflight-"));
        blueprintPath = path.join(directory, "game.blueprint.json");
        conventionalLibrary = path.join(directory, "outcomelibrary");
        fs.writeFileSync(blueprintPath, JSON.stringify({
            info: {id: "renamed-game", name: "Renamed Game", version: "0.1.0"},
            reels: 3,
            rows: 1,
            symbols: ["A"],
            paytable: {A: {3: 1}},
            reelStrips: [["A"], ["A"], ["A"]],
            availableBets: [1],
        }));
        // A previous design owns the conventional directory; this design's preflight must choose a
        // per-game sibling and its start must keep that exact sibling.
        await new OutcomeLibraryFolderWriter("2.0.0").writeToDirectory(
            [buildOutcomeLibraryFolderModeInput("base", "previous-game")],
            conventionalLibrary,
        );
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("keeps the preflight's per-game destination when the start request has no explicit outDir", async () => {
        const service = new StudioOutcomeLibraryGenerateService("2.0.0");
        const estimate = await service.estimate(blueprintPath, {generation: "exact"} as ValidatedOutcomeLibraryGenerateEstimateRequest);
        expect(estimate.status).toBe("ok");
        if (estimate.status !== "ok") throw new Error("Expected the exact preflight to be available.");
        expect(estimate.plan.target.canonicalLocation).not.toBe(conventionalLibrary);

        const binding = service.getPreflightBinding(estimate.preflightToken);
        expect(binding).toBeDefined();
        if (binding === undefined) throw new Error("Expected a retained preflight binding.");
        const request = {generation: "exact", preflightToken: estimate.preflightToken} as ValidatedOutcomeLibraryGenerateRequest;

        await expect(service.validatePreflightBinding(blueprintPath, request, binding)).resolves.toBeUndefined();

        const result = await service.generate(blueprintPath, request);
        expect(result.status).toBe("ok");
        if (result.status !== "ok") throw new Error("Expected the prepared generation to publish.");
        const target = estimate.plan.target.canonicalLocation;
        if (target === undefined) throw new Error("Expected a bound preflight destination.");
        expect(result.resolvedBundleDir).toBe(target);
        expect(result.libraryDir).toBe(path.relative(path.dirname(blueprintPath), target));
        expect(path.isAbsolute(result.libraryDir)).toBe(false);
        expect(fs.existsSync(conventionalLibrary)).toBe(true);
    });
});
