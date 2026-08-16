import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const BASE_ROUTES: Record<string, () => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]},
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    // The External Adapter SDK's own local-json-example demo target -- registered by default, but never
    // shown as a Build/Export card (see ExportDeployTargets.ts's own doc comment).
    "/api/project/deployment/targets": () => ({
        ok: true,
        status: 200,
        body: [{id: "local-json-example", version: "1.0.0", requirements: {}, capabilities: ["multiMode"]}],
    }),
    // No target is supported for this fixture's own "blueprint" project other than tsPackage -- most tests
    // here aren't about the Build/Export tab's own "Build artifact" group, so this stays empty/unsupported
    // by default; see the dedicated describe block below for real coverage of that group.
    "/api/project/artifacts/targets": () => ({
        ok: true,
        status: 200,
        body: [
            {target: "tsPackage", supported: true, unsupportedNotes: []},
            {target: "outcomeLibrary", supported: false, unsupportedNotes: []},
            {target: "stakeAdapter", supported: false, unsupportedNotes: []},
            {target: "parWorkbook", supported: false, unsupportedNotes: []},
            {target: "wasm", supported: false, unsupportedNotes: []},
        ],
    }),
    // The default, clean registry-backed preview for the one supported target above -- see the dedicated
    // describe block below for real coverage of both this ("ok") and a destination-conflict preview.
    "/api/project/artifacts/preview": () => ({
        ok: true,
        status: 200,
        body: {
            status: "ok",
            target: "tsPackage",
            destination: "/games/tsPackage",
            destinationKind: "directory",
            plannedOutputs: ["package.json"],
            sourceType: "blueprint",
        },
    }),
};

function fetchImplFrom(routes: Record<string, () => {ok: boolean; status: number; body: unknown}>): FetchLike {
    return (url, init) => {
        const [path] = url.split("?");
        const route = routes[path];
        if (route) {
            const result = route();
            return Promise.resolve({ok: result.ok, status: result.status, json: () => Promise.resolve(result.body)});
        }
        return Promise.reject(new Error(`no fake route for ${url} (init: ${JSON.stringify(init)})`));
    };
}

describe("ProjectDashboardPage - Export & Deploy shell", () => {
    it("classifies Outcome libraries and Stake Engine Export as builder cards, never surfaces the local-json-example demo target, and falls back to the remote-deployment placeholder when nothing else is registered", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));

        const outcomeLibrarySection = screen.getByText("Outcome libraries").closest("fieldset") as HTMLElement;
        expect(within(outcomeLibrarySection).getByText("Outcome library generator")).toBeInTheDocument();

        const staticExportSection = screen.getByText("Static export").closest("fieldset") as HTMLElement;
        expect(within(staticExportSection).getByText("Stake Engine Export")).toBeInTheDocument();

        expect(screen.queryByText("External Adapter: local-json-example")).not.toBeInTheDocument();

        const remoteSection = screen.getByText("Remote deployment").closest("fieldset") as HTMLElement;
        expect(await within(remoteSection).findByText("Remote deployment (none registered yet)")).toBeInTheDocument();
    });

    it("runs a registered remote adapter target's own compatibility check right here (no hand-off to the Deployment tab), offering Publish once it comes back clean", async () => {
        const user = userEvent.setup();
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/targets": () => ({
                ok: true,
                status: 200,
                body: [{id: "acme-rgs-v2", version: "0.1.0", requirements: {}, capabilities: []}],
            }),
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
            "/api/project/deployment/runs": () => ({
                ok: true,
                status: 200,
                body: {
                    targetId: "acme-rgs-v2",
                    publish: false,
                    stages: [],
                    descriptorIssues: [],
                    compatibilityIssues: [],
                    projectionIssues: [],
                    generation: {artifacts: [], issues: []},
                    artifactIssues: [],
                    diagnostic: {ok: true, checks: []},
                    delivery: {delivered: false},
                },
            }),
        };
        renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await screen.findByText("External Adapter: acme-rgs-v2");
        await user.click(screen.getByRole("button", {name: "Check compatibility"}));

        // Runs the same runDeployment(publish: false) pipeline the Deployment tab itself drives, right
        // here -- never navigating away to a separate Stepper-driven workflow first.
        expect(await screen.findByText("Compatible -- ready to publish.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Publish"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Preview artifacts"})).not.toBeInTheDocument();
    });

    it("sends a remote adapter's compatibility check against an already-registered outcome library, not just one generated this session", async () => {
        const user = userEvent.setup();
        let capturedRunBody: {targetId?: string; modes?: {modeName: string; librarySelector: unknown}[]; publish?: boolean} | undefined;
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/targets": () => ({
                ok: true,
                status: 200,
                body: [{id: "acme-rgs-v2", version: "0.1.0", requirements: {}, capabilities: []}],
            }),
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    bundleDir: "outcomelibrary",
                    buildStatus: "compatible",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    currentGame: {id: "a", name: "A", version: "1.0.0"},
                    artifactPokieVersion: "1.0.0",
                    currentPokieVersion: "1.0.0",
                    generatedAt: "2026-01-01T00:00:00.000Z",
                    modes: [
                        {
                            modeName: "base",
                            libraryId: "a-base",
                            bundleDir: "outcomelibrary",
                            buildStatus: "compatible",
                            outcomeCount: 500,
                            totalWeight: 1000,
                            rtp: 0.95,
                            hash: "sha256:library",
                        },
                    ],
                },
            }),
        };
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/runs") {
                capturedRunBody = JSON.parse((init?.body as string | undefined) ?? "{}");
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            targetId: "acme-rgs-v2",
                            publish: false,
                            stages: [],
                            descriptorIssues: [],
                            compatibilityIssues: [],
                            projectionIssues: [],
                            generation: {artifacts: [], issues: []},
                            artifactIssues: [],
                            diagnostic: {ok: true, checks: []},
                            delivery: {delivered: false},
                        }),
                });
            }
            return fetchImplFrom(routes)(url, init);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await screen.findByText("External Adapter: acme-rgs-v2");
        // Waits for the same registry-backed resolution the Stake Engine Export card's own enabled state
        // depends on, so the compatibility check below is guaranteed to run after the registry's
        // already-registered library has actually loaded, not against a still-loading registryView.
        await waitFor(() => expect(screen.getByRole("button", {name: "Run Stake Engine Export (base)"})).toBeEnabled());

        await user.click(screen.getByRole("button", {name: "Check compatibility"}));

        expect(await screen.findByText("Compatible -- ready to publish.")).toBeInTheDocument();
        expect(capturedRunBody?.modes).toEqual([{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}}]);
    });

    it("runs the Stake Engine Export right here (no hand-off to the Stake Engine Export tab) once a canonical outcome library is available", async () => {
        const user = userEvent.setup();
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    bundleDir: "outcomelibrary",
                    buildStatus: "compatible",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    currentGame: {id: "a", name: "A", version: "1.0.0"},
                    artifactPokieVersion: "1.0.0",
                    currentPokieVersion: "1.0.0",
                    generatedAt: "2026-01-01T00:00:00.000Z",
                    modes: [
                        {
                            modeName: "base",
                            libraryId: "a-base",
                            bundleDir: "outcomelibrary",
                            buildStatus: "compatible",
                            outcomeCount: 500,
                            totalWeight: 1000,
                            rtp: 0.95,
                            hash: "sha256:library",
                        },
                    ],
                },
            }),
            "/api/project/stakeengine/export": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", outDir: "stakeengine", files: ["index.json"], manifest: {}, warnings: []},
            }),
        };
        renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await user.click(await screen.findByRole("button", {name: "Run Stake Engine Export (base)"}));

        expect(await screen.findByText("Exported 1 file(s) to stakeengine.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open output folder"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Preview"})).not.toBeInTheDocument();
    });

    it("exports a registry fallback mode with a coherent modeName/librarySelector pairing, not the project's default mode name", async () => {
        const user = userEvent.setup();
        let capturedExportBody: {modes?: {modeName: string; librarySelector: {kind: string; bundleDir: string; modeName: string}}[]} | undefined;
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    bundleDir: "outcomelibrary",
                    buildStatus: "compatible",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    currentGame: {id: "a", name: "A", version: "1.0.0"},
                    artifactPokieVersion: "1.0.0",
                    currentPokieVersion: "1.0.0",
                    generatedAt: "2026-01-01T00:00:00.000Z",
                    // Only a non-"base" mode is registered -- resolveOutcomeLibrarySource() must fall back
                    // to this mode (registryView.modes[0]) rather than the project's own default "base",
                    // and the exported modeName must agree with it.
                    modes: [
                        {
                            modeName: "bonus",
                            libraryId: "a-bonus",
                            bundleDir: "outcomelibrary",
                            buildStatus: "compatible",
                            outcomeCount: 500,
                            totalWeight: 1000,
                            rtp: 0.95,
                            hash: "sha256:library",
                        },
                    ],
                },
            }),
        };
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/stakeengine/export") {
                capturedExportBody = JSON.parse((init?.body as string | undefined) ?? "{}");
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({status: "ok", outDir: "stakeengine", files: ["index.json"], manifest: {}, warnings: []}),
                });
            }
            return fetchImplFrom(routes)(url, init);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await user.click(await screen.findByRole("button", {name: "Run Stake Engine Export (bonus)"}));

        expect(await screen.findByText("Exported 1 file(s) to stakeengine.")).toBeInTheDocument();
        expect(capturedExportBody?.modes).toEqual([
            {modeName: "bonus", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "bonus"}, cost: 1},
        ]);
    });

    it("offers an in-place Overwrite action for an overwritable Stake Engine export conflict, and resubmits the identical resolved mode/library selector with overwrite: true", async () => {
        const user = userEvent.setup();
        const capturedBodies: {modes?: unknown; outDir?: string; overwrite?: boolean}[] = [];
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    bundleDir: "outcomelibrary",
                    buildStatus: "compatible",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    currentGame: {id: "a", name: "A", version: "1.0.0"},
                    artifactPokieVersion: "1.0.0",
                    currentPokieVersion: "1.0.0",
                    generatedAt: "2026-01-01T00:00:00.000Z",
                    modes: [
                        {
                            modeName: "base",
                            libraryId: "a-base",
                            bundleDir: "outcomelibrary",
                            buildStatus: "compatible",
                            outcomeCount: 500,
                            totalWeight: 1000,
                            rtp: 0.95,
                            hash: "sha256:library",
                        },
                    ],
                },
            }),
        };
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/stakeengine/export") {
                const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {modes?: unknown; outDir?: string; overwrite?: boolean};
                capturedBodies.push(body);
                if (!body.overwrite) {
                    return Promise.resolve({
                        ok: false,
                        status: 409,
                        json: () =>
                            Promise.resolve({
                                status: "conflict",
                                outDir: "stakeengine",
                                overwritable: true,
                                error: '"stakeengine" already exists and is not empty. Resubmit with "overwrite": true to replace it.',
                            }),
                    });
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({status: "ok", outDir: "stakeengine", files: ["index.json"], manifest: {}, warnings: []}),
                });
            }
            return fetchImplFrom(routes)(url, init);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await user.click(await screen.findByRole("button", {name: "Run Stake Engine Export (base)"}));

        expect(await screen.findByText('"stakeengine" already exists and is not empty. Resubmit with "overwrite": true to replace it.')).toBeInTheDocument();
        expect(screen.queryByText(/open Stake Engine Export directly/)).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Overwrite"}));

        expect(await screen.findByText("Exported 1 file(s) to stakeengine.")).toBeInTheDocument();
        expect(capturedBodies).toEqual([
            {modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}, cost: 1}], outDir: "stakeengine", overwrite: false},
            {modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}, cost: 1}], outDir: "stakeengine", overwrite: true},
        ]);
    });

    it("gives an actionable in-place message, with no Overwrite action, for a non-overwritable Stake Engine export conflict", async () => {
        const user = userEvent.setup();
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    bundleDir: "outcomelibrary",
                    buildStatus: "compatible",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    currentGame: {id: "a", name: "A", version: "1.0.0"},
                    artifactPokieVersion: "1.0.0",
                    currentPokieVersion: "1.0.0",
                    generatedAt: "2026-01-01T00:00:00.000Z",
                    modes: [
                        {
                            modeName: "base",
                            libraryId: "a-base",
                            bundleDir: "outcomelibrary",
                            buildStatus: "compatible",
                            outcomeCount: 500,
                            totalWeight: 1000,
                            rtp: 0.95,
                            hash: "sha256:library",
                        },
                    ],
                },
            }),
            "/api/project/stakeengine/export": () => ({
                ok: false,
                status: 409,
                body: {
                    status: "conflict",
                    outDir: "stakeengine",
                    overwritable: false,
                    error: '"stakeengine" already exists and is not empty, and wasn\'t produced by a previous Stake Engine export. Choose a different output directory or empty it first.',
                },
            }),
        };
        renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await user.click(await screen.findByRole("button", {name: "Run Stake Engine Export (base)"}));

        expect(await screen.findByText(/wasn't produced by a previous Stake Engine export/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Overwrite"})).not.toBeInTheDocument();
        expect(screen.queryByText(/open Stake Engine Export directly/)).not.toBeInTheDocument();
    });

    it("runs the outcome-library generation right here (no hand-off to the Outcome Libraries tab) when its own card is chosen", async () => {
        const user = userEvent.setup();
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
            "/api/project/outcome-libraries/generate": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    bundleDir: "outcomelibrary",
                    files: ["manifest.json"],
                    warnings: [],
                    mode: {modeName: "base", libraryId: "a-base", hash: "sha256:library", outcomeCount: 500, totalWeight: 1000, rtp: 0.95},
                    generator: {algorithm: "exact", strategy: "exact", pokieVersion: "1.0.0"},
                    coverage: 1,
                    selector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"},
                },
            }),
        };
        renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await user.click(await screen.findByRole("button", {name: "Generate outcome library (base)"}));

        expect(await screen.findByText(/Generated 500 outcomes for mode "base" \(RTP 95\.00%\) into outcomelibrary\./)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open output folder"})).toBeInTheDocument();
        expect(screen.queryByLabelText("Mode")).not.toBeInTheDocument();
    });

    it("falls back to Overview for the removed /project/deployment, /project/stakeEngineExport, and /project/outcomeLibraries routes, never mounting their own old workflows", async () => {
        const deploymentRender = renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/deployment"]});
        await deploymentRender.findByRole("heading", {name: "A"});
        expect(deploymentRender.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        expect(deploymentRender.queryByText("Deployment has moved into Build/Export")).not.toBeInTheDocument();
        expect(deploymentRender.queryByRole("button", {name: "Run deployment preflight"})).not.toBeInTheDocument();
        expect(deploymentRender.queryByRole("button", {name: "Deployment"})).not.toBeInTheDocument();
        deploymentRender.unmount();

        const stakeEngineExportRender = renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/stakeEngineExport"]});
        await stakeEngineExportRender.findByRole("heading", {name: "A"});
        expect(stakeEngineExportRender.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        expect(stakeEngineExportRender.queryByText("Stake Engine Export has moved into Build/Export")).not.toBeInTheDocument();
        expect(stakeEngineExportRender.queryByText("Output directory")).not.toBeInTheDocument();
        expect(stakeEngineExportRender.queryByRole("button", {name: "Stake Engine Export"})).not.toBeInTheDocument();
        stakeEngineExportRender.unmount();

        const outcomeLibrariesRender = renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/outcomeLibraries"]});
        await outcomeLibrariesRender.findByRole("heading", {name: "A"});
        expect(outcomeLibrariesRender.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        expect(outcomeLibrariesRender.queryByText("Outcome Libraries has moved into Build/Export")).not.toBeInTheDocument();
        expect(outcomeLibrariesRender.queryByLabelText("Mode")).not.toBeInTheDocument();
        expect(outcomeLibrariesRender.queryByRole("button", {name: "Analysis"})).not.toBeInTheDocument();
    });

    it("shows a subject-specific recovery message, never the raw backend text, when the deployment targets list fails to load", async () => {
        renderRoutedApp({
            fetchImpl: fetchImplFrom({
                ...BASE_ROUTES,
                "/api/project/deployment/targets": () => ({ok: false, status: 500, body: {error: "ECONNREFUSED 127.0.0.1:4123"}}),
            }),
            initialEntries: ["/project/overview"],
        });
        await screen.findByRole("heading", {name: "A"});
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", {name: "Build/Export"}));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("The deployment targets list couldn't reach the Studio server. Check your connection and try again.");
        expect(alert).not.toHaveTextContent("ECONNREFUSED");
    });

    describe("Build/Export: Build artifact (ArtifactBuilderRegistry, shared with the CLI)", () => {
        it("lists only the capability-supported target (tsPackage), runs it through the shared registry, and offers Open as Project/Projects visibility/folder reveal", async () => {
            const user = userEvent.setup();
            let capturedBuildTarget: string | undefined;
            let capturedOpenProjectRoot: string | undefined;
            let capturedRegisterLocation: string | undefined;
            const fetchImpl: FetchLike = (url, init) => {
                const [path] = url.split("?");
                if (path === "/api/project/artifacts/build") {
                    capturedBuildTarget = (JSON.parse(String(init?.body)) as {target: string}).target;
                    return Promise.resolve({
                        ok: true,
                        status: 201,
                        json: () => Promise.resolve({status: "ok", target: "tsPackage", outputPath: "/games/tsPackage", outputKind: "directory", sourceType: "blueprint"}),
                    });
                }
                if (path === "/api/home/projects/open") {
                    capturedOpenProjectRoot = (JSON.parse(String(init?.body)) as {projectRoot: string}).projectRoot;
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", context: {mode: "project", projectRoot: "/games/tsPackage"}})});
                }
                if (path === "/api/home/projects/registry/register") {
                    capturedRegisterLocation = (JSON.parse(String(init?.body)) as {location: string}).location;
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok"})});
                }
                if (path === "/api/home/fs/open-folder") {
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok"})});
                }
                return fetchImplFrom(BASE_ROUTES)(url, init);
            };

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "A"});
            await user.click(screen.getByRole("button", {name: "Build/Export"}));

            const buildArtifactSection = screen.getByText("Build artifact").closest("fieldset") as HTMLElement;
            expect(within(buildArtifactSection).getByText("TypeScript Game Package")).toBeInTheDocument();
            // Only the one target this blueprint project's own type actually supports is ever offered --
            // "PAR sheet (.xlsx)"/"Stake Engine export (republish)"/"Outcome library (republish)" are
            // filtered out entirely (never rendered disabled), same convention as every other group here.
            expect(within(buildArtifactSection).queryByText("PAR sheet (.xlsx)")).not.toBeInTheDocument();
            expect(within(buildArtifactSection).queryByText("Stake Engine export (republish)")).not.toBeInTheDocument();

            await user.click(within(buildArtifactSection).getByRole("button", {name: "Build"}));

            expect(capturedBuildTarget).toBe("tsPackage");
            expect(await within(buildArtifactSection).findByText(/Built to \/games\/tsPackage/)).toBeInTheDocument();

            // "Add to Projects" first -- "Open as Project" (below) navigates Studio away from this tab
            // entirely (the same explicit Home -> Project transition every "Open in Studio" action makes),
            // so it's exercised last, once nothing further needs to be asserted against this tab's own DOM.
            await user.click(within(buildArtifactSection).getByRole("button", {name: "Add to Projects"}));
            expect(await within(buildArtifactSection).findByRole("button", {name: "Added to Projects"})).toBeDisabled();
            expect(capturedRegisterLocation).toBe("/games/tsPackage");

            await user.click(within(buildArtifactSection).getByRole("button", {name: "Open as Project"}));
            await waitFor(() => expect(capturedOpenProjectRoot).toBe("/games/tsPackage"));
        });

        it("reports a conflict from the shared registry inline, never as a silent no-op", async () => {
            const user = userEvent.setup();
            const fetchImpl: FetchLike = (url, init) => {
                const [path] = url.split("?");
                if (path === "/api/project/artifacts/build") {
                    return Promise.resolve({
                        ok: false,
                        status: 409,
                        json: () =>
                            Promise.resolve({
                                status: "conflict",
                                target: "tsPackage",
                                message: '"/games/tsPackage" already exists and is not empty. Choose a different --out path or remove it first.',
                            }),
                    });
                }
                return fetchImplFrom(BASE_ROUTES)(url, init);
            };

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "A"});
            await user.click(screen.getByRole("button", {name: "Build/Export"}));

            const buildArtifactSection = screen.getByText("Build artifact").closest("fieldset") as HTMLElement;
            await user.click(within(buildArtifactSection).getByRole("button", {name: "Build"}));

            expect(await within(buildArtifactSection).findByText(/already exists and is not empty/)).toBeInTheDocument();
        });

        it("shows the shared registry's own resolved destination before Build is ever clicked, using the same preview endpoint a build would resolve against", async () => {
            const user = userEvent.setup();
            let previewCalls = 0;
            const routes = {
                ...BASE_ROUTES,
                "/api/project/artifacts/preview": () => {
                    previewCalls += 1;
                    return {
                        ok: true,
                        status: 200,
                        body: {
                            status: "ok",
                            target: "tsPackage",
                            destination: "/games/tsPackage",
                            destinationKind: "directory",
                            plannedOutputs: ["package.json"],
                            sourceType: "blueprint",
                        },
                    };
                },
            };

            renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "A"});
            await user.click(screen.getByRole("button", {name: "Build/Export"}));

            const buildArtifactSection = screen.getByText("Build artifact").closest("fieldset") as HTMLElement;

            // The resolved destination is already on screen -- fetched automatically, never behind its own
            // click -- before the "Build" button is ever pressed.
            expect(await within(buildArtifactSection).findByText(/Resolved absolute path:/)).toBeInTheDocument();
            expect(within(buildArtifactSection).getByText(/\/games\/tsPackage/)).toBeInTheDocument();
            expect(previewCalls).toBeGreaterThan(0);
        });

        it("uses the Stake Engine export label, not the raw target ID, in its Build preflight", async () => {
            const user = userEvent.setup();
            const routes = {
                ...BASE_ROUTES,
                "/api/project/artifacts/targets": () => ({
                    ok: true,
                    status: 200,
                    body: [
                        {target: "tsPackage", supported: false, unsupportedNotes: []},
                        {target: "outcomeLibrary", supported: false, unsupportedNotes: []},
                        {target: "stakeAdapter", supported: true, unsupportedNotes: []},
                        {target: "parWorkbook", supported: false, unsupportedNotes: []},
                        {target: "wasm", supported: false, unsupportedNotes: []},
                    ],
                }),
                "/api/project/artifacts/preview": () => ({
                    ok: true,
                    status: 200,
                    body: {
                        status: "ok",
                        target: "stakeAdapter",
                        destination: "/games/stake-engine-export",
                        destinationKind: "directory",
                        plannedOutputs: ["index.json"],
                        sourceType: "stakeAdapter",
                    },
                }),
            };

            renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "A"});
            await user.click(screen.getByRole("button", {name: "Build/Export"}));

            const buildArtifactSection = screen.getByText("Build artifact").closest("fieldset") as HTMLElement;
            expect(await within(buildArtifactSection).findByText("Target: Stake Engine export (republish)")).toBeInTheDocument();
            expect(buildArtifactSection).not.toHaveTextContent("stakeAdapter");
        });

        it("surfaces a destination conflict from the shared registry's own preview before Build is ever clicked, never only discovered after attempting a build", async () => {
            const user = userEvent.setup();
            let buildWasAttempted = false;
            const fetchImpl: FetchLike = (url, init) => {
                const [path] = url.split("?");
                if (path === "/api/project/artifacts/preview") {
                    return Promise.resolve({
                        ok: false,
                        status: 409,
                        json: () =>
                            Promise.resolve({
                                status: "conflict",
                                target: "tsPackage",
                                destination: "/games/tsPackage",
                                destinationKind: "directory",
                                plannedOutputs: ["package.json"],
                                message: '"/games/tsPackage" already exists and is not empty. Choose a different --out path or remove it first.',
                            }),
                    });
                }
                if (path === "/api/project/artifacts/build") {
                    buildWasAttempted = true;
                }
                return fetchImplFrom(BASE_ROUTES)(url, init);
            };

            renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
            await screen.findByRole("heading", {name: "A"});
            await user.click(screen.getByRole("button", {name: "Build/Export"}));

            const buildArtifactSection = screen.getByText("Build artifact").closest("fieldset") as HTMLElement;

            expect(await within(buildArtifactSection).findByText(/already exists and is not empty/)).toBeInTheDocument();
            expect(buildWasAttempted).toBe(false);
        });
    });
});
