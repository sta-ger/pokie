import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const RETAINED_OPEN_SOURCE = "/games/recoverable";
const RETAINED_OPEN_RUNTIME = "/games/recoverable/generated";
const DIRTY_CONFIRMATION = "You have unsaved changes in Design Game. Leave and lose them?";

function retainedOpeningRoutes() {
    return {
        "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [{
            id: "open-retained", projectId: RETAINED_OPEN_SOURCE, operation: "project-open-materialization",
            request: {sourcePath: RETAINED_OPEN_SOURCE}, conflictKey: `project-open:${RETAINED_OPEN_SOURCE}`,
            status: "recovery-required", createdAt: 1,
            recovery: {action: "retry", reason: "Reopen the captured project."},
        }]}}),
        "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: RETAINED_OPEN_RUNTIME, game: {id: "recoverable", name: "Recoverable", version: "1.0.0"}, type: "blueprint", capabilities: []}}),
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: RETAINED_OPEN_RUNTIME, valid: true, generated: false}}),
        "/api/project/validate": () => ({ok: true, status: 200, body: {valid: true, errors: [], warnings: []}}),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    };
}

async function dirtyOpeningDraft(mode: "form" | "JSON"): Promise<void> {
    if (mode === "JSON") {
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await user.click(screen.getByRole("radio", {name: "JSON"}));
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: "unfinished JSON"}});
    } else {
        fireEvent.change(screen.getByLabelText("Game name"), {target: {value: "Unsaved A"}});
        fireEvent.blur(screen.getByLabelText("Game name"));
    }
}

// HomePage keeps both tab bodies permanently mounted (see HomePage.tsx) -- so a `screen`-wide
// *ByRole/*ByLabelText query has to walk the entire document and run jsdom's getComputedStyle over it to
// decide what's in the accessibility tree. Measured in the gate container: tens of milliseconds per
// screen-wide accessibility-tree query (~40ms for `getByRole("heading", {name})`, ~100ms for
// `getByRole("tab", {name})`) against ~10ms for `getByRole("navigation", {name})`. Real, but an order of
// magnitude too small to be what this suite's gate failures were about.
//
// Two things were, and neither is a timeout:
//
//   1. This file's tab-switch assertions could not fail for the reason they were written to catch (see
//      expectActiveSection below).
//   2. The lane ran every process with a V8 old-space ceiling larger than the whole container. That is
//      a lane-level property, fixed in package.json/jest.config.mjs, not here -- but it is why this
//      file kept coming back red under check:full while passing on its own, and why five successive
//      rounds of raising the budget below changed nothing. Do not read a failure here as a budget
//      problem again without first checking the worker's actual heap_size_limit.
//
// The scoping below is therefore kept for precision, not speed: every query targets the smallest
// container that still identifies it -- the "Sections" nav for HomePage's own tab buttons, the guided
// editor's active section panel for its own fields, the open confirm dialog for its buttons.
function sectionsNav() {
    return within(screen.getByRole("navigation", {name: "Sections"}));
}

// The guided editor's own fields are grouped into sections by SectionedFormEditor, which renders only
// the active section's panel, so there is exactly one `tabpanel` in the document. Re-querying it (rather
// than caching the node) also asserts it is still in the accessibility tree, i.e. that its tab body is
// really shown.
function guidedSection() {
    return within(screen.getByRole("tabpanel"));
}

// Switching Home tabs is a real router navigation (`navigate("/home/:tab")` -> react-router's data
// router resolves the match asynchronously), so React can flush the resulting render after
// user.click's act() has already settled. That has to be observed with an awaited assertion, and it
// has to be observed on something that actually changes with the switch.
//
// Content-based waits can't do it here, which is the trap this file kept falling into: because both
// tab bodies stay permanently mounted (see HomePage.tsx) and only *ByRole queries filter on
// accessibility-tree visibility, a findByText off ProjectsPanel's own mount-time fetch in the
// still-hidden Projects body, or a findByDisplayValue matching the still-mounted symbol input, would
// both be satisfied before any navigation happens, so neither proves the tab switched and the
// synchronous aria-current/heading reads that followed them would be racing the navigation outright.
//
// aria-current on the Sections nav is the switch itself, and HomePage sets it from the same
// `activeTab` render that toggles each body's `display`, so awaiting it also synchronises every
// assertion about the now-visible body -- no per-assertion padding needed, and it returns on the
// first tick once the navigation has landed.
async function expectActiveSection(name: string): Promise<void> {
    await waitFor(() => expect(sectionsNav().getByRole("button", {name})).toHaveAttribute("aria-current", "page"));
}

// One budget for the whole file -- see the equivalent note this replaces for the historical measurements
// this number is derived from; the shape of the suite (render the entire routed app, drive a chain of
// real userEvent interactions with real timers) hasn't changed with the tab redesign.
jest.setTimeout(120000);

describe("HomePage", () => {
    it("exposes draft package publication from fresh Home advanced options without a retained job", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        expect(await screen.findByText("PAR Sheet Import")).toBeVisible();
        expect(screen.getByRole("button", {name: "Import", exact: true})).toBeVisible();
        expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Build Preview"})).toBeVisible();
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue("");
        expect(screen.queryByLabelText("Export to path")).not.toBeInTheDocument();
        expect(screen.getByText(/Build Package exports the current/)).toBeVisible();
        expect(screen.getByText(/POKIE is a slot-game logic framework/)).toBeVisible();
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build" || call.url === "/api/home/blueprints/par-export")).toEqual([]);
    });

    it("rejects a fresh draft's occupied destination and builds the edited destination without saving or opening", async () => {
        const user = userEvent.setup();
        const manifest = {id: "starter-slot", name: "Starter Slot", version: "0.1.0"};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/build-preview": (call) => {
                const {outDir} = JSON.parse(call.init?.body ?? "{}");
                return {ok: true, status: 200, body: {
                    status: "ok", projectRoot: outDir, destinationHasContent: outDir === "/games/occupied",
                    destinationState: outDir === "/games/occupied" ? "occupied" : "missing",
                    manifest, reels: 5, rows: 3, symbolsCount: 8, warnings: [], expectedFiles: [],
                    createFiles: [], updateFiles: [], deleteFiles: [], blueprintHash: "draft",
                }};
            },
            "/api/home/blueprints/build": () => ({ok: true, status: 201, body: {
                status: "ok", projectRoot: "/games/fresh", manifest, warnings: [], createdFiles: ["dist/index.js"],
                buildInfo: {blueprintHash: "draft", generatedAt: "2026-10-10T00:00:00.000Z"},
            }}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        const field = screen.getByLabelText("Output directory (optional)");
        await user.type(field, "/games/occupied");
        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        expect(await screen.findByText(/already has content.*Choose a new or empty output directory/)).toBeVisible();
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(0);
        await user.clear(field);
        await user.type(field, "/games/fresh");
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(await screen.findByText(/Last built/)).toHaveTextContent("/games/fresh");
        const builds = calls.filter((call) => call.url === "/api/home/blueprints/build");
        expect(builds).toHaveLength(1);
        expect(JSON.parse(builds[0].init!.body!)).toMatchObject({outDir: "/games/fresh", blueprint: {manifest}});
        expect(JSON.parse(builds[0].init!.body!)).not.toHaveProperty("sourcePath");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/save-managed" || call.url === "/api/home/projects/open")).toHaveLength(0);
    });

    it("keeps retained project-opening recovery visible on Projects and invokes its captured open action", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [{
                id: "open-retained", projectId: "/games/recoverable", operation: "project-open-materialization",
                request: {sourcePath: "/games/recoverable"}, conflictKey: "project-open:/games/recoverable",
                status: "recovery-required", createdAt: 1,
                recovery: {action: "retry", reason: "Reopen the captured project."},
            }]}}),
            "/api/home/projects/open": () => ({ok: true, status: 200, body: {context: {mode: "project", projectRoot: "/games/recoverable"}, manifest: {id: "recoverable", name: "Recoverable", version: "1.0.0"}}}),
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/recoverable", game: {id: "recoverable", name: "Recoverable", version: "1.0.0"}, type: "blueprint", capabilities: []}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/recoverable", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        expect(await screen.findByRole("heading", {name: "Home jobs"})).toBeInTheDocument();
        expect(await screen.findByText("project-open-materialization · Recovery required")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Retry"}));

        await waitFor(() => expect(calls.some((call) => call.url === "/api/home/projects/open" && call.init?.body === JSON.stringify({projectRoot: "/games/recoverable"}))).toBe(true));
    });

    it("opens a completed Blueprint job in Studio through the guarded transition even without native folder access", async () => {
        const source = "/games/starter-slot/blueprint.json";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...retainedOpeningRoutes(),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "unavailable", reason: "Remote session."}}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [{
                id: "completed-open", projectId: source, operation: "project-open-materialization", request: {sourcePath: source},
                conflictKey: "open", status: "completed", createdAt: 1,
                result: {summary: "Project opening and runtime materialization completed.", outputs: [{label: "Opened project", path: source}]},
            }]}}),
            "/api/home/projects/open": () => ({ok: true, status: 200, body: {context: {mode: "project", projectRoot: RETAINED_OPEN_RUNTIME}}}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await dirtyOpeningDraft("form");
        fireEvent.click(await screen.findByRole("button", {name: "Open Opened project"}));
        await screen.findByText(DIRTY_CONFIRMATION);
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", {name: "Stay"}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Unsaved A");
        expect(screen.queryByRole("button", {name: "Reveal Opened project"})).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "Open Opened project"}));
        await screen.findByText(DIRTY_CONFIRMATION);
        fireEvent.click(screen.getByRole("button", {name: "Leave"}));
        await screen.findByRole("heading", {name: "Recoverable"});
        expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(RETAINED_OPEN_RUNTIME)}/overview`);
        expect(calls.filter((call) => call.url === "/api/home/projects/open").map((call) => JSON.parse(call.init!.body!))).toEqual([{projectRoot: source}]);
        expect(calls.filter((call) => call.url === "/api/home/fs/open-folder")).toHaveLength(0);
    });

    it("retains a missing completed opening and leads to the existing Projects relocation control", async () => {
        const source = "/old-profile/Documents/POKIE Projects/starter-slot/blueprint.json";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...retainedOpeningRoutes(),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [{
                id: "missing-open", projectId: source, operation: "project-open-materialization", request: {sourcePath: source},
                conflictKey: "open", status: "completed", createdAt: 1,
                result: {summary: "Project opening and runtime materialization completed.", outputs: [{label: "Opened project", path: source,
                    unavailableReason: "The retained project is missing. Use Projects to Relocate it to its current location, or add the game again."}]},
            }]}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: [{location: source, type: "blueprint", name: "Starter Slot",
                origin: "managed", capabilities: [], status: "missing", lastOpenedAt: "2026-10-20T13:00:00Z"}]}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        expect(await screen.findByText(/The retained project is missing/)).toBeVisible();
        expect(screen.queryByRole("button", {name: "Open Opened project"})).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "Find retained project in Projects"}));
        expect(router.state.location.pathname).toBe("/home/projects");
        fireEvent.click(await screen.findByRole("button", {name: "Relocate"}));
        expect(await screen.findByLabelText("New location")).toBeVisible();
        expect(calls.filter((call) => call.url === "/api/home/projects/open" || call.url === "/api/home/fs/open-folder")).toHaveLength(0);
    });

    it.each(["form", "JSON"] as const)("guards retained project-opening Retry before side effects for dirty %s, preserving Stay and committing Leave once", async (mode) => {
        let serverIdentity = "/games/previous";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...retainedOpeningRoutes(),
            "/api/home/projects/open": () => {
                serverIdentity = RETAINED_OPEN_RUNTIME;
                return {ok: true, status: 200, body: {context: {mode: "project", projectRoot: RETAINED_OPEN_RUNTIME}, manifest: {id: "recoverable", name: "Recoverable", version: "1.0.0"}}};
            },
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await dirtyOpeningDraft(mode);
        const stored = window.sessionStorage.getItem("pokie-studio:design-draft:v1");
        const entrySurfaces: boolean[] = [];
        const unsubscribe = router.subscribe((state) => {
            if (state.location.pathname === `/project/${encodeURIComponent(RETAINED_OPEN_RUNTIME)}/overview`) {
                entrySurfaces.push(document.getElementById("home-design-panel") === null);
            }
        });

        fireEvent.click(await screen.findByRole("button", {name: "Retry"}));
        await screen.findByText(DIRTY_CONFIRMATION);
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);
        expect(serverIdentity).toBe("/games/previous");
        fireEvent.click(screen.getByRole("button", {name: "Stay"}));
        await waitFor(() => expect(screen.queryByText(DIRTY_CONFIRMATION)).not.toBeInTheDocument());
        expect(router.state.location.pathname).toBe("/home/design");
        expect(router.state.location.state).toBeNull();
        expect(screen.getByLabelText(mode === "JSON" ? "Blueprint JSON" : "Game name")).toHaveValue(mode === "JSON" ? "unfinished JSON" : "Unsaved A");
        expect(window.sessionStorage.getItem("pokie-studio:design-draft:v1")).toBe(stored);
        expect(screen.getByRole("region", {name: "project-open-materialization job open-retained"})).toHaveTextContent("Recovery required");
        expect(serverIdentity).toBe("/games/previous");
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);

        fireEvent.click(screen.getByRole("button", {name: "Retry"}));
        await screen.findByText(DIRTY_CONFIRMATION);
        fireEvent.click(screen.getByRole("button", {name: "Leave"}));
        expect(await screen.findByRole("heading", {name: "Recoverable"})).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(RETAINED_OPEN_RUNTIME)}/overview`);
        const openingCalls = calls.filter((call) => call.url === "/api/home/projects/open");
        expect(openingCalls).toHaveLength(1);
        expect(JSON.parse(openingCalls[0].init!.body!)).toEqual({projectRoot: RETAINED_OPEN_SOURCE});
        expect(serverIdentity).toBe(RETAINED_OPEN_RUNTIME);
        await waitFor(() => expect(screen.queryByText(DIRTY_CONFIRMATION)).not.toBeInTheDocument());
        expect(entrySurfaces.length).toBeGreaterThan(0);
        expect(entrySurfaces.every(Boolean)).toBe(true);
        expect(calls.filter((call) => call.url.includes("/recover") || call.url.includes("/cancel"))).toHaveLength(0);
        unsubscribe();
    });

    it.each(["HTTP", "network"] as const)("reports a rejected retained opening (%s), preserves the dirty draft and job, and allows guarded retry", async (failure) => {
        let rejectOpening = true;
        const mode = failure === "HTTP" ? "form" : "JSON";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...retainedOpeningRoutes(),
            "/api/home/projects/open": () => {
                if (rejectOpening) {
                    if (failure === "network") throw new Error("Failed to fetch");
                    return {ok: false, status: 400, body: {error: "The captured source is temporarily unavailable."}};
                }
                return {ok: true, status: 200, body: {context: {mode: "project", projectRoot: RETAINED_OPEN_RUNTIME}, manifest: {id: "recoverable", name: "Recoverable", version: "1.0.0"}}};
            },
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await dirtyOpeningDraft(mode);
        const stored = window.sessionStorage.getItem("pokie-studio:design-draft:v1");
        fireEvent.click(await screen.findByRole("button", {name: "Retry"}));
        await screen.findByText(DIRTY_CONFIRMATION);
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", {name: "Leave"}));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(failure === "HTTP" ? "The captured source is temporarily unavailable." : "Failed to fetch");
        expect(alert).toHaveTextContent("Retry");
        expect(alert).toHaveTextContent(RETAINED_OPEN_SOURCE);
        expect(router.state.location.pathname).toBe("/home/design");
        expect(screen.getByLabelText(mode === "JSON" ? "Blueprint JSON" : "Game name")).toHaveValue(mode === "JSON" ? "unfinished JSON" : "Unsaved A");
        expect(window.sessionStorage.getItem("pokie-studio:design-draft:v1")).toBe(stored);
        expect(screen.getByRole("region", {name: "project-open-materialization job open-retained"})).toHaveTextContent("Recovery required");
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);

        // Failed side effects must release the one-navigation allowance.
        await act(() => router.navigate("/project/overview"));
        await screen.findByText(DIRTY_CONFIRMATION);
        expect(router.state.location.pathname).toBe("/home/design");
        fireEvent.click(screen.getByRole("button", {name: "Stay"}));
        await waitFor(() => expect(screen.queryByText(DIRTY_CONFIRMATION)).not.toBeInTheDocument());
        rejectOpening = false;
        fireEvent.click(screen.getByRole("button", {name: "Retry"}));
        await screen.findByText(DIRTY_CONFIRMATION);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", {name: "Leave"}));
        expect(await screen.findByRole("heading", {name: "Recoverable"})).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(RETAINED_OPEN_RUNTIME)}/overview`);
        expect(calls.filter((call) => call.url === "/api/home/projects/open").map((call) => JSON.parse(call.init!.body!))).toEqual([
            {projectRoot: RETAINED_OPEN_SOURCE}, {projectRoot: RETAINED_OPEN_SOURCE},
        ]);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText(DIRTY_CONFIRMATION)).not.toBeInTheDocument());
    });

    it("reconstructs a retained PAR import on Home without importing until the user explicitly submits it", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [{
                id: "retained-par-import", projectId: "design:/games/retained.par.xlsx", operation: "design-par-import",
                request: {path: "/games/retained.par.xlsx"}, conflictKey: "design-par-import:/games/retained.par.xlsx",
                status: "recovery-required", createdAt: 1,
                recovery: {action: "rebuild", reason: "Import the captured workbook again."},
            }]}}),
            "/api/home/blueprints/par-import": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/retained.par.xlsx", blueprint: {}, errors: [], warnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        await screen.findByText("design-par-import · Recovery required");
        await user.click(screen.getByRole("button", {name: "Rebuild"}));

        const importPath = await screen.findByLabelText("PAR sheet path");
        expect(importPath).toHaveValue("/games/retained.par.xlsx");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/par-import")).toHaveLength(0);

        await user.click(screen.getByRole("button", {name: "Import"}));
        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/blueprints/par-import")).toHaveLength(1));
        expect(JSON.parse(calls.find((call) => call.url === "/api/home/blueprints/par-import")?.init?.body ?? "{}")).toEqual({path: "/games/retained.par.xlsx"});
    });

    it("recovers the retained Design build draft and destination, then builds only on explicit submission", async () => {
        const user = userEvent.setup();
        const blueprint = {manifest: {id: "recovered", name: "Recovered", version: "1.0.0"}, reels: 3, rows: 3, symbols: ["A"], paytable: {A: {3: 5}}};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [{
                id: "retained-design-build", projectId: "design:/games/recovered.blueprint.json", operation: "design-build",
                request: {sourcePath: "/games/recovered.blueprint.json", destinationPath: "/games/recovered-package", blueprint},
                conflictKey: "design-destination:/games/recovered-package", status: "recovery-required", createdAt: 1,
                recovery: {action: "rebuild", reason: "Build the captured package again."},
            }]}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/build-preview": () => ({ok: true, status: 200, body: {
                status: "ok", projectRoot: "/games/recovered-package", destinationHasContent: false, warnings: [], manifest: blueprint.manifest,
                reels: 3, rows: 3, symbolsCount: 1, blueprintHash: "sha256:recovered", expectedFiles: [], createFiles: [], updateFiles: [], deleteFiles: [],
            }}),
            "/api/home/blueprints/build": () => ({ok: true, status: 201, body: {
                status: "ok", projectRoot: "/games/recovered-package", manifest: blueprint.manifest, createdFiles: [], warnings: [],
                buildInfo: {generatedAt: "2026-09-17T00:00:00.000Z", blueprintHash: "sha256:recovered"},
            }}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        await screen.findByText("design-build · Recovery required");
        await user.click(screen.getByRole("button", {name: "Rebuild"}));

        expect(await screen.findByText(/Recovered the draft for the previous artifact destination/)).toHaveTextContent("/games/recovered-package");
        expect(screen.getByLabelText("Game name")).toHaveValue("Recovered");
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue("/games/recovered-package");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build-preview" || call.url === "/api/home/blueprints/build")).toHaveLength(0);
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(await screen.findByText(/Last built/)).toHaveTextContent("/games/recovered-package");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(1);
        expect(JSON.parse(calls.find((call) => call.url === "/api/home/blueprints/build")!.init!.body!)).toEqual({
            blueprint, sourcePath: "/games/recovered.blueprint.json", outDir: "/games/recovered-package",
        });
        expect(calls.filter((call) => call.url === "/api/home/blueprints/save-managed")).toHaveLength(0);
        await user.click(screen.getByRole("button", {name: "Choose a different start"}));
        await user.click(await screen.findByRole("button", {name: "Discard", exact: true}));
        await user.click(screen.getByRole("button", {name: "Use the starter game"}));
        await waitFor(() => expect(screen.getByLabelText("Output directory (optional)")).toHaveValue(""));
        await user.click(screen.getByRole("button", {name: "Rebuild"}));
        await screen.findByDisplayValue("Recovered");
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue("/games/recovered-package");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(1);
    });

    it("recovers the retained PAR export draft without publishing through Home", async () => {
        const user = userEvent.setup();
        const blueprint = {manifest: {id: "recovered", name: "Recovered", version: "1.0.0"}, reels: 3, rows: 3, symbols: ["A"], paytable: {A: {3: 5}}};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [{
                id: "retained-par-export", projectId: "design:/games/recovered.blueprint.json", operation: "design-par-export",
                request: {sourcePath: "/games/recovered.blueprint.json", destinationPath: "/games/recovered.par.xlsx", blueprint},
                conflictKey: "design-destination:/games/recovered.par.xlsx", status: "recovery-required", createdAt: 1,
                recovery: {action: "rebuild", reason: "Export the captured workbook again."},
            }]}}),
            "/api/home/blueprints/par-export": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/recovered.par.xlsx", warnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        await screen.findByText("design-par-export · Recovery required");
        await user.click(screen.getByRole("button", {name: "Rebuild"}));

        expect(await screen.findByText(/Recovered the draft for the previous artifact destination/)).toHaveTextContent("/games/recovered.par.xlsx");
        expect(screen.getByLabelText("Game name")).toHaveValue("Recovered");
        expect(screen.queryByLabelText("Export to path")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue("");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/par-export")).toHaveLength(0);
    });

    it.each(["form", "JSON"])("confirms retained recovery before replacing dirty %s and preserves the draft and storage on Stay", async (mode) => {
        const user = userEvent.setup();
        const blueprint = {manifest: {id: "B", name: "Recovered B", version: "1.0.0"}, reels: 3, rows: 1, symbols: ["A"], paytable: {A: {3: 5}}};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [{
                id: "retained", projectId: "design:draft:B", operation: "design-build", request: {blueprint, destinationPath: "/games/B"},
                conflictKey: "design-destination:/games/B", status: "recovery-required", createdAt: 1,
                recovery: {action: "rebuild", reason: "Inspect the captured draft."},
            }]}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        if (mode === "JSON") {
            await user.click(screen.getByRole("radio", {name: "JSON"}));
            fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: "unfinished JSON"}});
        } else {
            fireEvent.change(screen.getByLabelText("Game name"), {target: {value: "Unsaved A"}});
            fireEvent.blur(screen.getByLabelText("Game name"));
        }
        const stored = window.sessionStorage.getItem("pokie-studio:design-draft:v1");
        await user.click(screen.getByRole("button", {name: "Rebuild"}));
        await screen.findByText("You have unsaved changes in Design Game. Leave and lose them?");
        await user.click(screen.getByRole("button", {name: "Stay"}));
        expect(router.state.location.state).toBeNull();
        expect(screen.getByLabelText(mode === "JSON" ? "Blueprint JSON" : "Game name")).toHaveValue(mode === "JSON" ? "unfinished JSON" : "Unsaved A");
        expect(window.sessionStorage.getItem("pokie-studio:design-draft:v1")).toBe(stored);
        expect(screen.queryByText(/Recovered the draft for the previous artifact destination/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Rebuild"}));
        await screen.findByText("You have unsaved changes in Design Game. Leave and lose them?");
        await user.click(screen.getByRole("button", {name: "Leave"}));
        expect(await screen.findByText(/Recovered the draft for the previous artifact destination/)).toHaveTextContent("/games/B");
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue("/games/B");
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build" || call.url === "/api/home/blueprints/par-export")).toHaveLength(0);
        expect(JSON.parse(window.sessionStorage.getItem("pokie-studio:design-draft:v1")!).blueprint).toEqual(blueprint);
    });

    it("defaults to Design Game and switches between tabs, keeping aria-current on the active one", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();
        expect(sectionsNav().getByRole("button", {name: "Start a game"})).toHaveAttribute("aria-current", "page");

        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));

        await expectActiveSection("Projects");
        expect(document.activeElement).toBe(screen.getByRole("region", {name: "Projects"}));
        expect(await screen.findByText("No games yet. Start a game or add one you already have.")).toBeInTheDocument();
        expect(screen.getByLabelText("Game location", {exact: false})).toBeInTheDocument();
        expect(sectionsNav().getByRole("button", {name: "Start a game"})).not.toHaveAttribute("aria-current");

        expect(screen.getByText(/ready-to-edit starter, a blank design, or a generated idea/i)).toBeInTheDocument();

        await user.click(sectionsNav().getByRole("button", {name: "Start a game"}));
        await expectActiveSection("Start a game");
        expect(screen.getByRole("heading", {name: "Design Your Game"})).toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByRole("region", {name: "Design Your Game"}));
    });

    it("refreshes a moved managed project when returning from Design Game", async () => {
        const user = userEvent.setup();
        let status: "ok" | "missing" = "ok";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {
                        location: "/games/moved",
                        name: "Moved game",
                        type: "tsPackage",
                        capabilities: [],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status,
                    },
                ],
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        expect(await screen.findByRole("button", {name: "Open"})).toBeInTheDocument();
        await user.click(sectionsNav().getByRole("button", {name: "Start a game"}));
        await expectActiveSection("Start a game");

        status = "missing";
        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");

        expect(await screen.findByText("Moved game (missing)")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Relocate"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Open"})).not.toBeInTheDocument();
        expect(calls.filter((call) => call.url.startsWith("/api/home/projects/registry")).length).toBe(2);
    });

    it("opens an already-registered project from the Projects tab's registry list", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {
                        location: "/games/a",
                        name: "A",
                        type: "tsPackage",
                        capabilities: [],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                ],
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        const entrySurfaces: boolean[] = [];
        const unsubscribe = router.subscribe((state) => {
            if (state.location.pathname === "/project/%2Fgames%2Fa/overview") {
                entrySurfaces.push(document.getElementById("home-design-panel") === null
                    && document.getElementById("home-projects-panel") === null);
            }
        });

        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");
        await user.click(await screen.findByRole("button", {name: "Open"}));

        await waitFor(() => {
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: "/games/a"})}),
                }),
            );
        });
        await waitFor(() => expect(router.state.location.pathname).toBe("/project/%2Fgames%2Fa/overview"));
        unsubscribe();
        expect(entrySurfaces.length).toBeGreaterThan(0);
        expect(entrySurfaces.every(Boolean)).toBe(true);
    });

    it("preserves a Design Game draft across Design -> Projects -> Design (tabs stay mounted, never unmounted)", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Symbols is one of the guided editor's own SectionedFormEditor sections, so it needs its own tab
        // click before its panel -- and with it the "New symbol id" field -- exists.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        fireEvent.change(guidedSection().getByLabelText("New symbol id"), {target: {value: "wild-draft"}});

        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");
        expect(await screen.findByText("No games yet. Start a game or add one you already have.")).toBeInTheDocument();

        // SectionedFormEditor's own activeSection state isn't reset by this outer tab switch (it never
        // unmounts, only its display toggles, same as every other Home tab body) -- Symbols is still the
        // active section here, no need to click it again.
        await user.click(sectionsNav().getByRole("button", {name: "Start a game"}));
        await expectActiveSection("Start a game");
        // The switch back has landed (expectActiveSection above), so the draft assertion is now the only
        // thing left to prove: Design Game's body was never unmounted, only CSS-hidden, so the
        // "wild-draft" value its controlled input holds survived the round trip verbatim. guidedSection()
        // re-queries the tabpanel by role, so this also re-asserts that the guided editor's Symbols panel
        // is genuinely back in the accessibility tree rather than reading a hidden node.
        expect(guidedSection().getByLabelText("New symbol id")).toHaveValue("wild-draft");
    });

    // The heaviest test in the file: it chains the most sequential real userEvent interactions (dirty the
    // draft, open the modal, Stay, restore, re-open, Leave, land on the project), which is why it sets the
    // upper end of the measurements behind the file-wide budget above.
    it("asks for confirmation before leaving a dirty Design Game draft to open a project, and Cancel preserves it", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {
                        location: "/games/a",
                        name: "A",
                        type: "tsPackage",
                        capabilities: [],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                ],
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "0.1.0"}},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Typing alone doesn't dirty the blueprint (the "New symbol id" field is just local uncommitted
        // input state until "Add symbol" actually mutates the blueprint) -- click it too so the editor is
        // genuinely dirty. Symbols is one of SectionedFormEditor's own sections, so it needs its own tab
        // click first.
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        fireEvent.change(guidedSection().getByLabelText("New symbol id"), {target: {value: "wild-draft"}});
        await user.click(guidedSection().getByRole("button", {name: "Add symbol"}));

        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");
        // The Projects tab body is never unmounted either, so this row's Open button stays the very same
        // node for the whole test -- resolved once here so the second click below doesn't have to pay
        // for another screen-wide role query.
        const openButton = await screen.findByRole("button", {name: "Open"});
        await user.click(openButton);

        expect(await screen.findByText("You have unsaved changes in Design Game. Leave and lose them?")).toBeInTheDocument();

        // Cancel ("Stay") -- useOpenProject's guardedAction defers the API call itself until confirmed
        // (see openProjectGuard.test.tsx for a dedicated check that it never fired), so we're still on
        // Home, on the Projects tab (never navigated to /project), and the draft is exactly where it
        // was.
        const stay = within(screen.getByRole("dialog")).getByRole("button", {name: "Stay"});
        expect(stay).toHaveAttribute("id", "design-navigation-guard-stay");
        expect(stay).toHaveAttribute("data-pokie-confirmation", "cancel");
        await user.click(stay);
        await waitFor(() =>
            expect(screen.queryByText("You have unsaved changes in Design Game. Leave and lose them?")).not.toBeInTheDocument(),
        );
        expect(sectionsNav().getByRole("button", {name: "Projects"})).toHaveAttribute("aria-current", "page");
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);
        const startGame = sectionsNav().getByRole("button", {name: "Start a game"});
        expect(startGame).toHaveAttribute("id", "home-tab:design");
        expect(startGame).toHaveAttribute("aria-controls", "home-design-panel");
        expect(startGame).toBeVisible();
        await user.click(startGame);
        await expectActiveSection("Start a game");
        expect(startGame).toHaveAttribute("aria-current", "page");
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);
        // Same as the first draft-restore assertion above: Design Game's tab body was never unmounted
        // (only CSS-hidden), so the committed "wild-draft" symbol input was preserved verbatim. This is
        // scoped to the now-visible guided section rather than left as a screen-wide findByDisplayValue:
        // display-value queries don't filter on accessibility-tree visibility, so a screen-wide one would
        // have matched the still-mounted input even if the switch back had never landed -- it could never
        // have failed for the reason it was written to catch.
        expect(guidedSection().getByDisplayValue("wild-draft")).toBeInTheDocument();

        // Confirming ("Leave") this time actually opens the project.
        await user.click(sectionsNav().getByRole("button", {name: "Projects"}));
        await expectActiveSection("Projects");
        await user.click(openButton);
        expect(await screen.findByText("You have unsaved changes in Design Game. Leave and lose them?")).toBeInTheDocument();
        await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Leave"}));

        await waitFor(() => expect(calls.find((call) => call.url === "/api/home/projects/open")).toBeDefined());
        expect(await screen.findByRole("heading", {name: "A"})).toBeInTheDocument();
    });
});

it("V35 shows retained-work discovery on Home without blocking independent navigation, then retains a known card through refresh failure", async () => {
    let settle: ((value: {ok: boolean; status: number; json: () => Promise<unknown>}) => void) | undefined;
    let reject: ((error: Error) => void) | undefined;
    const base = createRoutedFakeFetch(retainedOpeningRoutes());
    const fetchImpl: import("../../../../../../cli/studio-client/src/api/apiClient").FetchLike = (url, init) => {
        if (url === "/api/home/jobs") return new Promise((resolve, fail) => {
            settle = resolve;
            reject = fail;
        });
        return base.fetchImpl(url, init);
    };
    const {unmount} = renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});
    await screen.findByText("Checking for retained work…");
    expect(sectionsNav().getByRole("button", {name: "Start a game"})).toBeEnabled();
    await act(async () => {
        settle?.({ok: true, status: 200, json: () => Promise.resolve({jobs: [{
            id: "home-discovered", projectId: "/game", operation: "design-build", request: {}, conflictKey: "build",
            status: "completed", createdAt: 1, result: {summary: "Retained build finished"},
        }]})});
        await Promise.resolve();
    });
    await screen.findByRole("region", {name: "design-build job home-discovered"});
    expect(screen.queryByText("Checking for retained work…")).not.toBeInTheDocument();
    await waitFor(() => expect(reject).toBeDefined());
    // The next routine list owns a distinct deferred request.
    const firstReject = reject;
    await waitFor(() => expect(reject).not.toBe(firstReject));
    await act(async () => {
        reject?.(new Error("refresh disconnected"));
        await Promise.resolve();
    });
    await screen.findByText(/refresh disconnected/);
    expect(screen.getByRole("region", {name: "design-build job home-discovered"})).toHaveTextContent("Retained build finished");
    expect(sectionsNav().getByRole("button", {name: "Start a game"})).toBeEnabled();
    unmount();
});
