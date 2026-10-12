import path from "path";
import {inspectRuntimeGraph} from "../v2/helpers/runtimeGraph.js";
import {SeededRandomNumberGenerator, VideoSlotConfig} from "../../src/browser.js";

describe("browser runtime API", () => {
    it("exposes game-runtime classes without traversing a Node builtin", () => {
        expect(new SeededRandomNumberGenerator("browser-seed").getRandomInt(0, 100)).toBe(
            new SeededRandomNumberGenerator("browser-seed").getRandomInt(0, 100),
        );
        expect(new VideoSlotConfig().getReelsNumber()).toBeGreaterThan(0);

        const browserEntry = path.resolve(__dirname, "../../src/browser.ts");
        expect(inspectRuntimeGraph([browserEntry], {portable: true})).toContain(browserEntry);
    });
});
