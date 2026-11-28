import {validateSaveBlueprintRequest} from "../../../cli/studio/blueprint/validateSaveBlueprintRequest.js";

describe("validateSaveBlueprintRequest", () => {
    it.each([".json", ".JSON"])("accepts a game-design path with the %s suffix", (suffix) => {
        expect(validateSaveBlueprintRequest({path: `/tmp/game${suffix}`, blueprint: {}}).path).toBe(`/tmp/game${suffix}`);
    });

    it.each(["", "   ", "/tmp/game", "/tmp/game.blueprint", "/tmp/game.json/child", "/tmp/game.xlsx"])(
        "rejects the unreadable game-design path %p",
        (path) => {
            expect(() => validateSaveBlueprintRequest({path, blueprint: {}})).toThrow(
                path.trim().length === 0 ? /"path" is required/ : /file ending in "\.json"/,
            );
        },
    );
});
