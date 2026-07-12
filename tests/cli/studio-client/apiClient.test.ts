import {
    closeProject,
    createProject,
    FetchLike,
    getContext,
    getProjectContext,
    inspectProject,
    listRecentProjects,
    openProject,
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
});
