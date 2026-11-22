import os from "os";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";

const blueprint = {
    info: {id: "tiny", name: "Tiny", version: "0.1.0"},
    reels: 3,
    rows: 3,
    symbols: ["A", "K"],
    paytable: {A: {"3": 10}, K: {"3": 2}},
    reelStrips: [["A", "K", "K"], ["A", "A", "K"], ["A", "K", "K"]],
    paylines: [[0, 0, 0]],
    availableBets: [1],
};

describe("StudioBlueprintService.previewMath", () => {
    const service = new StudioBlueprintService("2.0.0", os.tmpdir(), new StudioHomeService("2.0.0"));

    it("returns exact draft metrics without saving anything", async () => {
        const view = await service.previewMath(blueprint);
        expect(view.status).toBe("ok");
        if (view.status !== "ok") throw new Error(view.message);
        expect(view.outcomeCount).toBe(27);
        expect(view.analysis.rtp).toBeCloseTo(28 / 27, 12);
        expect(view.analysis.hitFrequency).toBeCloseTo(6 / 27, 12);
        expect(view.analysis.maxWin).toBe(10);
        expect(view.note).toMatch(/nothing was saved/i);
    });

    it("returns an ordinary unavailable view for an invalid draft", async () => {
        const view = await service.previewMath({info: {id: "bad"}});
        expect(view.status).toBe("unavailable");
        if (view.status !== "unavailable") throw new Error("expected unavailable");
        expect(view.message).toMatch(/fix the game design/i);
    });
});
