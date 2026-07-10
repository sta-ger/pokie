import {FileSessionRepository, PokieSessionState} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";

describe("FileSessionRepository", () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-session-repo-test-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("returns undefined for a sessionId that was never saved", async () => {
        const repository = new FileSessionRepository(directory);

        await expect(repository.load("does-not-exist")).resolves.toBeUndefined();
    });

    it("round-trips saved state to disk", async () => {
        const repository = new FileSessionRepository(directory);
        const state: PokieSessionState = {bet: 5, win: 15, screen: [["A", "B"]], context: {seed: "demo"}};

        await repository.save("session-1", state);

        await expect(repository.load("session-1")).resolves.toEqual(state);
    });

    it("survives being reconstructed against the same directory (restart simulation)", async () => {
        const state: PokieSessionState = {bet: 5, win: 15, screen: [["A", "B"]]};
        await new FileSessionRepository(directory).save("session-1", state);

        const reloaded = new FileSessionRepository(directory);

        await expect(reloaded.load("session-1")).resolves.toEqual(state);
    });

    it("treats a corrupted state file as missing state instead of throwing", async () => {
        const repository = new FileSessionRepository(directory);
        await repository.save("session-1", {bet: 5, win: 0});

        const [fileName] = fs.readdirSync(directory);
        fs.writeFileSync(path.join(directory, fileName), "{not valid json", "utf-8");

        await expect(repository.load("session-1")).resolves.toBeUndefined();
    });

    it("does not let a sessionId escape the target directory via path traversal", async () => {
        const repository = new FileSessionRepository(directory);
        const outsideFile = path.join(os.tmpdir(), "pokie-session-repo-traversal-marker.json");
        fs.rmSync(outsideFile, {force: true});

        await repository.save("../../../../etc/pokie-session-repo-traversal", {bet: 5, win: 0});

        expect(fs.existsSync(outsideFile)).toBe(false);
        expect(fs.readdirSync(directory).length).toBe(1);
    });
});
