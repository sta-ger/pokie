import {
    buildReplayDownloadUrl,
    buildReportDownloadUrl,
    cancelSimulation,
    closeProject,
    createProject,
    FetchLike,
    getContext,
    getProjectContext,
    getReplay,
    getReport,
    getSimulation,
    inspectProject,
    listReplays,
    listReports,
    listRecentProjects,
    openProject,
    runReplay,
    startSimulation,
    validateProject,
} from "../../../cli/studio-client/apiClient.js";

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
        it("GETs /api/recent-projects", async () => {
            const entries = [{projectRoot: "/a", name: "A", openedAt: "2026-01-01T00:00:00.000Z"}];
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: entries}));

            const result = await listRecentProjects(fetchImpl);

            expect(calls).toEqual([{url: "/api/recent-projects", init: undefined}]);
            expect(result).toEqual(entries);
        });
    });

    describe("createProject", () => {
        it("POSTs the name and returns the resulting context/manifest", async () => {
            const body = {context: {mode: "project", projectRoot: "/a"}, manifest: {id: "a", name: "A", version: "1.0.0"}};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body}));

            const result = await createProject(fetchImpl, "crazy-fruits");

            expect(calls).toEqual([
                {
                    url: "/api/projects/create",
                    init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: "crazy-fruits"})},
                },
            ]);
            expect(result).toEqual(body);
        });

        it("throws the server's own error message on failure", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"name" is required.'}}));

            await expect(createProject(fetchImpl, "")).rejects.toThrow('"name" is required.');
        });

        it("falls back to a generic message when the error body isn't parseable JSON", async () => {
            const fetchImpl: FetchLike = () =>
                Promise.resolve({ok: false, status: 500, json: () => Promise.reject(new Error("not json"))});

            await expect(createProject(fetchImpl, "crazy-fruits")).rejects.toThrow(/HTTP 500/);
        });
    });

    describe("openProject", () => {
        it("POSTs the projectRoot and returns the resulting context/manifest", async () => {
            const body = {context: {mode: "project", projectRoot: "/a"}, manifest: {id: "a", name: "A", version: "1.0.0"}};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body}));

            const result = await openProject(fetchImpl, "./crazy-fruits");

            expect(calls).toEqual([
                {
                    url: "/api/projects/open",
                    init: {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({projectRoot: "./crazy-fruits"}),
                    },
                },
            ]);
            expect(result).toEqual(body);
        });

        it("throws the server's own error message on failure", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: "not a pokie game package"}}));

            await expect(openProject(fetchImpl, "./bogus")).rejects.toThrow("not a pokie game package");
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
                    game: {id: "crazy-fruits", version: "0.1.0"},
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
        it("GETs /api/project/reports/:id and returns the SimulationReport", async () => {
            const report = {
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: report}));

            const result = await getReport(fetchImpl, "job-1");

            expect(calls).toEqual([{url: "/api/project/reports/job-1", init: undefined}]);
            expect(result).toEqual(report);
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
        it("POSTs round and seed and returns the created replay", () => {
            const record = {
                id: "replay-1",
                projectRoot: "/a",
                descriptor: {
                    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                    seed: "demo",
                    round: 42,
                    totalBet: 42,
                    totalWin: 10,
                    screen: [["A"]],
                    timestamp: 1735707845000,
                    durationMs: 5,
                },
            };
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body: record}));

            return runReplay(fetchImpl, 42, "demo").then((result) => {
                expect(calls).toEqual([
                    {
                        url: "/api/project/replays",
                        init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({round: 42, seed: "demo"})},
                    },
                ]);
                expect(result).toEqual(record);
            });
        });

        it("omits seed from the body when not given", async () => {
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 201, body: {}}));

            await runReplay(fetchImpl, 42);

            expect(calls[0].init?.body).toBe(JSON.stringify({round: 42}));
        });

        it("throws the server's own error message on failure", async () => {
            const {fetchImpl} = createFakeFetch(() => ({ok: false, status: 400, body: {error: '"round" must be a positive integer.'}}));

            await expect(runReplay(fetchImpl, 0)).rejects.toThrow('"round" must be a positive integer.');
        });
    });

    describe("getReplay", () => {
        it("GETs /api/project/replays/:id and returns the record", async () => {
            const record = {id: "replay-1", projectRoot: "/a", descriptor: {round: 1}};
            const {fetchImpl, calls} = createFakeFetch(() => ({ok: true, status: 200, body: record}));

            const result = await getReplay(fetchImpl, "replay-1");

            expect(calls).toEqual([{url: "/api/project/replays/replay-1", init: undefined}]);
            expect(result).toEqual(record);
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

    describe("listReplays", () => {
        it("GETs /api/project/replays and returns the list", async () => {
            const entries = [
                {
                    id: "replay-1",
                    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                    round: 42,
                    seed: "demo",
                    totalBet: 42,
                    totalWin: 10,
                    timestamp: 1735707845000,
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
});
