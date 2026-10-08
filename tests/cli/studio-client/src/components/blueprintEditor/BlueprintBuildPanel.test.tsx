import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {BlueprintBuildPanel} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintBuildPanel";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("BlueprintBuildPanel", () => {
    const blueprint = {manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}};
    const otherBlueprint = {manifest: {id: "other-slot", name: "Other Slot", version: "0.2.0"}};

    // Models editing the blueprint in place in the Blueprint Editor -- the same BlueprintBuildPanel
    // instance keeps running (no remount/key change), only its `blueprint` prop changes, exactly like
    // BlueprintEditorPage updating its draft.
    function BlueprintSwapHarness() {
        const [current, setCurrent] = useState<Record<string, unknown>>(blueprint);
        return (
            <>
                <button onClick={() => setCurrent(otherBlueprint)}>Swap blueprint</button>
                <BlueprintBuildPanel blueprint={current} />
            </>
        );
    }

    function previewOkBody(overrides: Record<string, unknown> = {}) {
        return {
            status: "ok",
            warnings: [],
            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbolsCount: 2,
            blueprintHash: "sha256:abc",
            expectedFiles: ["package.json"],
            projectRoot: "/games/sample-slot",
            destinationHasContent: true,
            createFiles: [],
            updateFiles: [],
            deleteFiles: [],
            ...overrides,
        };
    }

    function buildOkBody(overrides: Record<string, unknown> = {}) {
        return {
            status: "ok",
            projectRoot: "/games/sample-slot",
            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            warnings: [],
            createdFiles: ["package.json"],
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.0.0",
                generatedAt: "2026-01-01T00:00:00.000Z",
                blueprintHash: "sha256:abc",
                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            },
            unchanged: false,
            ...overrides,
        };
    }

    it("does not publish if the editor becomes blocked during the destination preflight", async () => {
        let finishPreview: ((body: unknown) => void) | undefined;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": () => ({ok: true, status: 200, body: {}}),
        });
        function Harness() {
            const [blocked, setBlocked] = useState(false);
            return <>
                <button onClick={() => setBlocked(true)}>Invalidate design</button>
                <BlueprintBuildPanel blueprint={blueprint} blocked={blocked} />
            </>;
        }
        renderWithProviders(<Harness />, {fetchImpl: (url, init) => fetchImpl(url, init).then((response) => ({
            ...response, json: () => new Promise((resolve) => {
                finishPreview = resolve;
            }),
        }))});
        fireEvent.click(screen.getByRole("button", {name: "Build Package"}));
        await waitFor(() => expect(finishPreview).toBeDefined());
        fireEvent.click(screen.getByRole("button", {name: "Invalidate design"}));
        await act(() => finishPreview?.(previewOkBody({destinationHasContent: false})));
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(0);
    });

    it("keeps absent-path hints consistent through default refusal and explicit new-output publication", async () => {
        const user = userEvent.setup();
        let published = false;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": (call) => {
                const selected = new URL(call.url, "http://studio").searchParams.get("path");
                return {ok: true, status: 200, body: {status: "error", reason: "absent", resolvedPath: `/games/${selected}`, error: "ENOENT"}};
            },
            "/api/home/blueprints/build-preview": (call) => {
                const {outDir} = JSON.parse(call.init?.body ?? "{}");
                return {ok: true, status: 200, body: previewOkBody({projectRoot: `/games/${outDir ?? "sample-slot"}`, destinationHasContent: published, destinationState: published ? "occupied" : "missing"})};
            },
            "/api/home/blueprints/build": (call) => {
                published = true;
                const {outDir} = JSON.parse(call.init?.body ?? "{}");
                return {ok: true, status: 200, body: buildOkBody({projectRoot: `/games/${outDir ?? "sample-slot"}`})};
            },
        });
        function Harness() {
            const [snapshot, setSnapshot] = useState<import("../../../../../../cli/studio-client/src/domain/interpret/Home").BuiltBlueprintSnapshot>();
            return <BlueprintBuildPanel blueprint={blueprint} builtSnapshot={snapshot} onBuilt={setSnapshot} />;
        }
        renderWithProviders(<Harness />, {fetchImpl});
        const input = screen.getByRole("textbox", {name: "Output directory (optional)"});
        await user.click(input);
        expect(await screen.findByText("Auto resolved destination: /games/sample-slot")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        expect(await screen.findByText(/Destination:.*new directory/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(await screen.findByText(/Last built/)).toHaveTextContent("/games/sample-slot");
        expect(screen.queryByText(/doesn't exist|pick an existing location/)).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(await screen.findByText(/already has content/)).toBeInTheDocument();
        expect(screen.getByText(/Last built/)).toHaveTextContent("/games/sample-slot");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(1);
        fireEvent.change(input, {target: {value: "new-output"}});
        published = false;
        expect(await screen.findByText("Resolves to: /games/new-output")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        expect(await screen.findByText(/Destination: \/games\/new-output.*new directory/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await waitFor(() => expect(screen.getByText(/Last built/)).toHaveTextContent("/games/new-output"));
        expect(screen.queryByText(/doesn't exist|pick an existing location/)).not.toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(2);
    });

    it("refuses a fresh occupied preview and offers editable destination recovery", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": () => ({ok: true, status: 200, body: previewOkBody()}),
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody()};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        expect(await screen.findByText(/Destination: \/games\/sample-slot/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Build Package"}));

        expect(await screen.findByText('"/games/sample-slot" already has content. Choose a new or empty output directory using the editable path or Browse, then retry. Existing files will stay unchanged.')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);

        expect(screen.queryByRole("button", {name: "Confirm"})).not.toBeInTheDocument();
        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toBeEnabled();
    });

    it("checks and refuses an occupied destination even without a prior preview", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const previewCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": (call) => {
                previewCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: previewOkBody()};
            },
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody()};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Package"}));

        expect(await screen.findByText('"/games/sample-slot" already has content. Choose a new or empty output directory using the editable path or Browse, then retry. Existing files will stay unchanged.')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);
        expect(previewCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);

        expect(screen.queryByRole("button", {name: "Confirm"})).not.toBeInTheDocument();
        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toBeEnabled();
    });

    it("does not build, and shows an error instead, when the destination check fails and Build Preview was never run", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": () => ({ok: false, status: 500, body: {error: "network down"}}),
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody()};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Package"}));

        expect(await screen.findByText("The output directory could not be completed. Try again. If it continues, choose the location again and retry.")).toBeInTheDocument();
        expect(buildCalls).toEqual([]);
    });

    it("builds directly, with no confirmation, when Build Preview was never run and the destination turns out empty", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": () => ({
                ok: true,
                status: 200,
                body: previewOkBody({destinationHasContent: false, createFiles: ["package.json"], updateFiles: []}),
            }),
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody()};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Package"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);
        });
        expect(screen.queryByText(/already has content/)).not.toBeInTheDocument();
    });

    it("never trusts a stale preview after the outDir was edited -- it re-checks the new destination fresh instead", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const previewCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": (call) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {outDir?: string};
                previewCalls.push(body);
                // The default destination (first Build Preview click) has content; the edited-to
                // destination does not -- if the stale first preview were wrongly reused, this build would
                // still report the default destination has content.
                return {ok: true, status: 200, body: previewOkBody({projectRoot: body.outDir ?? "/games/sample-slot", destinationHasContent: body.outDir === undefined})};
            },
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody({projectRoot: "/games/other"})};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        await screen.findByText(/Destination: \/games\/sample-slot/);

        await user.type(screen.getByRole("textbox", {name: "Output directory (optional)"}), "/games/other");
        await user.click(screen.getByRole("button", {name: "Build Package"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: "/games/other", sourcePath: undefined}]);
        });
        expect(screen.queryByText(/already has content/)).not.toBeInTheDocument();
        expect(previewCalls).toEqual([
            {blueprint, outDir: undefined, sourcePath: undefined},
            {blueprint, outDir: "/games/other", sourcePath: undefined},
        ]);
    });

    it("never reuses a prior blueprint's Build Preview to authorize a Build after the blueprint changed, even with the default output", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const previewCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": (call) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {blueprint: {manifest: {id: string}}};
                previewCalls.push(body);
                // Only the original blueprint's destination is empty; if Build wrongly reused that
                // preview after the blueprint changed (same default outDir), it would skip the
                // conflict recovery the new blueprint's occupied destination requires.
                const isSample = body.blueprint.manifest.id === "sample-slot";
                return {
                    ok: true,
                    status: 200,
                    body: previewOkBody({
                        projectRoot: isSample ? "/games/sample-out" : "/games/other-out",
                        destinationHasContent: !isSample,
                    }),
                };
            },
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody({projectRoot: "/games/other-out"})};
            },
        });

        renderWithProviders(<BlueprintSwapHarness />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        await screen.findByText(/Destination: \/games\/sample-out/);

        await user.click(screen.getByRole("button", {name: "Swap blueprint"}));
        await user.click(screen.getByRole("button", {name: "Build Package"}));

        expect(await screen.findByText('"/games/other-out" already has content. Choose a new or empty output directory using the editable path or Browse, then retry. Existing files will stay unchanged.')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);
        expect(previewCalls).toEqual([
            {blueprint, outDir: undefined, sourcePath: undefined},
            {blueprint: otherBlueprint, outDir: undefined, sourcePath: undefined},
        ]);

        expect(screen.queryByRole("button", {name: "Confirm"})).not.toBeInTheDocument();
        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toBeEnabled();
    });

    it("never lets an out-of-order Build Preview response for an abandoned blueprint overwrite the result of a newer, still-current one", async () => {
        const user = userEvent.setup();
        const respondTo: Array<{blueprintId: string; respond: (body: unknown) => void}> = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url !== "/api/home/blueprints/build-preview") {
                throw new Error(`unexpected fetch to ${url}`);
            }
            const body = JSON.parse(init?.body ?? "{}") as {blueprint: {manifest: {id: string}}};
            return new Promise((resolve) => {
                respondTo.push({
                    blueprintId: body.blueprint.manifest.id,
                    respond: (respBody) => resolve({ok: true, status: 200, json: () => Promise.resolve(respBody)}),
                });
            });
        };

        renderWithProviders(<BlueprintSwapHarness />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Preview"}));

        await user.click(screen.getByRole("button", {name: "Swap blueprint"}));
        // Build Package's own preview guard is independent from Build Preview's -- this issues a second,
        // concurrent destination check rather than waiting on the first one to settle.
        await user.click(screen.getByRole("button", {name: "Build Package"}));

        await waitFor(() => expect(respondTo).toHaveLength(2));
        expect(respondTo[0].blueprintId).toBe("sample-slot");
        expect(respondTo[1].blueprintId).toBe("other-slot");

        // The newer ("other-slot") request settles first, then the stale ("sample-slot") request settles
        // late -- the stale response must not overwrite the result the newer request already produced.
        respondTo[1].respond(previewOkBody({projectRoot: "/games/other-out", destinationHasContent: true}));
        expect(await screen.findByText('"/games/other-out" already has content. Choose a new or empty output directory using the editable path or Browse, then retry. Existing files will stay unchanged.')).toBeInTheDocument();
        expect(await screen.findByText(/Destination: \/games\/other-out/)).toBeInTheDocument();

        respondTo[0].respond(previewOkBody({projectRoot: "/games/sample-out", destinationHasContent: false}));
        // Flush the stale response's own promise chain (fetch -> .json() -> .then) so a regression --
        // it overwriting the preview -- would already have happened by the time we assert below.
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        });

        expect(screen.getByText(/Destination: \/games\/other-out/)).toBeInTheDocument();
        expect(screen.queryByText(/sample-out/)).not.toBeInTheDocument();
    });

    it("never opens confirmation or authorizes a build from Build Package's own fallback check once outDir changed while it was still pending", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const respondTo: Array<(body: unknown) => void> = [];
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/home/blueprints/build") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(buildOkBody())});
            }
            if (url !== "/api/home/blueprints/build-preview") {
                throw new Error(`unexpected fetch to ${url}`);
            }
            return new Promise((resolve) => {
                respondTo.push((body) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)}));
            });
        };

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await waitFor(() => expect(respondTo).toHaveLength(1));

        // No new Build Preview/Build Package click happens here -- only the outDir field changes, so the
        // fallback check's own `seq` never advances. isFreshResponse's own current-identity comparison
        // (via currentIdentityRef) must be what catches this.
        await user.type(screen.getByRole("textbox", {name: "Output directory (optional)"}), "/games/other");

        respondTo[0](previewOkBody({projectRoot: "/games/sample-slot", destinationHasContent: true}));
        // Flush the stale response's own promise chain so a regression -- it opening confirmation or
        // rendering its own (now-obsolete) destination -- would already have happened by the time we assert.
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        });

        expect(screen.queryByText(/already has content/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Destination:/)).not.toBeInTheDocument();
        expect(buildCalls).toEqual([]);
    });

    it("lets only the newer of two concurrent checks for the exact same request identity authorize the eventual build", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const respondTo: Array<(body: unknown) => void> = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/home/blueprints/build") {
                buildCalls.push(JSON.parse(init?.body ?? "{}"));
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(buildOkBody())});
            }
            if (url !== "/api/home/blueprints/build-preview") {
                throw new Error(`unexpected fetch to ${url}`);
            }
            return new Promise((resolve) => {
                respondTo.push((body) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)}));
            });
        };

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        // Build Preview's own guard is independent from Build Package's -- clicking both, with nothing
        // changed in between, issues two concurrent destination checks sharing the exact same identity.
        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await waitFor(() => expect(respondTo).toHaveLength(2));

        // The second (Build Package's own) request is the one issued last -- it settles first with "has
        // content", which must be what confirmation and the eventual build go by.
        respondTo[1](previewOkBody({projectRoot: "/games/sample-slot", destinationHasContent: true}));
        expect(await screen.findByText('"/games/sample-slot" already has content. Choose a new or empty output directory using the editable path or Browse, then retry. Existing files will stay unchanged.')).toBeInTheDocument();

        // The first (Build Preview's own) request settles late, reporting the opposite answer -- being the
        // older of the two, it must never overwrite the confirmation or preview the newer one already set up.
        respondTo[0](previewOkBody({projectRoot: "/games/sample-slot", destinationHasContent: false}));
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        });
        expect(screen.getByText('"/games/sample-slot" already has content. Choose a new or empty output directory using the editable path or Browse, then retry. Existing files will stay unchanged.')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);

        expect(screen.queryByRole("button", {name: "Confirm"})).not.toBeInTheDocument();
        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toBeEnabled();
    });

    it.each(["invalid", "load-error"])("does not start a build after a %s preview response", async (status) => {
        const user = userEvent.setup();
        const diagnostic = "Repair the source model before building.";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": () => ({ok: true, status: 200, body: status === "invalid"
                ? {status, warnings: [], errors: [{code: "invalid", message: diagnostic, severity: "error"}]}
                : {status, error: diagnostic}}),
            "/api/home/blueprints/build": () => ({ok: true, status: 200, body: buildOkBody()}),
        });
        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        if (status === "invalid") expect(await screen.findByText(/Repair the source model/)).toBeInTheDocument();
        else expect(await screen.findByText(/The output directory could not be completed/)).toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(0);
    });

    it.each(["", "/games/explicit"])("rechecks a successful destination (%s), retains provenance on conflict, and publishes recovery to the actual path", async (initialOutDir) => {
        const user = userEvent.setup();
        const published = new Set<string>();
        const built: string[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": (call) => {
                const {outDir} = JSON.parse(call.init?.body ?? "{}") as {outDir?: string};
                const destination = outDir ?? "/games/sample-slot";
                return {ok: true, status: 200, body: previewOkBody({projectRoot: destination, destinationHasContent: published.has(destination), destinationState: published.has(destination) ? "occupied" : "empty"})};
            },
            "/api/home/blueprints/build": (call) => {
                const {outDir} = JSON.parse(call.init?.body ?? "{}") as {outDir?: string};
                const destination = outDir ?? "/games/sample-slot";
                published.add(destination);
                built.push(destination);
                return {ok: true, status: 200, body: buildOkBody({projectRoot: destination})};
            },
        });
        function Harness() {
            const [snapshot, setSnapshot] = useState<import("../../../../../../cli/studio-client/src/domain/interpret/Home").BuiltBlueprintSnapshot>();
            return <BlueprintBuildPanel blueprint={blueprint} initialOutDir={initialOutDir} builtSnapshot={snapshot} onBuilt={setSnapshot} />;
        }
        renderWithProviders(<Harness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(await screen.findByText(/Last built/)).toHaveTextContent(initialOutDir || "/games/sample-slot");
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(await screen.findByText(/Choose a new or empty output directory/)).toBeInTheDocument();
        expect(built).toEqual([initialOutDir || "/games/sample-slot"]);
        expect(screen.getByText(/Last built/)).toHaveTextContent(initialOutDir || "/games/sample-slot");
        const field = screen.getByRole("textbox", {name: "Output directory (optional)"});
        await user.clear(field);
        await user.type(field, "/games/recovered");
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await waitFor(() => expect(screen.getByText(/Last built/)).toHaveTextContent("/games/recovered"));
        expect(built).toEqual([initialOutDir || "/games/sample-slot", "/games/recovered"]);
        expect(published.has(initialOutDir || "/games/sample-slot")).toBe(true);
        expect(screen.queryByRole("button", {name: "Confirm"})).not.toBeInTheDocument();
    });

    it.each([
        '"/games/retained" already exists and is not empty. Choose a different output directory.',
        "Artifact build was cancelled.",
        "Injected publication failure.",
    ])("retains prior provenance, dirty source and Home recovery destination after: %s", async (failure) => {
        const user = userEvent.setup();
        const prior = {...buildOkBody(), blueprint} as import("../../../../../../cli/studio-client/src/domain/interpret/Home").BuiltBlueprintSnapshot;
        const onBuilt = jest.fn();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": (call) => {
                expect(JSON.parse(call.init?.body ?? "{}")).toMatchObject({outDir: "/games/retained"});
                return {ok: true, status: 200, body: previewOkBody({destinationHasContent: false, projectRoot: "/games/retained", destinationState: "empty"})};
            },
            "/api/home/blueprints/build": () => ({ok: true, status: 200, body: {status: "error", error: failure}}),
        });
        renderWithProviders(<BlueprintBuildPanel blueprint={otherBlueprint} builtSnapshot={prior} initialOutDir="/games/retained" onBuilt={onBuilt} />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(await screen.findByText(failure === "Injected publication failure."
            ? /The output directory could not be completed/ : failure)).toBeInTheDocument();
        expect(screen.getByText(/Last built/)).toHaveTextContent("/games/sample-slot");
        expect(screen.getByText(/Unbuilt changes/)).toBeInTheDocument();
        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toHaveValue("/games/retained");
        expect(onBuilt).not.toHaveBeenCalled();
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(1);
    });

    it("refuses an occupied default destination after a matching built snapshot is restored", async () => {
        const user = userEvent.setup();
        const prior = {...buildOkBody(), blueprint} as import("../../../../../../cli/studio-client/src/domain/interpret/Home").BuiltBlueprintSnapshot;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": () => ({ok: true, status: 200, body: previewOkBody()}),
            "/api/home/blueprints/build": () => ({ok: true, status: 200, body: buildOkBody()}),
        });
        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} builtSnapshot={prior} />, {fetchImpl});
        expect(screen.getByText(/Matches the last build/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(await screen.findByText(/Choose a new or empty output directory/)).toBeInTheDocument();
        expect(screen.getByText(/Last built/)).toHaveTextContent("/games/sample-slot");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(0);
        expect(screen.queryByRole("button", {name: "Confirm"})).not.toBeInTheDocument();
    });

    it("uses the host picker destination for the next current preview and build", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "valid", directory: "/games", source: "home"}}),
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", entries: []}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "selected", path: "/games/picked-empty"}}),
            "/api/home/blueprints/build-preview": () => ({ok: true, status: 200, body: previewOkBody({destinationHasContent: false, destinationState: "empty", projectRoot: "/games/picked-empty"})}),
            "/api/home/blueprints/build": () => ({ok: true, status: 200, body: buildOkBody({projectRoot: "/games/picked-empty"})}),
        });
        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Browse…"}));
        await waitFor(() => expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toHaveValue("/games/picked-empty"));
        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        expect(await screen.findByText(/Destination:.*existing empty directory/)).toBeInTheDocument();
        expect(screen.queryByText(/does not exist yet/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(1));
        for (const call of calls.filter((call) => call.url.startsWith("/api/home/blueprints/"))) {
            expect(JSON.parse(call.init?.body ?? "{}")).toMatchObject({outDir: "/games/picked-empty"});
        }
    });

    it("discards a pending preview after sourcePath changes without replacing current recovery", async () => {
        const user = userEvent.setup();
        let finish!: (body: unknown) => void;
        const builds: unknown[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/home/blueprints/build") {
                builds.push(init);
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(buildOkBody())});
            }
            return new Promise((resolve) => {
                finish = (body) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)}); 
            });
        };
        function SourceHarness() {
            const [source, setSource] = useState("/games/first.blueprint.json");
            return <><button onClick={() => setSource("/games/second.blueprint.json")}>Change source</button><BlueprintBuildPanel blueprint={blueprint} sourcePath={source} /></>;
        }
        renderWithProviders(<SourceHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await user.click(screen.getByRole("button", {name: "Change source"}));
        await act(() => {
            finish(previewOkBody({destinationHasContent: false})); 
        });
        expect(builds).toEqual([]);
        expect(screen.queryByText(/Destination:/)).not.toBeInTheDocument();
    });

    it("coalesces duplicate Build clicks while the preview is pending", async () => {
        const user = userEvent.setup();
        let finish!: (body: unknown) => void;
        let previews = 0;
        let builds = 0;
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/home/blueprints/build-preview") {
                previews++;
                return new Promise((resolve) => {
                    finish = (body) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)}); 
                });
            }
            if (url === "/api/home/blueprints/build") {
                builds++;
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(buildOkBody())});
            }
            throw new Error(`unexpected fetch ${url}`);
        };
        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});
        await user.dblClick(screen.getByRole("button", {name: "Build Package"}));
        expect(previews).toBe(1);
        finish(previewOkBody({destinationHasContent: false}));
        await waitFor(() => expect(builds).toBe(1));
    });
});
