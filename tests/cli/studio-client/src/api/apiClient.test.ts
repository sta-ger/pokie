import {
    buildBlueprint,
    buildReplayDownloadUrl,
    buildReportDownloadUrl,
    cancelReplay,
    cancelSimulation,
    closeProject,
    createPlaySession,
    exportParSheet,
    FetchLike,
    generateRandomBlueprint,
    getContext,
    getProjectContext,
    getReplay,
    getReport,
    getSimulation,
    importParSheet,
    inspectProject,
    listProjectRegistry,
    listReplays,
    listReports,
    listRecentProjects,
    loadBlueprint,
    openProject,
    previewBlueprintBuild,
    previewProjectImport,
    previewReelStripGeneration,
    ProjectOpenError,
    registerProjectImport,
    removeProjectRegistryEntry,
    runReplay,
    saveBlueprint,
    saveManagedBlueprint,
    spinPlaySession,
    startSimulation,
    validateBlueprint,
    validateProject,
} from "../../../../../cli/studio-client/src/api/apiClient";

type FakeCall = {url: string; init?: {method?: string; headers?: Record<string, string>; body?: string}};

function createFakeFetch(handler: (call: FakeCall) => {ok: boolean; status: number; body: unknown}): {
    fetchImpl: FetchLike;
    calls: FakeCall[];
} {
    const calls: FakeCall[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        calls.push({url, init});
        const response = handler({url, init});
        return Promise.resolve({ok: response.ok, status: response.status, json: () => Promise.resolve(response.body)});
    };
    return {fetchImpl, calls};
}

describe("studio-client apiClient", () => {
    describe("getContext", () => {
        it("GETs /api/context", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {mode: "home"}}));

            const context = await getContext(fetchImpl);

            expect(calls).toEqual([{url: "/api/context", init: undefined}]);
            expect(context).toEqual({mode: "home"});
        });
    });

    describe("listRecentProjects", () => {
        it("GETs /api/home/recent-projects", async () => {
            const entries = [{projectRoot: "/a", name: "A", openedAt: "2026-01-01T00:00:00.000Z", missing: false}];
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: entries}));

            const result = await listRecentProjects(fetchImpl);

            expect(calls).toEqual([{url: "/api/home/recent-projects", init: undefined}]);
            expect(result).toEqual(entries);
        });
    });

    describe("listProjectRegistry", () => {
        it("GETs /api/home/projects/registry and returns the list", async () => {
            const entries = [
                {
                    location: "/a",
                    name: "A",
                    type: "tsPackage",
                    capabilities: [],
                    origin: "managed",
                    lastOpenedAt: "2026-01-01T00:00:00.000Z",
                    status: "ok",
                },
            ];
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: entries}));

            const result = await listProjectRegistry(fetchImpl);

            expect(calls).toEqual([{url: "/api/home/projects/registry", init: undefined}]);
            expect(result).toEqual(entries);
        });
    });

    describe("previewProjectImport", () => {
        it("POSTs the location and returns a recognized preview", async () => {
            const body = {status: "recognized", location: "/a", type: "tsPackage", capabilities: ["multiMode"], suggestedName: "a"};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await previewProjectImport(fetchImpl, "/a");

            expect(calls).toEqual([
                {
                    url: "/api/home/projects/registry/preview",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({location: "/a"})},
                },
            ]);
            expect(result).toEqual(body);
        });

        it("returns an unrecognized result rather than throwing", async () => {
            const body = {status: "unrecognized", path: "/not-a-project"};
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body}));

            expect(await previewProjectImport(fetchImpl, "/not-a-project")).toEqual(body);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"location" is required.'}}));

            await expect(previewProjectImport(fetchImpl, "")).rejects.toThrow('"location" is required.');
        });
    });

    describe("registerProjectImport", () => {
        it("POSTs the location/name and returns the registered entry", async () => {
            const body = {
                status: "ok",
                entry: {
                    location: "/a",
                    name: "a",
                    type: "tsPackage",
                    capabilities: [],
                    origin: "external",
                    lastOpenedAt: "2026-01-01T00:00:00.000Z",
                    status: "ok",
                },
            };
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body}));

            const result = await registerProjectImport(fetchImpl, "/a", "a");

            expect(calls).toEqual([
                {
                    url: "/api/home/projects/registry/register",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({location: "/a", name: "a"})},
                },
            ]);
            expect(result).toEqual(body);
        });

        it("omits name from the body when not given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body: {status: "ok"}}));

            await registerProjectImport(fetchImpl, "/a");

            expect(calls[0].init?.body).toBe(JSON.stringify({location: "/a", name: undefined}));
        });

        it("returns an unrecognized result rather than throwing", async () => {
            const body = {status: "unrecognized", path: "/not-a-project"};
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body}));

            expect(await registerProjectImport(fetchImpl, "/not-a-project")).toEqual(body);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"location" is required.'}}));

            await expect(registerProjectImport(fetchImpl, "")).rejects.toThrow('"location" is required.');
        });
    });

    describe("removeProjectRegistryEntry", () => {
        it("POSTs the location", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "ok"}}));

            await removeProjectRegistryEntry(fetchImpl, "/a");

            expect(calls).toEqual([
                {
                    url: "/api/home/projects/registry/remove",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({location: "/a"})},
                },
            ]);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"location" is required.'}}));

            await expect(removeProjectRegistryEntry(fetchImpl, "")).rejects.toThrow('"location" is required.');
        });
    });

    describe("validateBlueprint", () => {
        it("POSTs the blueprint and returns the validation result", async () => {
            const body = {status: "ok", warnings: []};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await validateBlueprint(fetchImpl, {manifest: {id: "a"}});

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/validate",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({blueprint: {manifest: {id: "a"}}}),
                    },
                },
            ]);
            expect(result).toEqual(body);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"blueprint" is required.'}}));

            await expect(validateBlueprint(fetchImpl, undefined)).rejects.toThrow('"blueprint" is required.');
        });
    });

    describe("previewReelStripGeneration", () => {
        it("POSTs the blueprint and returns the resolved reels", async () => {
            const body = {status: "ok", warnings: [], reels: []};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await previewReelStripGeneration(fetchImpl, {manifest: {id: "a"}});

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/reel-strip-generation-preview",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({blueprint: {manifest: {id: "a"}}}),
                    },
                },
            ]);
            expect(result).toEqual(body);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"blueprint" is required.'}}));

            await expect(previewReelStripGeneration(fetchImpl, undefined)).rejects.toThrow('"blueprint" is required.');
        });
    });

    describe("loadBlueprint", () => {
        it("POSTs the path and returns the loaded blueprint", async () => {
            const body = {status: "ok", path: "/a/blueprint.json", blueprint: {manifest: {id: "a"}}};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await loadBlueprint(fetchImpl, "./blueprint.json");

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/load",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: "./blueprint.json"})},
                },
            ]);
            expect(result).toEqual(body);
        });

        it("returns a load-error result rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "load-error", error: "not found"}}));

            expect(await loadBlueprint(fetchImpl, "./missing.json")).toEqual({status: "load-error", error: "not found"});
        });
    });

    describe("generateRandomBlueprint", () => {
        it("POSTs the request and returns the generated blueprint", async () => {
            const body = {status: "ok", blueprint: {manifest: {id: "a"}}, seed: 42, preset: "default", provenance: {generatorVersion: "1.0.0", strategy: "default", seed: 42}};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await generateRandomBlueprint(fetchImpl, {seed: 42, preset: "default"});

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/random",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({seed: 42, preset: "default"})},
                },
            ]);
            expect(result).toEqual(body);
        });

        it("defaults to an empty request body when none is given", async () => {
            const body = {status: "ok", blueprint: {manifest: {id: "a"}}, seed: 7, preset: "default", provenance: {generatorVersion: "1.0.0", strategy: "default", seed: 7}};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            await generateRandomBlueprint(fetchImpl);

            expect(calls).toEqual([
                {url: "/api/home/blueprints/random", init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({})}},
            ]);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"seed" must be an integer when given.'}}));

            await expect(generateRandomBlueprint(fetchImpl, {seed: 1.5 as unknown as number})).rejects.toThrow('"seed" must be an integer when given.');
        });
    });

    describe("saveBlueprint", () => {
        it("POSTs the path/blueprint/overwrite and returns the save result", async () => {
            const body = {status: "ok", path: "/a/blueprint.json"};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body}));

            const result = await saveBlueprint(fetchImpl, "./blueprint.json", {manifest: {id: "a"}}, false);

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/save",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({path: "./blueprint.json", blueprint: {manifest: {id: "a"}}, overwrite: false}),
                    },
                },
            ]);
            expect(result).toEqual(body);
        });

        it("returns a typed conflict (not a thrown error) on 409", async () => {
            const body = {status: "conflict", path: "/a/blueprint.json", error: "already exists"};
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body}));

            const result = await saveBlueprint(fetchImpl, "./blueprint.json", {manifest: {id: "a"}}, false);

            expect(result).toEqual(body);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"path" is required.'}}));

            await expect(saveBlueprint(fetchImpl, "", {}, false)).rejects.toThrow('"path" is required.');
        });
    });

    describe("saveManagedBlueprint", () => {
        it("POSTs only the blueprint (no path) and returns the save-managed result", async () => {
            const body = {status: "ok", path: "/POKIE Projects/a/blueprint.json", name: "a"};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body}));

            const result = await saveManagedBlueprint(fetchImpl, {manifest: {id: "a"}});

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/save-managed",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({blueprint: {manifest: {id: "a"}}})},
                },
            ]);
            expect(result).toEqual(body);
        });

        it("returns a typed invalid-name/unavailable outcome (not a thrown error) since both ride on 200", async () => {
            const body = {status: "invalid-name", error: "not a valid project name"};
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await saveManagedBlueprint(fetchImpl, {});

            expect(result).toEqual(body);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"blueprint" is required.'}}));

            await expect(saveManagedBlueprint(fetchImpl, undefined)).rejects.toThrow('"blueprint" is required.');
        });
    });

    describe("importParSheet", () => {
        it("POSTs the path and returns the import result", async () => {
            const body = {status: "ok", path: "/a/in.par.xlsx", blueprint: {manifest: {id: "a"}}, errors: [], warnings: []};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await importParSheet(fetchImpl, "./in.par.xlsx");

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/par-import",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: "./in.par.xlsx"})},
                },
            ]);
            expect(result).toEqual(body);
        });

        it("returns a load-error result rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "load-error", error: "not found"}}));

            expect(await importParSheet(fetchImpl, "./missing.par.xlsx")).toEqual({status: "load-error", error: "not found"});
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"path" is required.'}}));

            await expect(importParSheet(fetchImpl, "")).rejects.toThrow('"path" is required.');
        });
    });

    describe("exportParSheet", () => {
        it("POSTs the blueprint/path/overwrite/sourcePath and returns the export result", async () => {
            const body = {status: "ok", path: "/a/out.par.xlsx", warnings: []};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body}));

            const result = await exportParSheet(fetchImpl, {manifest: {id: "a"}}, "./out.par.xlsx", false, "blueprint.json");

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/par-export",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({blueprint: {manifest: {id: "a"}}, path: "./out.par.xlsx", overwrite: false, sourcePath: "blueprint.json"}),
                    },
                },
            ]);
            expect(result).toEqual(body);
        });

        it("returns a typed conflict (not a thrown error) on 409", async () => {
            const body = {status: "conflict", path: "/a/out.par.xlsx", error: "already exists"};
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body}));

            const result = await exportParSheet(fetchImpl, {manifest: {id: "a"}}, "./out.par.xlsx", false);

            expect(result).toEqual(body);
        });

        it("throws the server's own error message for a malformed request", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"path" is required.'}}));

            await expect(exportParSheet(fetchImpl, {}, "", false)).rejects.toThrow('"path" is required.');
        });
    });

    describe("previewBlueprintBuild", () => {
        it("POSTs the blueprint/outDir/sourcePath and returns the preview", async () => {
            const body = {
                status: "ok",
                warnings: [],
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                reels: 5,
                rows: 3,
                symbolsCount: 7,
                blueprintHash: "sha256:abc",
                expectedFiles: ["package.json"],
            };
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await previewBlueprintBuild(fetchImpl, {manifest: {id: "sample-slot"}}, "./out", "blueprint.json");

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/build-preview",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({blueprint: {manifest: {id: "sample-slot"}}, outDir: "./out", sourcePath: "blueprint.json"}),
                    },
                },
            ]);
            expect(result).toEqual(body);
        });

        it("returns an invalid result rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "invalid", errors: [], warnings: []}}));

            expect(await previewBlueprintBuild(fetchImpl, {})).toEqual({status: "invalid", errors: [], warnings: []});
        });
    });

    describe("buildBlueprint", () => {
        it("POSTs the blueprint/outDir/sourcePath and returns the build result", async () => {
            const body = {
                status: "ok",
                projectRoot: "/out",
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                createdFiles: ["package.json"],
                buildInfo: {schemaVersion: 1, generatedBy: "pokie build", pokieVersion: "1.0.0", generatedAt: "2026-01-01T00:00:00.000Z", blueprintHash: "sha256:abc", game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}},
                unchanged: false,
                warnings: [],
            };
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body}));

            const result = await buildBlueprint(fetchImpl, {manifest: {id: "sample-slot"}}, "./out");

            expect(calls).toEqual([
                {
                    url: "/api/home/blueprints/build",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({blueprint: {manifest: {id: "sample-slot"}}, outDir: "./out"}),
                    },
                },
            ]);
            expect(result).toEqual(body);
        });

        it("returns an invalid/error result rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "error", error: "conflict"}}));

            expect(await buildBlueprint(fetchImpl, {})).toEqual({status: "error", error: "conflict"});
        });
    });

    describe("openProject", () => {
        it("POSTs the projectRoot and returns the resulting context/manifest", async () => {
            const body = {context: {mode: "project", projectRoot: "/a"}, manifest: {id: "a", name: "A", version: "1.0.0"}};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await openProject(fetchImpl, "./sample-slot");

            expect(calls).toEqual([
                {
                    url: "/api/home/projects/open",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({projectRoot: "./sample-slot"}),
                    },
                },
            ]);
            expect(result).toEqual(body);
        });

        it("throws the server's own error message on failure", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: "not a pokie game package"}}));

            await expect(openProject(fetchImpl, "./bogus")).rejects.toThrow("not a pokie game package");
        });

        it("carries the server's raw npm diagnostic as ProjectOpenError.detail when a materialization fails", async () => {
            const {fetchImpl} = createFakeFetch(() => ({
                ok: false,
                status: 400,
                body: {error: "Installing dependencies failed.", detail: "npm ERR! simulated failure"},
            }));

            const failure: unknown = await openProject(fetchImpl, "./bogus").catch((error: unknown) => error);

            expect(failure).toBeInstanceOf(ProjectOpenError);
            expect((failure as ProjectOpenError).message).toBe("Installing dependencies failed.");
            expect((failure as ProjectOpenError).detail).toBe("npm ERR! simulated failure");
        });

        it("leaves ProjectOpenError.detail undefined when the server doesn't supply one", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: "not a pokie game package"}}));

            const failure: unknown = await openProject(fetchImpl, "./bogus").catch((error: unknown) => error);

            expect(failure).toBeInstanceOf(ProjectOpenError);
            expect((failure as ProjectOpenError).detail).toBeUndefined();
        });
    });

    describe("closeProject", () => {
        it("POSTs to /api/projects/close and returns the new context", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {context: {mode: "home"}}}));

            const context = await closeProject(fetchImpl);

            expect(calls).toEqual([{url: "/api/projects/close", init: {method: "POST"}}]);
            expect(context).toEqual({mode: "home"});
        });
    });

    describe("getProjectContext", () => {
        it("GETs /api/project/context", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "empty"}}));

            const dashboard = await getProjectContext(fetchImpl);

            expect(calls).toEqual([{url: "/api/project/context", init: undefined}]);
            expect(dashboard).toEqual({status: "empty"});
        });

        it("returns a loading/loaded/error dashboard as-is", async () => {
            const loading = createFakeFetch(() => ({ok: true, status: 200, body: {status: "loading", projectRoot: "/a"}}));
            expect(await getProjectContext(loading.fetchImpl)).toEqual({status: "loading", projectRoot: "/a"});

            const loaded = createFakeFetch(() => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/a", game: {id: "a", name: "A", version: "1.0.0"}},
            }));
            expect(await getProjectContext(loaded.fetchImpl)).toEqual({
                status: "loaded",
                projectRoot: "/a",
                game: {id: "a", name: "A", version: "1.0.0"},
            });

            const errored = createFakeFetch(() => ({ok: true, status: 200, body: {status: "error", projectRoot: "/a", error: "boom"}}));
            expect(await getProjectContext(errored.fetchImpl)).toEqual({status: "error", projectRoot: "/a", error: "boom"});
        });
    });

    describe("inspectProject", () => {
        it("GETs /api/project/inspect and returns the report", async () => {
            const report = {packageRoot: "/a", valid: true, generated: false, packageJson: {name: "a", version: "1.0.0"}};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: report}));

            const result = await inspectProject(fetchImpl);

            expect(calls).toEqual([{url: "/api/project/inspect", init: undefined}]);
            expect(result).toEqual(report);
        });

        it("throws the server's own error message when there is no active project", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body: {error: "No active project."}}));

            await expect(inspectProject(fetchImpl)).rejects.toThrow("No active project.");
        });
    });

    describe("validateProject", () => {
        it("GETs /api/project/validate and returns the report", async () => {
            const report = {packageRoot: "/a", valid: true, game: {id: "a", name: "A", version: "1.0.0"}, errors: [], warnings: [], suggestions: []};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: report}));

            const result = await validateProject(fetchImpl);

            expect(calls).toEqual([{url: "/api/project/validate", init: undefined}]);
            expect(result).toEqual(report);
        });

        it("throws the server's own error message when there is no active project", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body: {error: "No active project."}}));

            await expect(validateProject(fetchImpl)).rejects.toThrow("No active project.");
        });
    });

    describe("startSimulation", () => {
        it("POSTs rounds and seed and returns the created job", async () => {
            const job = {id: "job-1", status: "queued", rounds: 1000, seed: "demo", startedAt: "2026-01-01T00:00:00.000Z", roundsCompleted: 0, durationMs: 0};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 202, body: job}));

            const result = await startSimulation(fetchImpl, 1000, "demo");

            expect(calls).toEqual([
                {
                    url: "/api/project/simulations",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({rounds: 1000, seed: "demo"}),
                    },
                },
            ]);
            expect(result).toEqual({status: "created", job});
        });

        it("omits seed from the body when not given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 202, body: {id: "job-1", status: "queued"}}));

            await startSimulation(fetchImpl, 1000);

            expect(calls[0].init?.body).toBe(JSON.stringify({rounds: 1000}));
        });

        it("includes workers in the body when given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 202, body: {id: "job-1", status: "queued"}}));

            await startSimulation(fetchImpl, 1000, "demo", 4);

            expect(calls[0].init?.body).toBe(JSON.stringify({rounds: 1000, seed: "demo", workers: 4}));
        });

        it("omits workers from the body when not given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 202, body: {id: "job-1", status: "queued"}}));

            await startSimulation(fetchImpl, 1000);

            expect(JSON.parse(calls[0].init?.body ?? "{}")).not.toHaveProperty("workers");
        });

        it("returns a typed conflict (not a thrown error) when another simulation is already active", async () => {
            const {fetchImpl} = createFakeFetch(() => ({
                ok: false,
                status: 409,
                body: {error: "A simulation is already running for this project.", activeJobId: "job-0"},
            }));

            const result = await startSimulation(fetchImpl, 1000);

            expect(result).toEqual({status: "conflict", activeJobId: "job-0"});
        });

        it("throws for a 409 with no active project (no activeJobId)", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body: {error: "No active project."}}));

            await expect(startSimulation(fetchImpl, 1000)).rejects.toThrow("No active project.");
        });

        it("throws the server's own error message for an invalid rounds", async () => {
            const {fetchImpl} = createFakeFetch(() => ({
                ok: false,
                status: 400,
                body: {error: '"rounds" must be a positive integer.'},
            }));

            await expect(startSimulation(fetchImpl, 0)).rejects.toThrow('"rounds" must be a positive integer.');
        });
    });

    describe("getSimulation", () => {
        it("GETs /api/project/simulations/:id and returns the job", async () => {
            const job = {id: "job-1", status: "completed", rounds: 1000, roundsCompleted: 1000, durationMs: 42, startedAt: "2026-01-01T00:00:00.000Z"};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: job}));

            const result = await getSimulation(fetchImpl, "job-1");

            expect(calls).toEqual([{url: "/api/project/simulations/job-1", init: undefined}]);
            expect(result).toEqual(job);
        });

        it("encodes the id in the URL", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {id: "a/b"}}));

            await getSimulation(fetchImpl, "a/b");

            expect(calls[0].url).toBe("/api/project/simulations/a%2Fb");
        });

        it("throws the server's own error message for an unknown id", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 404, body: {error: 'Unknown simulation id "does-not-exist".'}}));

            await expect(getSimulation(fetchImpl, "does-not-exist")).rejects.toThrow('Unknown simulation id "does-not-exist".');
        });
    });

    describe("cancelSimulation", () => {
        it("DELETEs /api/project/simulations/:id and returns the updated job", async () => {
            const job = {id: "job-1", status: "running", rounds: 1000, roundsCompleted: 200, durationMs: 10, startedAt: "2026-01-01T00:00:00.000Z"};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: job}));

            const result = await cancelSimulation(fetchImpl, "job-1");

            expect(calls).toEqual([{url: "/api/project/simulations/job-1", init: {method: "DELETE"}}]);
            expect(result).toEqual(job);
        });

        it("throws the server's own error message for an unknown id", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 404, body: {error: 'Unknown simulation id "does-not-exist".'}}));

            await expect(cancelSimulation(fetchImpl, "does-not-exist")).rejects.toThrow('Unknown simulation id "does-not-exist".');
        });
    });

    describe("listReports", () => {
        it("GETs /api/project/reports and returns the list", async () => {
            const entries = [
                {
                    id: "job-1",
                    status: "completed",
                    game: {id: "sample-slot", version: "0.1.0"},
                    requestedRounds: 1000,
                    actualRounds: 1000,
                    rtp: 0.95,
                    hitFrequency: 0.25,
                    maxWin: 120,
                    startedAt: "2026-01-01T00:00:00.000Z",
                    completedAt: "2026-01-01T00:00:01.000Z",
                    durationMs: 1000,
                    hasWarnings: false,
                },
            ];
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: entries}));

            const result = await listReports(fetchImpl);

            expect(calls).toEqual([{url: "/api/project/reports", init: undefined}]);
            expect(result).toEqual(entries);
        });

        it("returns an empty list when there are no completed simulations yet", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body: []}));

            expect(await listReports(fetchImpl)).toEqual([]);
        });

        it("throws the server's own error message when there is no active project", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body: {error: "No active project."}}));

            await expect(listReports(fetchImpl)).rejects.toThrow("No active project.");
        });
    });

    describe("getReport", () => {
        it("GETs /api/project/reports/:id and returns the StudioSimulationReportDetail envelope (report + statistics)", async () => {
            const report = {
                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                requestedRounds: 1000,
                rounds: 1000,
                seed: "demo",
                totalBet: 1000,
                totalWin: 950,
                rtp: 0.95,
                hitFrequency: 0.25,
                maxWin: 120,
                durationMs: 500,
                spinsPerSecond: 2000,
            };
            const statistics = {
                volatility: 12.5,
                payoutStandardDeviation: 12.5,
                returnStandardDeviation: 0.5,
                averagePayoutConfidenceInterval95: {low: 0.9, high: 1.1},
                rtpConfidenceInterval95: {low: 0.94, high: 0.98},
            };
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {report, statistics}}));

            const result = await getReport(fetchImpl, "job-1");

            expect(calls).toEqual([{url: "/api/project/reports/job-1", init: undefined}]);
            expect(result).toEqual({report, statistics});
        });

        it("encodes the id in the URL", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {}}));

            await getReport(fetchImpl, "a/b");

            expect(calls[0].url).toBe("/api/project/reports/a%2Fb");
        });

        it("throws the server's own error message for an unknown id", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 404, body: {error: 'Unknown report id "does-not-exist".'}}));

            await expect(getReport(fetchImpl, "does-not-exist")).rejects.toThrow('Unknown report id "does-not-exist".');
        });

        it("throws the server's own error message for a simulation with no report", async () => {
            const {fetchImpl} = createFakeFetch(() => ({
                ok: false,
                status: 409,
                body: {error: 'Simulation "job-1" has no report (status: failed).'},
            }));

            await expect(getReport(fetchImpl, "job-1")).rejects.toThrow('Simulation "job-1" has no report (status: failed).');
        });
    });

    describe("buildReportDownloadUrl", () => {
        it("builds a URL for each format", () => {
            expect(buildReportDownloadUrl("job-1", "json")).toBe("/api/project/reports/job-1/download?format=json");
            expect(buildReportDownloadUrl("job-1", "markdown")).toBe("/api/project/reports/job-1/download?format=markdown");
            expect(buildReportDownloadUrl("job-1", "html")).toBe("/api/project/reports/job-1/download?format=html");
        });

        it("encodes the id in the URL", () => {
            expect(buildReportDownloadUrl("a/b", "json")).toBe("/api/project/reports/a%2Fb/download?format=json");
        });
    });

    describe("runReplay", () => {
        it("POSTs round and seed and returns the created job", async () => {
            const job = {id: "replay-1", status: "queued", round: 42, seed: "demo", startedAt: "2026-01-01T00:00:00.000Z", completedRounds: 0, durationMs: 0};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 202, body: job}));

            const result = await runReplay(fetchImpl, 42, "demo");

            expect(calls).toEqual([
                {
                    url: "/api/project/replays",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({round: 42, seed: "demo"})},
                },
            ]);
            expect(result).toEqual({status: "created", job});
        });

        it("omits seed from the body when not given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 202, body: {id: "replay-1", status: "queued"}}));

            await runReplay(fetchImpl, 42);

            expect(calls[0].init?.body).toBe(JSON.stringify({round: 42}));
        });

        it("returns a typed conflict (not a thrown error) when another replay is already active", async () => {
            const {fetchImpl} = createFakeFetch(() => ({
                ok: false,
                status: 409,
                body: {error: "A replay is already running for this project.", activeJobId: "replay-0"},
            }));

            const result = await runReplay(fetchImpl, 42);

            expect(result).toEqual({status: "conflict", activeJobId: "replay-0"});
        });

        it("throws for a 409 with no active project (no activeJobId)", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body: {error: "No active project."}}));

            await expect(runReplay(fetchImpl, 42)).rejects.toThrow("No active project.");
        });

        it("throws the server's own error message for an invalid round", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"round" must be a positive integer.'}}));

            await expect(runReplay(fetchImpl, 0)).rejects.toThrow('"round" must be a positive integer.');
        });
    });

    describe("getReplay", () => {
        it("GETs /api/project/replays/:id and returns the job", async () => {
            const job = {id: "replay-1", status: "completed", round: 1, startedAt: "2026-01-01T00:00:00.000Z", completedRounds: 1, durationMs: 5};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: job}));

            const result = await getReplay(fetchImpl, "replay-1");

            expect(calls).toEqual([{url: "/api/project/replays/replay-1", init: undefined}]);
            expect(result).toEqual(job);
        });

        it("encodes the id in the URL", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {}}));

            await getReplay(fetchImpl, "a/b");

            expect(calls[0].url).toBe("/api/project/replays/a%2Fb");
        });

        it("throws the server's own error message for an unknown id", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 404, body: {error: 'Unknown replay id "does-not-exist".'}}));

            await expect(getReplay(fetchImpl, "does-not-exist")).rejects.toThrow('Unknown replay id "does-not-exist".');
        });
    });

    describe("cancelReplay", () => {
        it("DELETEs /api/project/replays/:id and returns the updated job", async () => {
            const job = {id: "replay-1", status: "cancelled", round: 1000, startedAt: "2026-01-01T00:00:00.000Z", completedRounds: 200, durationMs: 10};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: job}));

            const result = await cancelReplay(fetchImpl, "replay-1");

            expect(calls).toEqual([{url: "/api/project/replays/replay-1", init: {method: "DELETE"}}]);
            expect(result).toEqual(job);
        });

        it("throws the server's own error message for an unknown id", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 404, body: {error: 'Unknown replay id "does-not-exist".'}}));

            await expect(cancelReplay(fetchImpl, "does-not-exist")).rejects.toThrow('Unknown replay id "does-not-exist".');
        });
    });

    describe("listReplays", () => {
        it("GETs /api/project/replays and returns the list", async () => {
            const entries = [
                {
                    id: "replay-1",
                    status: "completed",
                    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                    round: 42,
                    seed: "demo",
                    completedRounds: 42,
                    totalBet: 42,
                    totalWin: 10,
                    startedAt: "2026-01-01T00:00:00.000Z",
                    completedAt: "2026-01-01T00:00:01.000Z",
                    durationMs: 5,
                },
            ];
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: entries}));

            const result = await listReplays(fetchImpl);

            expect(calls).toEqual([{url: "/api/project/replays", init: undefined}]);
            expect(result).toEqual(entries);
        });

        it("returns an empty list when there are no replays yet", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body: []}));

            expect(await listReplays(fetchImpl)).toEqual([]);
        });

        it("throws the server's own error message when there is no active project", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body: {error: "No active project."}}));

            await expect(listReplays(fetchImpl)).rejects.toThrow("No active project.");
        });
    });

    describe("buildReplayDownloadUrl", () => {
        it("builds the download URL", () => {
            expect(buildReplayDownloadUrl("replay-1")).toBe("/api/project/replays/replay-1/download");
        });

        it("encodes the id in the URL", () => {
            expect(buildReplayDownloadUrl("a/b")).toBe("/api/project/replays/a%2Fb/download");
        });
    });

    describe("createPlaySession", () => {
        it("POSTs the seed and returns the ok session result", async () => {
            const session = {sessionId: "session-1", game: {id: "a", name: "A", version: "0.1.0"}, credits: 1000};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body: {status: "ok", session}}));

            const result = await createPlaySession(fetchImpl, "demo");

            expect(calls).toEqual([
                {
                    url: "/api/project/play/session",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({seed: "demo"})},
                },
            ]);
            expect(result).toEqual({status: "ok", session});
        });

        it("omits seed from the body when not given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body: {status: "ok", session: {}}}));

            await createPlaySession(fetchImpl);

            expect(calls[0].init?.body).toBe(JSON.stringify({}));
        });

        it("returns a typed no-active-project result (409) rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body: {error: "No active project."}}));

            expect(await createPlaySession(fetchImpl)).toEqual({status: "no-active-project"});
        });

        it("returns a typed error result (200, status: failed) rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "failed", error: "materialization failed"}}));

            expect(await createPlaySession(fetchImpl)).toEqual({status: "error", message: "materialization failed"});
        });
    });

    describe("spinPlaySession", () => {
        it("POSTs with no body and returns the ok session result", async () => {
            const session = {sessionId: "session-1", game: {id: "a", name: "A", version: "0.1.0"}, credits: 995, win: 0};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "ok", session}}));

            const result = await spinPlaySession(fetchImpl, "session-1");

            expect(calls).toEqual([{url: "/api/project/play/sessions/session-1/spin", init: {method: "POST"}}]);
            expect(result).toEqual({status: "ok", session});
        });

        it("encodes the sessionId in the URL", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "ok", session: {}}}));

            await spinPlaySession(fetchImpl, "a/b");

            expect(calls).toEqual([{url: "/api/project/play/sessions/a%2Fb/spin", init: {method: "POST"}}]);
        });

        it("returns a typed not-found result (404) rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 404, body: {error: 'Unknown sessionId "x".'}}));

            expect(await spinPlaySession(fetchImpl, "x")).toEqual({status: "not-found"});
        });

        it("returns a typed blocked result (400) rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: "insufficient balance"}}));

            expect(await spinPlaySession(fetchImpl, "session-1")).toEqual({status: "blocked", message: "insufficient balance"});
        });

        it("returns a typed no-active-project result (409) rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 409, body: {error: "No active project."}}));

            expect(await spinPlaySession(fetchImpl, "session-1")).toEqual({status: "no-active-project"});
        });

        it("returns a typed error result (200, status: error) rather than throwing", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: true, status: 200, body: {status: "error", error: "unexpected failure"}}));

            expect(await spinPlaySession(fetchImpl, "session-1")).toEqual({status: "error", message: "unexpected failure"});
        });
    });
});
