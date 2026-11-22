import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryFolderIndex,
    OutcomeLibraryFolderWriter,
} from "@fromstan/pokie";
import {StudioExactMathService} from "../../../cli/studio/exact/StudioExactMathService.js";
import type {StudioOutcomeLibraryRegistryView} from "../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryRegistryView.js";
import {buildOutcomeLibraryFolderModeInput} from "../../weightedoutcome/folder/OutcomeLibraryFolderTestFixtures.js";

function registryFor(projectRoot: string, manifest: OutcomeLibraryFolderIndex, buildStatus: "compatible" | "stale" = "compatible"): StudioOutcomeLibraryRegistryView {
    const mode = manifest.modes[0];
    return {
        status: "ok",
        libraryDir: "library",
        buildStatus,
        game: manifest.game,
        currentGame: manifest.game,
        ...(manifest.configHash === undefined ? {} : {configHash: manifest.configHash}),
        recordPokieVersion: manifest.recordPokieVersion,
        currentPokieVersion: manifest.recordPokieVersion,
        generatedAt: manifest.generatedAt,
        modes: [{
            modeName: mode.modeName,
            libraryId: mode.libraryId,
            libraryDir: "library",
            buildStatus,
            outcomeCount: mode.outcomeCount,
            totalWeight: mode.totalWeight,
            rtp: mode.analysis.rtp,
            hash: mode.libraryHash,
            ...(mode.generator === undefined ? {} : {strategy: mode.generator.strategy, generatedAt: mode.generator.generatedAt}),
        }],
    };
}

describe("StudioExactMathService", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-exact-math-"));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    async function writeLibrary(): Promise<OutcomeLibraryFolderIndex> {
        const libraryDir = path.join(projectRoot, "library");
        await new OutcomeLibraryFolderWriter("1.3.0").writeToDirectory(
            [buildOutcomeLibraryFolderModeInput("base", "base-lib")],
            libraryDir,
        );
        return JSON.parse(fs.readFileSync(path.join(libraryDir, "index.json"), "utf8")) as OutcomeLibraryFolderIndex;
    }

    it("reads exact metrics and payout distribution from a compatible bundle and derives symbol contributions", async () => {
        const manifest = await writeLibrary();
        const service = new StudioExactMathService(() => Promise.resolve(registryFor(projectRoot, manifest)));

        const view = await service.get(projectRoot);

        expect(view.status).toBe("ok");
        if (view.status !== "ok") throw new Error(view.message);
        expect(view.modeName).toBe("base");
        expect(view.outcomeCount).toBe(5);
        expect(view.totalWeight).toBe(1000);
        expect(view.stake).toBe(1);
        expect(view.analysis.rtp).toBeCloseTo(2.75, 12);
        expect(view.analysis.hitFrequency).toBeCloseTo(0.5, 12);
        expect(view.analysis.payoutDistribution).toEqual([
            {payoutMultiplier: 0, probability: 0.5},
            {payoutMultiplier: 2, probability: 0.3},
            {payoutMultiplier: 5, probability: 0.15},
            {payoutMultiplier: 10, probability: 0.04},
            {payoutMultiplier: 100, probability: 0.01},
        ]);
        expect(view.contributions.line.entries).toEqual([]);
        expect(view.contributions.symbol.entries).toHaveLength(1);
        expect(view.contributions.symbol.entries[0]).toMatchObject({
            kind: "symbol",
            key: "symbol:A",
            label: "A",
            symbolId: "A",
            outcomeCount: 4,
        });
        expect(view.contributions.symbol.entries[0].rtpContribution).toBeCloseTo(2.75, 12);
        expect(view.contributions.symbol.entries[0].hitFrequency).toBeCloseTo(0.5, 12);
        expect(view.events.entries).toHaveLength(1);
        expect(view.events.entries[0]).toMatchObject({
            kind: "other",
            winType: "value",
            symbolId: "A",
            outcomeCount: 4,
        });
        expect(view.events.entries[0].probability).toBeCloseTo(0.5, 12);
        expect(view.events.entries[0].rtpContribution).toBeCloseTo(2.75, 12);
    });

    it("reports a missing library instead of inventing exact numbers", async () => {
        const service = new StudioExactMathService(() => Promise.resolve({
            status: "ok",
            libraryDir: "outcomelibrary",
            buildStatus: "missing",
        }));
        const view = await service.get(projectRoot);
        expect(view.status).toBe("missing");
    });

    it("reports a stale library instead of presenting it as current", async () => {
        const manifest = await writeLibrary();
        const service = new StudioExactMathService(() => Promise.resolve(registryFor(projectRoot, manifest, "stale")));
        const view = await service.get(projectRoot);
        expect(view.status).toBe("stale");
        expect(view.status === "stale" ? view.message : "").toMatch(/different saved design/i);
    });

    it("keeps exact index metrics available when the optional full-outcome contribution scan is unavailable", async () => {
        const manifest = await writeLibrary();
        const reader = {
            readIndex: () => Promise.resolve(manifest),
            readLibrary: () => Promise.reject(new Error("outcomes file unavailable")),
        } as unknown as import("@fromstan/pokie").OutcomeLibraryFolderReading<string>;
        const service = new StudioExactMathService(() => Promise.resolve(registryFor(projectRoot, manifest)), reader);

        const view = await service.get(projectRoot);

        expect(view.status).toBe("ok");
        if (view.status !== "ok") throw new Error(view.message);
        expect(view.analysis.rtp).toBeCloseTo(2.75, 12);
        expect(view.contributions.symbol.entries).toEqual([]);
        expect(view.events.entries).toEqual([]);
        expect(view.contributionNote).toMatch(/could not be read/i);
        expect(view.eventNote).toMatch(/could not be read/i);
    });
});
