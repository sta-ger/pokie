import {PokieGame, PokieGameManifest} from "pokie";
import path from "path";
import {loadProjectDashboardContext} from "../../../cli/studio/loadProjectDashboardContext.js";

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("not used by these tests");
        },
    };
}

describe("loadProjectDashboardContext", () => {
    it("resolves to loaded with the game's manifest on success", async () => {
        const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
        const loadGame = jest.fn().mockResolvedValue(createFakeGame(manifest));

        const dashboard = await loadProjectDashboardContext("./crazy-fruits", loadGame);

        expect(dashboard).toEqual({
            status: "loaded",
            projectRoot: path.resolve("./crazy-fruits"),
            game: manifest,
        });
        expect(loadGame).toHaveBeenCalledWith("./crazy-fruits");
    });

    it("resolves projectRoot to an absolute path even when given a relative one", async () => {
        const loadGame = jest.fn().mockResolvedValue(createFakeGame({id: "a", name: "A", version: "1.0.0"}));

        const dashboard = await loadProjectDashboardContext("relative-dir", loadGame);

        expect(dashboard.status).toBe("loaded");
        expect(dashboard).toMatchObject({projectRoot: path.resolve("relative-dir")});
    });

    it("leaves an already-absolute projectRoot unchanged", async () => {
        const absolute = path.resolve("/tmp/crazy-fruits");
        const loadGame = jest.fn().mockResolvedValue(createFakeGame({id: "a", name: "A", version: "1.0.0"}));

        const dashboard = await loadProjectDashboardContext(absolute, loadGame);

        expect(dashboard.status).toBe("loaded");
        expect(dashboard).toMatchObject({projectRoot: absolute});
    });

    it("resolves to an error with the message when loadGame rejects with an Error (e.g. entry load failure)", async () => {
        const loadGame = jest.fn().mockRejectedValue(new Error("Cannot find module './dist/index.js'"));

        const dashboard = await loadProjectDashboardContext("./broken-game", loadGame);

        expect(dashboard).toEqual({
            status: "error",
            projectRoot: path.resolve("./broken-game"),
            error: "Cannot find module './dist/index.js'",
        });
    });

    it("resolves to an error with a stringified message when loadGame rejects with a non-Error value", async () => {
        const loadGame = jest.fn().mockRejectedValue("boom");

        const dashboard = await loadProjectDashboardContext("./broken-game", loadGame);

        expect(dashboard).toEqual({
            status: "error",
            projectRoot: path.resolve("./broken-game"),
            error: "boom",
        });
    });

    it("resolves to an error when the package doesn't satisfy the PokieGame contract (getManifest() itself throwing)", async () => {
        const loadGame = jest.fn().mockRejectedValue(new Error("does not export a valid PokieGame"));

        const dashboard = await loadProjectDashboardContext("./not-a-pokie-game", loadGame);

        expect(dashboard.status).toBe("error");
        if (dashboard.status === "error") {
            expect(dashboard.error).toContain("does not export a valid PokieGame");
        }
    });

    it("never rejects", async () => {
        const loadGame = jest.fn().mockRejectedValue(new Error("boom"));

        await expect(loadProjectDashboardContext("./broken-game", loadGame)).resolves.not.toThrow();
    });
});
