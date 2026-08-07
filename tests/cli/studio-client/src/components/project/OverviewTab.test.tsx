import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {OverviewTab} from "../../../../../../cli/studio-client/src/components/project/OverviewTab";
import type {ProjectHeaderView, ProjectValidationView} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

const VALIDATION_IDLE: ProjectValidationView = {status: "idle"};

function header(overrides: Partial<Extract<ProjectHeaderView, {status: "loaded"}>> = {}): Extract<ProjectHeaderView, {status: "loaded"}> {
    return {
        status: "loaded",
        projectRoot: "/games/sample-slot",
        id: "sample-slot",
        name: "Sample Slot",
        version: "1.0.0",
        capabilities: [],
        ...overrides,
    };
}

describe("OverviewTab", () => {
    it("shows calm project information -- id, version, type, origin, location, editability, capabilities -- with no next-step call-to-action", () => {
        renderWithMantine(<OverviewTab header={header({type: "blueprint", origin: "managed", capabilities: ["blueprint.build"]})} validation={VALIDATION_IDLE} onRevalidate={() => undefined} />);

        expect(screen.getByText("sample-slot")).toBeInTheDocument();
        expect(screen.getByText("1.0.0")).toBeInTheDocument();
        expect(screen.getByText("Blueprint")).toBeInTheDocument();
        expect(screen.getByText("Managed")).toBeInTheDocument();
        expect(screen.getByText("/games/sample-slot")).toBeInTheDocument();
        expect(screen.getByText(/Editable — this project's Blueprint source file/)).toBeInTheDocument();

        // No wizard-like "next step" recommendation, and no separate package.json-shaped Metadata
        // section -- a "blueprint" project has no package.json of its own to report (see this
        // component's own doc comment).
        expect(screen.queryByRole("button", {name: /Run a simulation|Validate project|Review validation|Try again|View report/})).not.toBeInTheDocument();
        expect(screen.queryByText("Package name")).not.toBeInTheDocument();
        expect(screen.queryByText("Package version")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Re-run Inspect"})).not.toBeInTheDocument();
    });

    it("announces the automatic validation check as a polite status update while it's in flight", () => {
        renderWithMantine(<OverviewTab header={header()} validation={{status: "loading"}} onRevalidate={() => undefined} />);

        expect(screen.getByText("Checking project…").closest('[role="status"]')).not.toBeNull();
    });
});
