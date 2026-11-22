import fs from "fs";
import os from "os";
import path from "path";
import type {loadPokieGame} from "@fromstan/pokie";
import {StudioOutcomeLibraryGenerateService} from "../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";

describe("StudioOutcomeLibraryGenerateService exact-math source loading", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-exact-fast-path-"));
        fs.writeFileSync(path.join(projectRoot, "blueprint.json"), JSON.stringify({
            info: {id: "fast-path", name: "Fast Path", version: "0.1.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "K"],
            paytable: {A: {"2": 1}},
            paylines: [[0, 0]],
            reelStrips: [["A", "K"], ["A", "K"]],
            availableBets: [1],
        }));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    it("uses the authored Blueprint directly instead of materializing a runtime package", async () => {
        const loadGame = jest.fn(() => Promise.reject(new Error("a runtime package must not be materialized")));
        const service = new StudioOutcomeLibraryGenerateService("2.0.0", loadGame as unknown as typeof loadPokieGame);

        const view = await service.estimate(projectRoot, {generation: "exact"});

        expect(view.status).toBe("ok");
        if (view.status !== "ok") throw new Error(view.error);
        expect(view.game.id).toBe("fast-path");
        expect(view.totalOutcomeSpaceSize).toBe(4);
        expect(loadGame).not.toHaveBeenCalled();
    });
});
