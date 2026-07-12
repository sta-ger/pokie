import {FileSessionRepository, PokieSessionState, SessionVersionConflictError} from "pokie";
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

    describe("optimistic locking (loadVersioned/saveVersioned)", () => {
        it("returns undefined from loadVersioned for a sessionId that was never saved", async () => {
            const repository = new FileSessionRepository(directory);

            await expect(repository.loadVersioned("does-not-exist")).resolves.toBeUndefined();
        });

        it("starts at version 1 after the first save and increments by 1 on every subsequent save", async () => {
            const repository = new FileSessionRepository(directory);

            await repository.save("session-1", {bet: 1, win: 0});
            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 0}, version: 1});

            await repository.save("session-1", {bet: 1, win: 5});
            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 5}, version: 2});
        });

        it("saveVersioned succeeds when expectedVersion matches, and returns the new version", async () => {
            const repository = new FileSessionRepository(directory);
            await repository.save("session-1", {bet: 1, win: 0});

            await expect(repository.saveVersioned("session-1", {bet: 1, win: 5}, 1)).resolves.toBe(2);
            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 5}, version: 2});
        });

        it("saveVersioned rejects with SessionVersionConflictError on a stale expectedVersion, leaving the stored file untouched", async () => {
            const repository = new FileSessionRepository(directory);
            await repository.save("session-1", {bet: 1, win: 0}); // version 1
            await repository.saveVersioned("session-1", {bet: 1, win: 5}, 1); // version 2, "someone else's" commit

            await expect(repository.saveVersioned("session-1", {bet: 1, win: 999}, 1)).rejects.toThrow(SessionVersionConflictError);

            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 5}, version: 2});
        });

        it("survives being reconstructed against the same directory, version included (restart simulation)", async () => {
            const repository = new FileSessionRepository(directory);
            await repository.save("session-1", {bet: 5, win: 0});
            await repository.saveVersioned("session-1", {bet: 5, win: 15}, 1);

            const reloaded = new FileSessionRepository(directory);

            await expect(reloaded.loadVersioned("session-1")).resolves.toEqual({state: {bet: 5, win: 15}, version: 2});
        });

        it("treats a pre-versioning raw-state file (no {version, state} envelope) as version 0", async () => {
            const repository = new FileSessionRepository(directory);
            await repository.save("session-1", {bet: 5, win: 0}); // version 1, written with the envelope

            const [fileName] = fs.readdirSync(directory);
            // Overwrite with the pre-versioning on-disk shape: a raw PokieSessionState, no envelope.
            fs.writeFileSync(path.join(directory, fileName), JSON.stringify({bet: 5, win: 0}), "utf-8");

            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 5, win: 0}, version: 0});
            // The very next save upgrades it to the versioned envelope.
            await expect(repository.saveVersioned("session-1", {bet: 5, win: 15}, 0)).resolves.toBe(1);
            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 5, win: 15}, version: 1});
        });

        it("treats a corrupted state file as missing from loadVersioned too, instead of throwing", async () => {
            const repository = new FileSessionRepository(directory);
            await repository.save("session-1", {bet: 5, win: 0});

            const [fileName] = fs.readdirSync(directory);
            fs.writeFileSync(path.join(directory, fileName), "{not valid json", "utf-8");

            await expect(repository.loadVersioned("session-1")).resolves.toBeUndefined();
        });
    });
});
