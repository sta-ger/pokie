import {PokieGame, PokieGameManifest, POKIE_WASM_CONTRACT_VERSION} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {InMemoryRecentProjectsRepository} from "../../../../cli/studio/InMemoryRecentProjectsRepository.js";
import type {RecentProjectEntry} from "../../../../cli/studio/RecentProjectEntry.js";
import type {RecentProjectsRepository} from "../../../../cli/studio/RecentProjectsRepository.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("not used by these tests");
        },
    };
}

describe("StudioHomeService", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-home-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    describe("listRecentProjects", () => {
        it("returns an empty list with nothing recorded yet", async () => {
            const service = new StudioHomeService("1.0.0");

            expect(await service.listRecentProjects()).toEqual([]);
        });

        it("marks a project missing: false when its directory and package.json both still exist", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const projectRoot = path.join(tmpDir, "present");
            fs.mkdirSync(projectRoot);
            fs.writeFileSync(path.join(projectRoot, "package.json"), "{}");
            await repository.add({projectRoot, name: "Present", openedAt: "2026-01-01T00:00:00.000Z"});
            const service = new StudioHomeService("1.0.0", repository);

            const entries = await service.listRecentProjects();

            expect(entries).toEqual([{projectRoot, name: "Present", openedAt: "2026-01-01T00:00:00.000Z", missing: false}]);
        });

        it("marks a project missing: true when its directory no longer exists, without removing it", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const projectRoot = path.join(tmpDir, "gone");
            await repository.add({projectRoot, name: "Gone", openedAt: "2026-01-01T00:00:00.000Z"});
            const service = new StudioHomeService("1.0.0", repository);

            const entries = await service.listRecentProjects();

            expect(entries).toEqual([{projectRoot, name: "Gone", openedAt: "2026-01-01T00:00:00.000Z", missing: true}]);
            expect(await repository.list()).toHaveLength(1);
        });

        it("marks a project missing: true when the directory exists but package.json was removed", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const projectRoot = path.join(tmpDir, "no-package-json");
            fs.mkdirSync(projectRoot);
            await repository.add({projectRoot, name: "No package.json", openedAt: "2026-01-01T00:00:00.000Z"});
            const service = new StudioHomeService("1.0.0", repository);

            expect((await service.listRecentProjects())[0].missing).toBe(true);
        });

        it("keeps a compatible WASM component in recents without requiring package.json", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const wasmFile = path.join(tmpDir, "component.wasm");
            fs.writeFileSync(wasmFile, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
            fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, JSON.stringify({
                schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                component: {id: "recent-component", version: "1.0.0"},
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: [],
            }));
            await repository.add({projectRoot: wasmFile, name: "Recent component", openedAt: "2026-01-01T00:00:00.000Z"});
            const service = new StudioHomeService("1.0.0", repository);

            expect(await service.listRecentProjects()).toEqual([
                {projectRoot: wasmFile, name: "Recent component", openedAt: "2026-01-01T00:00:00.000Z", missing: false},
            ]);
        });
    });

    describe("openProject", () => {
        it("loads the project, transitions to loaded, and records it as a recent project", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const service = new StudioHomeService("1.2.1", repository, () => Promise.resolve(createFakeGame(manifest)));

            const dashboard = await service.openProject(tmpDir);

            expect(dashboard.status).toBe("loaded");
            if (dashboard.status === "loaded") {
                expect(dashboard.game).toEqual(manifest);
            }
            expect(await repository.list()).toHaveLength(1);
        });

        it("returns a safe error and records nothing when loading fails", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const service = new StudioHomeService("1.2.1", repository, () => Promise.reject(new Error("not a pokie game package")));

            const dashboard = await service.openProject(tmpDir);

            expect(dashboard).toEqual({status: "error", projectRoot: path.resolve(tmpDir), error: "not a pokie game package"});
            expect(await repository.list()).toEqual([]);
        });

        it("records a compatible WASM inspection but preserves malformed and incompatible sidecar diagnostics without runtime loading", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const loadGame = jest.fn();
            const service = new StudioHomeService("1.2.1", repository, loadGame);
            const compatible = path.join(tmpDir, "compatible.wasm");
            const malformed = path.join(tmpDir, "malformed.wasm");
            const incompatible = path.join(tmpDir, "incompatible.wasm");
            for (const wasmFile of [compatible, malformed, incompatible]) {
                fs.writeFileSync(wasmFile, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
            }
            fs.writeFileSync(`${compatible}.pokie-wasm.json`, JSON.stringify({
                schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                component: {id: "compatible-component", version: "1.0.0"},
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: [],
            }));
            fs.writeFileSync(`${malformed}.pokie-wasm.json`, "{");
            fs.writeFileSync(`${incompatible}.pokie-wasm.json`, JSON.stringify({
                schemaVersion: "2.0.0",
                component: {id: "incompatible-component", version: "1.0.0"},
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: [],
            }));

            expect(await service.openProject(compatible)).toMatchObject({status: "artifact", project: {type: "wasm"}});
            await expect(service.openProject(malformed)).resolves.toMatchObject({status: "error", error: expect.stringContaining("not valid JSON")});
            await expect(service.openProject(incompatible)).resolves.toMatchObject({status: "error", error: expect.stringContaining("not compatible with this POKIE build")});
            expect(loadGame).not.toHaveBeenCalled();
            expect(await repository.list()).toHaveLength(1);
            expect((await repository.list())[0].projectRoot).toBe(path.resolve(compatible));
        });

        it("does not record a project when its owning Home request has been superseded", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const service = new StudioHomeService("1.2.1", repository, () => Promise.resolve(createFakeGame(manifest)));

            await expect(service.openProject(tmpDir, {isCurrent: () => false})).rejects.toThrow("Runtime preparation was cancelled");

            expect(await repository.list()).toEqual([]);
        });

        it("does not commit a recent project when superseded during delayed recent-project bookkeeping", async () => {
            const entries: RecentProjectEntry[] = [];
            let releaseWrite: (() => void) | undefined;
            let notifyAddStarted: (() => void) | undefined;
            const addStarted = new Promise<void>((resolve) => {
                notifyAddStarted = resolve;
            });
            const repository: RecentProjectsRepository = {
                list: () => Promise.resolve([...entries]),
                add: async (entry, options = {}) => {
                    notifyAddStarted?.();
                    await new Promise<void>((resolve) => {
                        releaseWrite = () => {
                            resolve();
                        };
                    });
                    if (options.isCurrent?.() === false) {
                        return false;
                    }
                    entries.splice(0, entries.length, entry, ...entries.filter((existing) => existing.projectRoot !== entry.projectRoot));
                    return true;
                },
            };
            const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
            const service = new StudioHomeService("1.2.1", repository, () => Promise.resolve(createFakeGame(manifest)));
            let current = true;

            const opening = service.openProject(tmpDir, {isCurrent: () => current});
            await addStarted;
            current = false;
            releaseWrite?.();

            await expect(opening).rejects.toThrow("Runtime preparation was cancelled");
            expect(entries).toEqual([]);
        });
    });

    describe("resolveDefaultProjectDirectory", () => {
        it("delegates to the injected PokiePathResolver", () => {
            const resolveIndependentProjectDirectory = jest
                .fn()
                .mockReturnValue({status: "valid", directory: "/home/alice/Documents/POKIE/sample-slot", source: "documents"});
            const service = new StudioHomeService(
                "1.2.1",
                undefined,
                undefined,
                {resolveIndependentProjectDirectory} as unknown as ConstructorParameters<typeof StudioHomeService>[3],
            );

            const result = service.resolveDefaultProjectDirectory("sample-slot");

            expect(resolveIndependentProjectDirectory).toHaveBeenCalledWith("sample-slot");
            expect(result).toEqual({status: "valid", directory: "/home/alice/Documents/POKIE/sample-slot", source: "documents"});
        });
    });

    describe("resolveDefaultBrowseLocation", () => {
        it("delegates to resolveIndependentProjectDirectory when a name is given", () => {
            const resolveIndependentProjectDirectory = jest
                .fn()
                .mockReturnValue({status: "valid", directory: "/home/alice/Documents/POKIE/sample-slot", source: "documents"});
            const service = new StudioHomeService(
                "1.2.1",
                undefined,
                undefined,
                {resolveIndependentProjectDirectory} as unknown as ConstructorParameters<typeof StudioHomeService>[3],
            );

            const result = service.resolveDefaultBrowseLocation("sample-slot");

            expect(resolveIndependentProjectDirectory).toHaveBeenCalledWith("sample-slot");
            expect(result).toEqual({status: "valid", directory: "/home/alice/Documents/POKIE/sample-slot", source: "documents"});
        });

        it("collapses a non-valid resolveIndependentProjectDirectory outcome to unavailable", () => {
            const resolveIndependentProjectDirectory = jest.fn().mockReturnValue({status: "invalid-name", message: "nope"});
            const service = new StudioHomeService(
                "1.2.1",
                undefined,
                undefined,
                {resolveIndependentProjectDirectory} as unknown as ConstructorParameters<typeof StudioHomeService>[3],
            );

            expect(service.resolveDefaultBrowseLocation("../escape")).toEqual({status: "unavailable"});
        });

        it("delegates to resolveBaseDirectory when no name is given", () => {
            const resolveBaseDirectory = jest.fn().mockReturnValue({status: "valid", directory: "/home/alice/Documents", source: "documents"});
            const service = new StudioHomeService(
                "1.2.1",
                undefined,
                undefined,
                {resolveBaseDirectory} as unknown as ConstructorParameters<typeof StudioHomeService>[3],
            );

            const result = service.resolveDefaultBrowseLocation();

            expect(resolveBaseDirectory).toHaveBeenCalled();
            expect(result).toEqual({status: "valid", directory: "/home/alice/Documents", source: "documents"});
        });

        it("collapses a non-valid resolveBaseDirectory outcome to unavailable", () => {
            const resolveBaseDirectory = jest.fn().mockReturnValue({status: "unresolved"});
            const service = new StudioHomeService(
                "1.2.1",
                undefined,
                undefined,
                {resolveBaseDirectory} as unknown as ConstructorParameters<typeof StudioHomeService>[3],
            );

            expect(service.resolveDefaultBrowseLocation("   ")).toEqual({status: "unavailable"});
        });
    });
});
