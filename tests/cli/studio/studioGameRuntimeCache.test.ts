import fs from "fs";
import os from "os";
import path from "path";
import {StudioGameRuntimeCache} from "../../../cli/studio/loadStudioGame.js";

type FakeGame = {getInfo: () => {id: string; name: string; version: string}};
type LoadedFakeGame = {game: FakeGame; release: () => Promise<void>};
type FinishLoading = (value: LoadedFakeGame) => void;

function createPackage(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-cache-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "cache-fixture", pokie: {entry: "./dist/index.js"}}));
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "index.js"), "module.exports = {getInfo(){return {id:'cache-fixture',name:'Cache Fixture',version:'1.0.0'}}};\n");
    return root;
}

describe("StudioGameRuntimeCache", () => {
    const roots: string[] = [];
    afterEach(() => {
        for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
    });

    it("reuses one leased runtime for repeated loads of unchanged bytes", async () => {
        const root = createPackage();
        roots.push(root);
        const game = {getInfo: () => ({id: "cache-fixture", name: "Cache Fixture", version: "1.0.0"})} as FakeGame;
        const release = jest.fn(() => Promise.resolve());
        const loadRuntime = jest.fn(() => Promise.resolve({game, release}));
        const cache = new StudioGameRuntimeCache(() => Promise.resolve({}), loadRuntime as never);

        const first = await cache.load(root);
        const second = await cache.load(root);

        expect(first).toBe(second);
        expect(loadRuntime).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
    });

    it("deduplicates concurrent loads of the same package", async () => {
        const root = createPackage();
        roots.push(root);
        const game = {getInfo: () => ({id: "cache-fixture", name: "Cache Fixture", version: "1.0.0"})} as FakeGame;
        let finish: FinishLoading = () => undefined;
        const loadRuntime = jest.fn(() => new Promise<LoadedFakeGame>((resolve) => {
            finish = resolve;
        }));
        const cache = new StudioGameRuntimeCache(() => Promise.resolve({}), loadRuntime as never);

        const first = cache.load(root);
        const second = cache.load(root);
        finish({game, release: () => Promise.resolve()});

        await expect(first).resolves.toBe(game);
        await expect(second).resolves.toBe(game);
        expect(loadRuntime).toHaveBeenCalledTimes(1);
    });

    it("releases the previous lease and reloads when the entry changes", async () => {
        const root = createPackage();
        roots.push(root);
        const games = [
            {getInfo: () => ({id: "one", name: "One", version: "1.0.0"})},
            {getInfo: () => ({id: "two", name: "Two", version: "1.0.0"})},
        ] as FakeGame[];
        const releases = [jest.fn(() => Promise.resolve()), jest.fn(() => Promise.resolve())];
        let call = 0;
        const loadRuntime = jest.fn(() => Promise.resolve({game: games[call], release: releases[call++]}));
        const cache = new StudioGameRuntimeCache(() => Promise.resolve({}), loadRuntime as never);

        expect(await cache.load(root)).toBe(games[0]);
        fs.writeFileSync(path.join(root, "dist", "index.js"), "module.exports = {getInfo(){return {id:'two',name:'Two',version:'1.0.0'}}};\n// rebuilt\n");
        expect(await cache.load(root)).toBe(games[1]);

        expect(loadRuntime).toHaveBeenCalledTimes(2);
        expect(releases[0]).toHaveBeenCalledTimes(1);
    });

    it("lets the package validator reuse the cached game without claiming to own a snapshot", async () => {
        const root = createPackage();
        roots.push(root);
        const game = {getInfo: () => ({id: "cache-fixture", name: "Cache Fixture", version: "1.0.0"})} as FakeGame;
        const loadRuntime = jest.fn(() => Promise.resolve({game, release: () => Promise.resolve()}));
        const cache = new StudioGameRuntimeCache(() => Promise.resolve({}), loadRuntime as never);

        const resolved = await cache.resolveEntryModule(root);
        await resolved.release();

        expect(resolved.entryPath).toBe(path.join(fs.realpathSync(root), "dist", "index.js"));
        expect(resolved.candidate).toBe(game);
        expect(loadRuntime).toHaveBeenCalledTimes(1);
    });

    it("releases the lease on dispose and refuses later loads", async () => {
        const root = createPackage();
        roots.push(root);
        const game = {getInfo: () => ({id: "cache-fixture", name: "Cache Fixture", version: "1.0.0"})} as FakeGame;
        const release = jest.fn(() => Promise.resolve());
        const loadRuntime = jest.fn(() => Promise.resolve({game, release}));
        const cache = new StudioGameRuntimeCache(() => Promise.resolve({}), loadRuntime as never);

        await cache.load(root);
        await cache.dispose();

        expect(release).toHaveBeenCalledTimes(1);
        await expect(cache.load(root)).rejects.toThrow("disposed");
    });
});
