import {act, screen, waitFor} from "@testing-library/react";
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
            updateFiles: ["package.json"],
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

    it("confirms before building into a destination a fresh Build Preview reported as already having content", async () => {
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

        expect(await screen.findByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);
        });
    });

    it("confirms before building into a known non-empty destination even when Build Preview was never run", async () => {
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

        expect(await screen.findByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);
        expect(previewCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);
        });
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

        expect(await screen.findByText("The output directory could not be completed. Try again, and check the Studio server logs if the problem persists.")).toBeInTheDocument();
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
                // confirmation the new blueprint's own non-empty destination actually requires.
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

        expect(await screen.findByText('"/games/other-out" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);
        expect(previewCalls).toEqual([
            {blueprint, outDir: undefined, sourcePath: undefined},
            {blueprint: otherBlueprint, outDir: undefined, sourcePath: undefined},
        ]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint: otherBlueprint, outDir: undefined, sourcePath: undefined}]);
        });
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
        expect(await screen.findByText('"/games/other-out" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
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
        expect(await screen.findByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();

        // The first (Build Preview's own) request settles late, reporting the opposite answer -- being the
        // older of the two, it must never overwrite the confirmation or preview the newer one already set up.
        respondTo[0](previewOkBody({projectRoot: "/games/sample-slot", destinationHasContent: false}));
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        });
        expect(screen.getByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));
        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);
        });
    });
});
