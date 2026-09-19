import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const activeJob = {
    id: "job-1", projectId: "/games/sample-slot", operation: "certification-evidence-build", request: {}, conflictKey: "evidence",
    status: "running", createdAt: 1, progress: {stage: "Writing evidence", unit: "files", current: 2, total: 4},
};

describe("ProjectDashboardPage durable jobs", () => {
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
