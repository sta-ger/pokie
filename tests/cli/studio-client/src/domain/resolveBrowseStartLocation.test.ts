import {resolveBrowseStartLocation} from "../../../../../cli/studio-client/src/domain/resolveBrowseStartLocation";
import * as rememberedBrowseLocation from "../../../../../cli/studio-client/src/domain/rememberedBrowseLocation";
import {createRoutedFakeFetch} from "../testUtils/fakeFetch";

describe("resolveBrowseStartLocation", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("uses the current field value's own resolved absolute path once /api/home/fs/browse confirms it resolves", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "./games", entries: []}}),
        });

        const result = await resolveBrowseStartLocation({fetchImpl, currentValue: "./games", browseId: "create-project-destination"});

        expect(result).toBe("/games");
    });

    it("resolves a project-relative current value against relevantDirectory to its absolute path, not the original relative text", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/home/alice/projects/sample-slot/outcomes", displayPath: "./outcomes", entries: []},
            }),
        });

        const result = await resolveBrowseStartLocation({
            fetchImpl,
            currentValue: "./outcomes",
            relevantDirectory: "/home/alice/projects/sample-slot",
        });

        expect(result).toBe("/home/alice/projects/sample-slot/outcomes");
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Foutcomes&base=%2Fhome%2Falice%2Fprojects%2Fsample-slot")).toBe(true);
    });

    it("requests kind=file and returns the resolved file's own containing directory (parentPath), not the file path itself, for a file-kind field", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/home/alice/blueprints/sample.json", displayPath: "./sample.json", parentPath: "/home/alice/blueprints", entries: []},
            }),
        });

        const result = await resolveBrowseStartLocation({fetchImpl, currentValue: "./sample.json", kind: "file"});

        expect(result).toBe("/home/alice/blueprints");
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Fsample.json&kind=file")).toBe(true);
    });

    it("resolves a project-relative current file value's parentPath to its absolute containing directory, not the raw relative text", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/home/alice/projects/sample-slot/blueprints/sample.json",
                    displayPath: "./blueprints/sample.json",
                    parentPath: "/home/alice/projects/sample-slot/blueprints",
                    entries: [],
                },
            }),
        });

        const result = await resolveBrowseStartLocation({
            fetchImpl,
            currentValue: "./blueprints/sample.json",
            relevantDirectory: "/home/alice/projects/sample-slot",
            kind: "file",
        });

        expect(result).toBe("/home/alice/projects/sample-slot/blueprints");
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Fblueprints%2Fsample.json&base=%2Fhome%2Falice%2Fprojects%2Fsample-slot&kind=file")).toBe(true);
    });

    it("falls through to the relevant directory when the current value doesn't resolve", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "error", error: "nope", resolvedPath: "/nope"}}),
        });

        const result = await resolveBrowseStartLocation({
            fetchImpl,
            currentValue: "not-a-real-path",
            relevantDirectory: "/home/alice/projects/sample-slot",
        });

        expect(result).toBe("/home/alice/projects/sample-slot");
    });

    it("falls through to the remembered location for this browseId when there's no relevant directory", async () => {
        jest.spyOn(rememberedBrowseLocation, "getRememberedBrowseLocation").mockReturnValue("/home/alice/games");
        const {fetchImpl} = createRoutedFakeFetch({});

        const result = await resolveBrowseStartLocation({fetchImpl, currentValue: "", browseId: "create-project-destination"});

        expect(result).toBe("/home/alice/games");
        expect(rememberedBrowseLocation.getRememberedBrowseLocation).toHaveBeenCalledWith("create-project-destination");
    });

    it("falls through to the platform Documents/Home default as a last resort, forwarding defaultLocationName", async () => {
        jest.spyOn(rememberedBrowseLocation, "getRememberedBrowseLocation").mockReturnValue(undefined);
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "valid", directory: "/home/alice/Documents/POKIE/sample-slot", source: "documents"}}),
        });

        const result = await resolveBrowseStartLocation({
            fetchImpl,
            currentValue: "",
            browseId: "create-project-destination",
            defaultLocationName: "sample-slot",
        });

        expect(result).toBe("/home/alice/Documents/POKIE/sample-slot");
        expect(calls.some((call) => call.url === "/api/home/fs/default-location?name=sample-slot")).toBe(true);
    });

    it("returns undefined when every rung comes up empty", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
        });

        const result = await resolveBrowseStartLocation({fetchImpl, currentValue: ""});

        expect(result).toBeUndefined();
    });

    it("never calls /api/home/fs/browse for an empty current value", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
        });

        await resolveBrowseStartLocation({fetchImpl, currentValue: "   "});

        expect(calls.some((call) => call.url.startsWith("/api/home/fs/browse"))).toBe(false);
    });
});
