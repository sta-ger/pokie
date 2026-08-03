import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioStakeEngineExportView} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
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

async function goToStakeEngineExportTab(): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await screen.findByLabelText("Output directory");
}

async function fillConfigureStep(user: ReturnType<typeof userEvent.setup>, libraryPath: string): Promise<void> {
    await user.type(screen.getByLabelText("Mode name"), "base");
    await user.type(screen.getByLabelText("Source: canonical outcome library"), libraryPath);
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

        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
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

    it("marks a completed Export (not Validate) as Outdated when only the output directory changes, and marks Validate Outdated instead when a mode changes", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/stakeengine/validate": () => ({ok: true, status: 200, body: okValidateView()}),
            "/api/project/stakeengine/export": () => ({ok: true, status: 201, body: okExportView()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Export"}));
        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        await screen.findByText("Clean");

        // Editing the output directory (not a mode) invalidates only Export -- Validate's own result is
        // untouched, so only the Export-specific Outdated message should render.
        await user.click(screen.getByRole("button", {name: /Source, modes & output/i}));
        await user.type(screen.getByLabelText("Output directory"), "-changed");

        expect(
            await screen.findByText(
                /Outdated -- the modes or output directory changed since the last Export run\. Its result no longer reflects what's configured here; rerun Export to Stake Engine before Review result is offered again\./,
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Outdated -- the modes changed since the last Validate run/)).not.toBeInTheDocument();

        // Re-running Export clears the notice.
        await user.click(screen.getByRole("button", {name: /Write to disk/i}));
        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: /Source, modes & output/i}));
        expect(screen.queryByText(/Outdated -- the modes or output directory changed/)).not.toBeInTheDocument();

        // Editing a mode instead invalidates both Validate and Export -- only the broader Validate-specific
        // Outdated message should render, not a duplicate Export-specific one.
        await user.type(screen.getByLabelText("Source: canonical outcome library"), "-changed");
        expect(
            await screen.findByText(
                /Outdated -- the modes changed since the last Validate run\. Its result no longer reflects what's configured here; rerun Validate before Export is offered again\./,
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Outdated -- the modes or output directory changed since the last Export run/)).not.toBeInTheDocument();
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

        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
        await fillConfigureStep(user, "./outcomes/base.json");

        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));

        expect(await screen.findByText("Failed")).toBeInTheDocument();
        expect(screen.getByText(/not representable in Stake units/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Export"})).not.toBeInTheDocument();
    });

    it("offers the Outcome Libraries hub recovery action for an Invalid source, and it navigates to that tab", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/stakeengine/validate": () => ({
                ok: true,
                status: 200,
                body: {status: "load-error", error: 'mode "base": library is corrupted and unreadable.'},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
        await fillConfigureStep(user, "./outcomes/base.json");

        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        expect(await screen.findByText(/could not be completed/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: /Source, modes & output/i}));
        expect(await screen.findByText("Invalid")).toBeInTheDocument();
        const recoveryButton = screen.getByRole("button", {name: "Generate or pick from the Outcome Libraries hub"});

        await user.click(recoveryButton);
        expect(await screen.findByRole("button", {name: /Generate.*From the current build/})).toBeInTheDocument();
    });

    it("returns an overwritable conflict for a directory recognized as a prior export, and succeeds once the user chooses Overwrite", async () => {
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
                        body: {
                            status: "conflict",
                            outDir: "/games/a/stakeengine",
                            overwritable: true,
                            error: '"stakeengine" already exists and is not empty. Resubmit with "overwrite": true to replace it.',
                        },
                    };
                }
                expect(body.overwrite).toBe(true);
                return {ok: true, status: 201, body: okExportView()};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Export"}));

        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        expect(await screen.findByText(/already exists and is not empty\. Resubmit/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Review result"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Overwrite"}));
        expect(await screen.findByRole("button", {name: "Continue to Review result"})).toBeInTheDocument();
        expect(exportCallCount).toBe(2);
    });

    it("never offers Overwrite for a conflict on a directory unrelated to any prior export", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/stakeengine/validate": () => ({ok: true, status: 200, body: okValidateView()}),
            "/api/project/stakeengine/export": () => ({
                ok: false,
                status: 409,
                body: {
                    status: "conflict",
                    outDir: "/games/a/stakeengine",
                    overwritable: false,
                    error: '"stakeengine" already exists and is not empty, and wasn\'t produced by a previous Stake Engine export.',
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Export"}));

        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        expect(await screen.findByText(/wasn't produced by a previous Stake Engine export/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Overwrite"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Review result"})).not.toBeInTheDocument();

        expect(calls.filter((call) => call.url === "/api/project/stakeengine/export")).toHaveLength(1);
    });

    it("blocks a second Export until the first genuinely settles, even after Configure invalidates its stale result", async () => {
        const user = userEvent.setup();
        let resolveFirst: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let exportCallCount = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url in BASE_ROUTES) {
                const routed = BASE_ROUTES[url]({url, init});
                return jsonResponse(routed.body, routed.status);
            }
            if (url === "/api/project/stakeengine/validate") {
                return jsonResponse(okValidateView());
            }
            if (url === "/api/project/stakeengine/export") {
                exportCallCount += 1;
                if (exportCallCount === 1) {
                    return new Promise((res) => {
                        resolveFirst = res;
                    });
                }
                return jsonResponse(okExportView({outDir: "/games/a/stakeengine-b"}));
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Export"}));

        // Export A starts, still pending server-side (a real write in progress).
        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        expect(exportCallCount).toBe(1);

        // A Configure edit while A is still in flight invalidates the *displayed* result -- but A itself
        // is still genuinely running on the server, so a second Export (B) must not be allowed to start yet.
        await user.click(screen.getByRole("button", {name: /Source, modes & output/i}));
        await user.type(screen.getByLabelText("Output directory"), "-changed");
        await user.click(screen.getByRole("button", {name: /Write to disk/i}));

        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        expect(exportCallCount).toBe(1); // still just A -- B was blocked, not merely ignored once it landed.

        // A finally settles. Its own result is stale by now (Configure changed since it started) and must
        // never be displayed, but the write guard is released the instant it does.
        resolveFirst?.(await jsonResponse(okExportView({outDir: "/games/a/stakeengine-a"})));
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 50);
        });
        expect(screen.queryByText("/games/a/stakeengine-a")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Review result"})).not.toBeInTheDocument();

        // Now that A has settled, B can actually run, and its own (non-stale) result is what gets shown.
        await user.click(screen.getByRole("button", {name: "Export to Stake Engine"}));
        expect(await screen.findByRole("button", {name: "Continue to Review result"})).toBeInTheDocument();
        expect(exportCallCount).toBe(2);
        await user.click(screen.getByRole("button", {name: "Continue to Review result"}));
        expect(await screen.findByText("/games/a/stakeengine-b")).toBeInTheDocument();
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

        renderRoutedApp({fetchImpl, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
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

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/stakeEngineExport"]});
        await goToStakeEngineExportTab();
        await fillConfigureStep(user, "./outcomes/base.json");
        await user.click(screen.getByRole("button", {name: "Continue to Validate diagnostics"}));
        await user.click(screen.getByRole("button", {name: "Run diagnostics"}));
        expect(await screen.findByText("Clean")).toBeInTheDocument();

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/stakeEngineExport"]});
        await screen.findByRole("heading", {name: "B"});

        expect(await screen.findByLabelText("Mode name")).toHaveValue("");
        expect(screen.queryByText("Clean")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Validate diagnostics"})).not.toBeInTheDocument();
    });
});
