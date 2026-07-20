import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioStakeEngineExportView} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
}

function okValidateView(overrides: {errors?: unknown[]; warnings?: unknown[]} = {}) {
    return {
        status: "ok",
        modes: [{modeName: "base", cost: 1, outcomeCount: 100, libraryId: "lib-base", libraryHash: "sha256:lib-base"}],
        errors: [],
        warnings: [],
        ...overrides,
    };
}

function okExportView(overrides: Partial<StudioStakeEngineExportView & {status: "ok"}> = {}): StudioStakeEngineExportView {
    return {
        status: "ok",
        outDir: "/games/a/stakeengine",
        files: ["lookup_base.csv", "books_base.jsonl.zst", "index.json", "pokie-manifest.json"],
        manifest: {
            schemaVersion: 1,
            generatedBy: "pokie stakeengine export",
            pokieVersion: "1.3.0",
            generatedAt: "2026-07-20T00:00:00.000Z",
            game: GAME,
            modes: [
                {
                    name: "base",
                    betMode: "base",
                    stake: 1,
                    cost: 1,
                    outcomeCount: 100,
                    libraryId: "lib-base",
                    libraryHash: "sha256:lib-base",
                    events: "books_base.jsonl.zst",
                    weights: "lookup_base.csv",
                },
            ],
            files: ["lookup_base.csv", "books_base.jsonl.zst", "index.json", "pokie-manifest.json"],
        },
        warnings: [],
        ...overrides,
    };
}

async function goToStakeEngineExportTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Stake Engine Export"}));
    await screen.findByLabelText("Output directory");
}

async function fillConfigureStep(user: ReturnType<typeof userEvent.setup>, libraryPath: string): Promise<void> {
    await user.type(screen.getByLabelText("Mode name"), "base");
    await user.type(screen.getByLabelText("Outcome library path"), libraryPath);
    await user.click(screen.getByRole("button", {name: "Continue to Preview"}));
}

describe("ProjectDashboardPage - Stake Engine Export workflow", () => {
    it("runs the full Configure -> Preview -> Validate diagnostics -> Export -> Review result workflow", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/stakeengine/validate": () => ({ok: true, status: 200, body: okValidateView()}),
            "/api/project/stakeengine/export": () => ({ok: true, status: 201, body: okExportView()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToStakeEngineExportTab(user);
        await fillConfigureStep(user, "./outcomes/base.json");

        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        expect(await screen.findByText("Clean")).toBeInTheDocument();
        expect(screen.getByText("sha256:lib-base")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Export"}));
        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        expect(await screen.findByText("Clean")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Review result"}));
        expect(await screen.findByRole("button", {name: "Download manifest.json"})).toBeInTheDocument();
        expect(screen.getByText("/games/a/stakeengine")).toBeInTheDocument();
        expect(screen.getByText("index.json")).toBeInTheDocument();
    });

    it("shows a clear invalid state for an unsupported cost/outcome combination and never offers Continue to Export", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/stakeengine/validate": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    modes: [],
                    errors: [
                        {
                            code: "stakeengine-outcome-payout-multiplier-not-representable",
                            severity: "error",
                            message: 'mode "base": outcome "1"\'s payoutMultiplier is not representable in Stake units.',
                        },
                    ],
                    warnings: [],
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToStakeEngineExportTab(user);
        await fillConfigureStep(user, "./outcomes/base.json");

        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));

        expect(await screen.findByText("Failed")).toBeInTheDocument();
        expect(screen.getByText(/not representable in Stake units/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Export"})).not.toBeInTheDocument();
    });

    it("returns a conflict for a pre-existing outDir and succeeds once the user chooses Overwrite", async () => {
        const user = userEvent.setup();
        let exportCallCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/stakeengine/validate": () => ({ok: true, status: 200, body: okValidateView()}),
            "/api/project/stakeengine/export": (call) => {
                exportCallCount += 1;
                const body = JSON.parse(call.init?.body ?? "{}") as {overwrite?: boolean};
                if (exportCallCount === 1) {
                    expect(body.overwrite).toBeFalsy();
                    return {
                        ok: false,
                        status: 409,
                        body: {status: "conflict", outDir: "/games/a/stakeengine", error: '"stakeengine" already exists and is not empty.'},
                    };
                }
                expect(body.overwrite).toBe(true);
                return {ok: true, status: 201, body: okExportView()};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToStakeEngineExportTab(user);
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Export"}));

        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        expect(await screen.findByText('"stakeengine" already exists and is not empty.')).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Review result"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Overwrite"}));
        expect(await screen.findByRole("button", {name: "Continue to Review result"})).toBeInTheDocument();
        expect(exportCallCount).toBe(2);
    });

    it("ignores a late export response once a newer one has already landed", async () => {
        const user = userEvent.setup();
        let resolveFirst: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let callCount = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url in BASE_ROUTES) {
                const routed = BASE_ROUTES[url]({url, init});
                return jsonResponse(routed.body, routed.status);
            }
            if (url === "/api/project/stakeengine/validate") {
                return jsonResponse(okValidateView());
            }
            if (url === "/api/project/stakeengine/export") {
                callCount += 1;
                if (callCount === 1) {
                    return new Promise((res) => {
                        resolveFirst = res;
                    });
                }
                return jsonResponse({
                    status: "invalid",
                    errors: [{code: "second-response-error", severity: "error", message: "The second, faster response."}],
                    warnings: [],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToStakeEngineExportTab(user);
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Export"}));

        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        // Changing the output directory while the first export is still in flight invalidates it and frees
        // the guard right away, so a new Export click doesn't have to wait for the stale request.
        await user.click(screen.getByRole("button", {name: /Source, modes & output/i}));
        await user.type(screen.getByLabelText("Output directory"), "-changed");
        await user.click(screen.getByRole("button", {name: /Write to disk/i}));
        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));

        expect(await screen.findByText(/The second, faster response\./)).toBeInTheDocument();

        resolveFirst?.(await jsonResponse(okExportView()));
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 50);
        });

        // The stale first response (a clean export) must never have overwritten the second, error one.
        expect(screen.getByText(/The second, faster response\./)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Review result"})).not.toBeInTheDocument();
    });

    it("does not send a second validate request while the first is still in flight (double-submit guard)", async () => {
        const user = userEvent.setup();
        let resolveRequest: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const {fetchImpl, calls} = (() => {
            const callList: FakeCall[] = [];
            const impl: FetchLike = (url, init) => {
                callList.push({url, init});
                if (url in BASE_ROUTES) {
                    const routed = BASE_ROUTES[url]({url, init});
                    return jsonResponse(routed.body, routed.status);
                }
                if (url === "/api/project/stakeengine/validate") {
                    return new Promise((res) => {
                        resolveRequest = res;
                    });
                }
                return Promise.reject(new Error(`unexpected fetch ${url}`));
            };
            return {fetchImpl: impl, calls: callList};
        })();

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToStakeEngineExportTab(user);
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));

        const validateButton = screen.getByRole("button", {name: "Run diagnostics"});
        await user.click(validateButton);
        await user.click(validateButton);
        await user.click(validateButton);

        expect(calls.filter((call) => call.url === "/api/project/stakeengine/validate")).toHaveLength(1);

        resolveRequest?.(await jsonResponse(okValidateView()));
    });

    it("clears all Stake Engine Export state when the project switches", async () => {
        const user = userEvent.setup();
        const {fetchImpl: fetchImplA} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/stakeengine/validate": () => ({ok: true, status: 200, body: okValidateView()}),
        });

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToStakeEngineExportTab(user);
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        expect(await screen.findByText("Clean")).toBeInTheDocument();

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Stake Engine Export"}));

        expect(await screen.findByLabelText("Mode name")).toHaveValue("");
        expect(screen.queryByText("Clean")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Validate diagnostics"})).not.toBeInTheDocument();
    });
});
