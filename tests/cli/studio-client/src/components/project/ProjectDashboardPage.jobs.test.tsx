import {act, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const activeJob = {
    id: "job-1", projectId: "/games/sample-slot", operation: "certification-evidence-build", request: {}, conflictKey: "evidence",
    status: "running", createdAt: 1, progress: {stage: "Writing evidence", unit: "files", current: 2, total: 4},
};

describe("ProjectDashboardPage durable jobs", () => {
    it("shows a rejected common simulation cancellation outside Simulation while retaining the active job", async () => {
        const user = userEvent.setup();
        const simulationJob = {...activeJob, id: "observed-simulation", operation: "simulation"};
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [simulationJob]}}),
            "/api/project/jobs/observed-simulation": () => ({ok: true, status: 200, body: simulationJob}),
            "/api/project/simulations/observed-simulation": (call) => call.init?.method === "DELETE"
                ? {ok: false, status: 503, body: {error: "Cancellation unavailable"}}
                : {ok: true, status: 200, body: {id: "observed-simulation", status: "running", rounds: 10, roundsCompleted: 2, workers: 1, durationMs: 100, startedAt: new Date().toISOString()}},
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Cancel"}));
        expect(await screen.findByText(/Simulation control failed/)).toHaveTextContent("Cancellation unavailable");
        expect(screen.getByText("simulation · Running")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reattach to retained work"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Cancel"})).toBeEnabled();
    });
    it("discovers a simulation started after mount, retains its report outside the feature panel, and leaves the user's selected task and focus in place", async () => {
        const user = userEvent.setup();
        let started = false;
        let completed = false;
        const durable = () => ({id: "new-simulation", projectId: "/games/sample-slot", operation: "simulation", request: {rounds: 10}, conflictKey: "simulation", createdAt: 1,
            status: completed ? "completed" : "running", result: completed ? {summary: "Ten real rounds completed.", outputs: [{label: "simulation report", downloadPath: "/api/project/reports/new-simulation/download?format=json"}]} : undefined});
        const simulation = () => ({id: "new-simulation", status: completed ? "completed" : "running", rounds: 10, roundsCompleted: completed ? 10 : 2, workers: 1, durationMs: 100, startedAt: new Date().toISOString()});
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: started ? [durable()] : []}}),
            "/api/project/jobs/new-simulation": () => ({ok: true, status: 200, body: durable()}),
            "/api/project/simulations": () => {
                started = true;
                return {ok: true, status: 201, body: simulation()};
            },
            "/api/project/simulations/new-simulation": () => ({ok: true, status: 200, body: simulation()}),
            "/api/project/reports/new-simulation": () => ({ok: true, status: 200, body: {report: {game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, requestedRounds: 10, rounds: 10, totalBet: 10, totalWin: 2, rtp: 0.2, hitFrequency: 0.1, maxWin: 2, workers: 1, durationMs: 100, spinsPerSecond: 100, warnings: [], recommendations: []}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Simulation"}));
        await user.click(await screen.findByRole("button", {name: "Run Simulation"}));
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await waitFor(() => expect(router.state.location.pathname).toMatch(/\/overview$/));
        expect(await screen.findByText("simulation · Running")).toBeInTheDocument();
        // Focus belongs to the rendered destination, after its navigation
        // effect settles, rather than the router's earlier location update.
        await screen.findByText("Overview ready");
        const copyControl = screen.getByRole("button", {name: "Close project"});
        copyControl.focus();
        completed = true;
        expect(await screen.findByRole("link", {name: "Download simulation report"})).toHaveAttribute("href", "/api/project/reports/new-simulation/download?format=json");
        expect(router.state.location.pathname).toMatch(/\/overview$/);
        expect(copyControl).toHaveFocus();
        expect(calls.filter((call) => call.url === "/api/project/simulations" && call.init?.method === "POST")).toHaveLength(1);
    });
    it.each(["held", "loading", "failed"])("holds a dependent workflow selection through its exact %s context refresh in StrictMode", async (refreshState) => {
        const user = userEvent.setup();
        const projectContext = {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]};
        let holdNextContext = false;
        let loadingPublished = false;
        let resolveHeldContext: (() => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            const [pathname] = url.split("?");
            const response = (body: unknown) => ({ok: true, status: 200, json: () => Promise.resolve(body)});
            if (pathname === "/api/project/context") {
                if (holdNextContext) {
                    if (refreshState === "loading" && !loadingPublished) {
                        loadingPublished = true;
                        return Promise.resolve(response({status: "loading", projectRoot: projectContext.projectRoot}));
                    }
                    holdNextContext = false;
                    return new Promise((resolve) => {
                        resolveHeldContext = () => resolve(refreshState === "failed"
                            ? {ok: false, status: 503, json: () => Promise.resolve({error: "Fresh context unavailable"})}
                            : response(projectContext));
                    });
                }
                return Promise.resolve(response(projectContext));
            }
            if (pathname === "/api/project/jobs") return Promise.resolve(response({jobs: []}));
            if (pathname === "/api/project/inspect") return Promise.resolve(response({packageRoot: "/games/sample-slot", valid: true, generated: false}));
            if (pathname === "/api/project/reports" || pathname === "/api/project/replays" || pathname === "/api/project/deployment/targets") return Promise.resolve(response([]));
            if (pathname === "/api/project/validate") return Promise.resolve(response({packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}));
            throw new Error(`Unexpected request: ${pathname}`);
        };

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"], strictMode: true});
        await screen.findByRole("heading", {name: "Sample Slot"});
        expect(screen.getByRole("button", {name: "Your projects"})).toHaveAttribute("id", "project-breadcrumb-projects");
        expect(screen.getByText("Overview ready")).toHaveAttribute("tabindex", "-1");
        const overviewPath = router.state.location.pathname;
        holdNextContext = true;

        await user.click(screen.getByRole("button", {name: "Simulation"}));

        await waitFor(() => expect(resolveHeldContext).toBeDefined());
        expect(router.state.location.pathname).toBe(overviewPath);
        expect(screen.queryByRole("button", {name: "Run Simulation"})).not.toBeInTheDocument();

        await act(() => Promise.resolve(resolveHeldContext?.()));

        if (refreshState === "failed") {
            expect(await screen.findByText(/Fresh context unavailable/)).toBeInTheDocument();
            expect(router.state.location.pathname).toBe(overviewPath);
            expect(screen.queryByRole("button", {name: "Run Simulation"})).not.toBeInTheDocument();
        } else {
            expect(await screen.findByRole("button", {name: "Run Simulation"})).toBeInTheDocument();
            expect(router.state.location.pathname).toMatch(/\/simulation$/);
        }
    });

    it("revalidates context for every rendered terminal durable receipt", async () => {
        let contextRequests = 0;
        const completedArtifactJob = {
            id: "artifact-job-completed", projectId: "/games/sample-slot", operation: "artifact-build", request: {}, conflictKey: "artifact-build:/games/sample-slot",
            status: "completed", createdAt: 1, result: {summary: "Artifact build completed.", outputs: [{label: "PAR workbook", path: "/games/sample-slot/output.xlsx"}]},
        };
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => {
                contextRequests += 1;
                return {ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}};
            },
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [completedArtifactJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        const receipt = await screen.findByRole("status", {name: /artifact-build · completed/i});
        expect(receipt).toHaveAttribute("data-pokie-lifecycle-result", "artifact-build");
        expect(receipt).toHaveAttribute("data-pokie-lifecycle-terminal", "completed");
        expect(receipt.querySelector('[data-pokie-lifecycle-artifact="PAR workbook"]')).toBeInTheDocument();
        await screen.findByText("Artifact build completed.");
        expect(contextRequests).toBeGreaterThanOrEqual(2);
    });

    it("revalidates the rendered project context after an Outcome Library terminal receipt enables Certification", async () => {
        let contextRequests = 0;
        const completedOutcomeLibraryJob = {
            id: "outcome-job-completed", projectId: "/games/sample-slot", operation: "outcome-library-generation", request: {}, conflictKey: "outcome-library:/games/sample-slot/outcomelibrary",
            status: "completed", createdAt: 1,
        };
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => {
                contextRequests += 1;
                return contextRequests === 1
                    ? {ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}
                    : {ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "outcomeLibrary", capabilities: ["outcomeLibrary.read"]}};
            },
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [completedOutcomeLibraryJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        expect(await screen.findByRole("button", {name: "Certification"})).toBeEnabled();
        expect(contextRequests).toBeGreaterThanOrEqual(2);
    });

    it("keeps retained generation receipts discoverable when an outcome artifact only offers republishing", async () => {
        const user = userEvent.setup();
        const job = {id: "previous-generation", projectId: "/games/sample-slot", operation: "outcome-library-generation",
            request: {}, conflictKey: "outcomes", status: "completed", createdAt: 1, result: {summary: "Published the retained outcomes."}};
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot",
                game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "outcomeLibrary", capabilities: ["outcomeLibrary.read"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [job]}}),
            "/api/project/outcome-libraries/generate/jobs": () => ({ok: true, status: 200, body: {status: "ok", jobs: [{id: job.id, status: "completed"}]}}),
            "/api/project/artifacts/targets": () => ({ok: true, status: 200, body: [{target: "outcomeLibrary", supported: true,
                state: "supported", unsupportedNotes: [], plan: {status: "planned", source: {kind: "outcomeLibrary", capabilities: []},
                    target: {kind: "outcomeLibrary", capabilities: []}, steps: [],
                    preflight: {destinationKind: "directory", estimatedWork: "copy", losses: [], oneWay: false}}}]}),
            "/api/project/artifacts/preview": () => ({ok: true, status: 200, body: {status: "ok", target: "outcomeLibrary",
                destination: "/games/copied-outcomes", destinationKind: "directory", plannedOutputs: [], sourceType: "outcomeLibrary"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Build/Export"}));
        await screen.findByText("Outcome library");
        await screen.findByText("outcome-library-generation · Completed");
        expect(screen.queryByText("Outcome library generator")).not.toBeInTheDocument();
        expect(screen.getAllByText("Published the retained outcomes.")).toHaveLength(1);
    });

    it("keeps an Outcome Library durable job visible through the common card outside Build/Export", async () => {
        const outcomeJob = {
            id: "outcome-job-1", projectId: "/games/sample-slot", operation: "outcome-library-generation", request: {}, conflictKey: "outcome-library:/games/sample-slot/outcomelibrary",
            status: "running", createdAt: 1, progress: {stage: "Analyzing outcomes", unit: "records", current: "2", total: "4"},
        };
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [outcomeJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        expect(await screen.findByText("Analyzing outcomes")).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Studio operations"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Cancel"})).toBeInTheDocument();
    });

    it("discovers active common jobs and obtains server-validated confirmation with the affected operation before Close", async () => {
        const user = userEvent.setup();
        let closeAttempts = 0;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [activeJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
            "/api/projects/close": (call) => {
                closeAttempts += 1;
                if (closeAttempts === 1) return {ok: false, status: 409, body: {code: "active-jobs-require-confirmation", operations: ["certification-evidence-build"]}};
                expect(call.init?.body).toBe(JSON.stringify({confirmActiveJobs: true}));
                return {ok: true, status: 200, body: {context: {mode: "home"}}};
            },
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Sample Slot"});
        expect(await screen.findByText("Writing evidence")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Close project"}));

        // The local warning identifies the active operation before any close
        // request can be sent. The card is intentionally not part of this
        // assertion: Mantine's alert title is an accessible label rather than
        // a second rendered text node in every supported version.
        expect(await screen.findByText(/active Studio operations \(certification-evidence-build\)/i)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));
        expect(await screen.findByText(/Active operations: certification-evidence-build/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));
        expect(await screen.findByRole("heading", {name: "Projects"})).toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/projects/close").map((call) => call.init?.body)).toEqual([undefined, JSON.stringify({confirmActiveJobs: true})]);
    });
});
