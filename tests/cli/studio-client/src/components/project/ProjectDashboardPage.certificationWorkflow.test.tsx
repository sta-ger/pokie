import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioCertificationBuildView, StudioCertificationSourceValidateView} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    // Certification's own source-bundle autodetection probes this on mount -- "absent" (no bundle at the
    // conventional "outcomes/bundle" location) keeps every scenario below exactly as it was before that
    // probe existed; the dedicated autodetection tests further down override it to "ok".
    "/api/home/fs/browse": () => ({
        ok: true,
        status: 200,
        body: {status: "error", error: "not found", resolvedPath: "/games/a/outcomes/bundle", reason: "absent"},
    }),
};

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
}

function okBuildView(overrides: Partial<StudioCertificationBuildView & {status: "ok"}> = {}): StudioCertificationBuildView {
    return {
        status: "ok",
        manifest: {
            schemaVersion: 1,
            generatedBy: "pokie certification build",
            pokieVersion: "1.3.0",
            generatedAt: "2026-07-20T00:00:00.000Z",
            game: GAME,
            artifactPokieVersion: "1.3.0",
            sourceBundleDir: "/games/a/bundle",
            sourceBundleManifestHash: "sha256:source-manifest",
            modes: [
                {
                    modeName: "base",
                    betMode: "base",
                    stake: 1,
                    libraryId: "lib-base",
                    libraryHash: "sha256:lib-base",
                    outcomeCount: 100,
                    totalWeight: 100,
                    analysis: {
                        totalWeight: 100,
                        rtp: 0.95,
                        hitFrequency: 0.24,
                        zeroWinFrequency: 0.76,
                        variance: 12,
                        standardDeviation: Math.sqrt(12),
                        maxWin: 500,
                        maxWinProbability: 0.001,
                        payoutDistribution: [],
                    },
                    sampleSeed: "cert-seed-1",
                    sampleCount: 5,
                    samplesFile: "samples_base.jsonl",
                    samplesHash: "sha256:samples-base",
                },
            ],
            deepValidation: {ranAt: "2026-07-20T00:00:00.000Z", issues: []},
            files: ["manifest.json", "samples_base.jsonl"],
            evidenceContentHash: "sha256:evidence-content",
        },
        files: ["manifest.json", "samples_base.jsonl"],
        warnings: [],
        ...overrides,
    };
}

async function goToCertificationTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Certification"}));
    await screen.findByLabelText("Source outcome-library bundle directory");
}

async function fillSelectStep(user: ReturnType<typeof userEvent.setup>, bundleDir: string): Promise<void> {
    await user.type(screen.getByLabelText("Source outcome-library bundle directory"), bundleDir);
    await user.type(screen.getByLabelText("Mode name"), "base");
    await user.type(screen.getByLabelText("Seed"), "cert-seed-1");
    await user.click(screen.getByRole("button", {name: "Continue to Validate"}));
}

describe("ProjectDashboardPage - Certification workflow", () => {
    it("runs the full Select -> Validate -> Build -> Inspect -> Export workflow", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/certification/validate-source": () => ({ok: true, status: 200, body: {status: "ok", errors: [], warnings: []}}),
            "/api/project/certification/build": () => ({ok: true, status: 200, body: okBuildView()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./bundle");

        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        expect(await screen.findByText("Clean")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Build bundle"}));
        await user.click(screen.getByRole("button", {name: "Build certification bundle"}));
        expect(await screen.findByText("Clean")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));
        expect(await screen.findByText(/Certification evidence for A v1\.0\.0/)).toBeInTheDocument();
        expect(screen.getByText("sha256:lib-base")).toBeInTheDocument();
        expect(screen.getByText("95.00%")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Export"}));
        expect(await screen.findByRole("button", {name: "Download manifest.json"})).toBeInTheDocument();
        expect(screen.getByText("certification")).toBeInTheDocument();
    });

    it("shows a clear invalid state for the source bundle and never offers Continue to Build bundle", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/certification/validate-source": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    errors: [{code: "outcome-library-bundle-index-missing", severity: "error", message: "The mode index is missing."}],
                    warnings: [],
                } as StudioCertificationSourceValidateView,
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./broken-bundle");

        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));

        expect(await screen.findByText("Failed")).toBeInTheDocument();
        expect(screen.getByText(/The mode index is missing\./)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Build bundle"})).not.toBeInTheDocument();
        // The disabled/absent Continue is never the only signal something's missing -- the step spells
        // out why, right where the button would otherwise be.
        expect(screen.getByText("The source bundle failed validation -- fix the errors above before continuing.")).toBeInTheDocument();
    });

    it("explains why Continue to Validate is blocked before a source bundle directory is entered", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);

        expect(screen.getByRole("button", {name: "Continue to Validate"})).toBeDisabled();
        expect(screen.getByText("Enter a source outcome-library bundle directory above.")).toBeInTheDocument();
    });

    it("autodetects a real source bundle and lets Use detected fill the field", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/games/a/outcomes/bundle", displayPath: "outcomes/bundle", entries: []},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);

        expect(await screen.findByText("Detected an outcome-library bundle at /games/a/outcomes/bundle.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Use detected"}));
        expect(screen.getByLabelText("Source outcome-library bundle directory")).toHaveValue("/games/a/outcomes/bundle");
    });

    it("persists Select/configure to this browser session across switching tabs away and back, and Clear saved values resets it", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "./bundle");
        await user.type(screen.getByLabelText("Mode name"), "base");
        await user.type(screen.getByLabelText("Seed"), "cert-seed-1");

        // Switching away and back fully unmounts/remounts CertificationTab (a plain conditional render,
        // not a hidden panel) -- session storage, not React state, is what keeps these fields around.
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await user.click(screen.getByRole("button", {name: "Certification"}));

        expect(await screen.findByLabelText("Source outcome-library bundle directory")).toHaveValue("./bundle");
        expect(screen.getByLabelText("Mode name")).toHaveValue("base");
        expect(screen.getByLabelText("Seed")).toHaveValue("cert-seed-1");

        await user.click(screen.getByRole("button", {name: "Clear saved values"}));
        expect(screen.getByLabelText("Source outcome-library bundle directory")).toHaveValue("");
        expect(screen.getByLabelText("Mode name")).toHaveValue("");

        await user.click(screen.getByRole("button", {name: "Overview"}));
        await user.click(screen.getByRole("button", {name: "Certification"}));
        expect(await screen.findByLabelText("Source outcome-library bundle directory")).toHaveValue("");
    });

    it("shows build failure diagnostics (errors, no manifest) when a requested mode isn't in the source bundle", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/certification/validate-source": () => ({ok: true, status: 200, body: {status: "ok", errors: [], warnings: []}}),
            "/api/project/certification/build": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "error",
                    errors: [{code: "certification-evidence-build-mode-not-found", severity: "error", message: 'Mode "base" was not found in bundle "bundle".'}],
                    warnings: [],
                } as StudioCertificationBuildView,
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./bundle");
        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Build bundle"}));

        await user.click(screen.getByRole("button", {name: "Build certification bundle"}));

        expect(await screen.findByText("Failed")).toBeInTheDocument();
        expect(screen.getByText(/was not found in bundle/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Inspect"})).not.toBeInTheDocument();
    });

    it("ignores a late build response once a newer one has already landed", async () => {
        const user = userEvent.setup();
        let resolveFirst: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let callCount = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url in BASE_ROUTES) {
                const routed = BASE_ROUTES[url]({url, init});
                return jsonResponse(routed.body, routed.status);
            }
            if (url === "/api/project/certification/validate-source") {
                return jsonResponse({status: "ok", errors: [], warnings: []});
            }
            if (url === "/api/project/certification/build") {
                callCount += 1;
                if (callCount === 1) {
                    return new Promise((res) => {
                        resolveFirst = res;
                    });
                }
                return jsonResponse({
                    status: "error",
                    errors: [{code: "second-response-error", severity: "error", message: "The second, faster response."}],
                    warnings: [],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./bundle");
        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Build bundle"}));

        await user.click(screen.getByRole("button", {name: "Build certification bundle"}));
        // Changing the output directory while the first build is still in flight invalidates it and
        // frees the guard right away, so a new Build click doesn't have to wait for the stale request.
        await user.type(screen.getByLabelText("Output directory"), "-changed");
        await user.click(screen.getByRole("button", {name: "Build certification bundle"}));

        expect(await screen.findByText(/The second, faster response\./)).toBeInTheDocument();

        resolveFirst?.(await jsonResponse(okBuildView()));
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 50);
        });

        // The stale first response (a clean build) must never have overwritten the second, error one.
        expect(screen.getByText(/The second, faster response\./)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Inspect"})).not.toBeInTheDocument();
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
                if (url === "/api/project/certification/validate-source") {
                    return new Promise((res) => {
                        resolveRequest = res;
                    });
                }
                return Promise.reject(new Error(`unexpected fetch ${url}`));
            };
            return {fetchImpl: impl, calls: callList};
        })();

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./bundle");

        const validateButton = screen.getByRole("button", {name: "Validate source bundle"});
        await user.click(validateButton);
        await user.click(validateButton);
        await user.click(validateButton);

        expect(calls.filter((call) => call.url === "/api/project/certification/validate-source")).toHaveLength(1);

        resolveRequest?.(await jsonResponse({status: "ok", errors: [], warnings: []}));
    });

    it("clears all certification state when the project switches", async () => {
        const user = userEvent.setup();
        const {fetchImpl: fetchImplA} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/certification/validate-source": () => ({ok: true, status: 200, body: {status: "ok", errors: [], warnings: []}}),
        });

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./bundle");
        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        expect(await screen.findByText("Clean")).toBeInTheDocument();

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Certification"}));

        expect(await screen.findByLabelText("Source outcome-library bundle directory")).toHaveValue("");
        expect(screen.queryByText("Clean")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Build bundle"})).not.toBeInTheDocument();
    });

    it("blocks Build and surfaces a diagnostic for a partially-filled mode row, instead of silently dropping it", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/certification/validate-source": () => ({ok: true, status: 200, body: {status: "ok", errors: [], warnings: []}}),
            "/api/project/certification/build": () => ({ok: true, status: 200, body: okBuildView()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./bundle");

        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Build bundle"}));

        // Add a second mode row and fill in only its mode name -- the seed is left blank, so this row
        // is "touched" but not valid, and must never be silently dropped from the request.
        await user.click(screen.getByRole("button", {name: /Select\/configure/i}));
        await user.click(screen.getByRole("button", {name: "Add mode"}));
        const modeNameInputs = screen.getAllByLabelText("Mode name");
        await user.type(modeNameInputs[1], "bonus");
        expect(await screen.findByText("Seed is required.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: /Build bundle/i}));

        expect(
            await screen.findByText(
                "One or more mode rows on Select/configure are incomplete. Fill in mode name, seed, and a positive sample count, or remove the row, before building.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Build certification bundle"})).toBeDisabled();

        // Removing the incomplete row (rather than completing it) clears the block; the still-valid
        // first row is submitted normally, with no trace of the removed one.
        await user.click(screen.getByRole("button", {name: /Select\/configure/i}));
        const removeButtons = screen.getAllByRole("button", {name: "Remove"});
        await user.click(removeButtons[removeButtons.length - 1]);
        await user.click(screen.getByRole("button", {name: /Build bundle/i}));
        expect(screen.queryByText(/incomplete/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Build certification bundle"})).not.toBeDisabled();

        await user.click(screen.getByRole("button", {name: "Build certification bundle"}));
        await screen.findByText("Clean");

        const buildCall = calls.find((call) => call.url === "/api/project/certification/build");
        expect(JSON.parse(buildCall?.init?.body ?? "{}").modes).toEqual([{modeName: "base", seed: "cert-seed-1", sampleCount: 100}]);
    });

    it("blocks Continue to Build bundle and names the mode configuration issue once a mode row is incomplete, and clears once fixed", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/certification/validate-source": () => ({ok: true, status: 200, body: {status: "ok", errors: [], warnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./bundle");

        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        await screen.findByText("Clean");
        expect(screen.getByRole("button", {name: "Continue to Build bundle"})).toBeInTheDocument();

        // Add a second mode row and leave it half-filled -- the source bundle is still valid, but the
        // unavailable Continue-to-Build state must still explain itself rather than showing an empty list.
        await user.click(screen.getByRole("button", {name: /Select\/configure/i}));
        await user.click(screen.getByRole("button", {name: "Add mode"}));
        const modeNameInputs = screen.getAllByLabelText("Mode name");
        await user.type(modeNameInputs[1], "bonus");
        await screen.findByText("Seed is required.");

        await user.click(screen.getByRole("button", {name: /Preflight/i}));
        expect(screen.queryByRole("button", {name: "Continue to Build bundle"})).not.toBeInTheDocument();
        expect(
            await screen.findByText(
                "One or more mode rows on Select/configure are incomplete -- fill in mode name, seed, and a positive sample count, or remove the row, before continuing.",
            ),
        ).toBeInTheDocument();

        // Removing the incomplete row restores the normal continuation behavior.
        await user.click(screen.getByRole("button", {name: /Select\/configure/i}));
        const removeButtons = screen.getAllByRole("button", {name: "Remove"});
        await user.click(removeButtons[removeButtons.length - 1]);

        await user.click(screen.getByRole("button", {name: /Preflight/i}));
        expect(screen.getByRole("button", {name: "Continue to Build bundle"})).toBeInTheDocument();
        expect(screen.queryByText(/incomplete/)).not.toBeInTheDocument();
    });

    it("marks a completed Build (not Validate) as Outdated when only modes/output directory change, and marks Validate Outdated instead when the bundle directory changes", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/certification/validate-source": () => ({ok: true, status: 200, body: {status: "ok", errors: [], warnings: []}}),
            "/api/project/certification/build": () => ({ok: true, status: 200, body: okBuildView()}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToCertificationTab(user);
        await fillSelectStep(user, "./bundle");
        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Build bundle"}));
        await user.click(screen.getByRole("button", {name: "Build certification bundle"}));
        await screen.findByText("Clean");

        // Editing a mode field (not the bundle directory) invalidates only Build -- Validate's own result
        // is untouched, so only the Build-specific Outdated message should render.
        await user.click(screen.getByRole("button", {name: /Select\/configure/i}));
        await user.type(screen.getByLabelText("Seed"), "-changed");

        expect(
            await screen.findByText(
                /Outdated -- the modes or output directory changed since the last Build run\. Its result no longer reflects what's configured here; rerun Build certification bundle before Inspect\/Export are offered again\./,
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Outdated -- the bundle directory changed since the last Validate run/)).not.toBeInTheDocument();

        // Re-running Build clears the notice.
        await user.click(screen.getByRole("button", {name: /Build bundle/i}));
        await user.click(screen.getByRole("button", {name: "Build certification bundle"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: /Select\/configure/i}));
        expect(screen.queryByText(/Outdated -- the modes or output directory changed/)).not.toBeInTheDocument();

        // Editing the bundle directory instead invalidates both Validate and Build -- only the broader
        // Validate-specific Outdated message should render, not a duplicate Build-specific one.
        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "-changed");
        expect(
            await screen.findByText(
                /Outdated -- the bundle directory changed since the last Validate run\. Its result no longer reflects what's configured here; rerun Validate before Build bundle is offered again\./,
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Outdated -- the modes or output directory changed since the last Build run/)).not.toBeInTheDocument();
    });
});
