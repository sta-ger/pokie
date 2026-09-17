import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const activeJob = {
    id: "job-1", projectId: "/games/sample-slot", operation: "certification-evidence-build", request: {}, conflictKey: "evidence",
    status: "running", createdAt: 1, progress: {stage: "Writing evidence", unit: "files", current: 2, total: 4},
};

describe("ProjectDashboardPage durable jobs", () => {
    it("discovers active common jobs and names the affected operation before Close", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [activeJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Sample Slot"});
        expect(await screen.findByText("Writing evidence")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Close project"}));

        expect((await screen.findAllByText(/certification-evidence-build/)).length).toBeGreaterThan(1);
    });
});
