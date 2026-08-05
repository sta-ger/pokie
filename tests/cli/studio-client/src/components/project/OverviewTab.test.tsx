import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {OverviewTab} from "../../../../../../cli/studio-client/src/components/project/OverviewTab";
import type {NextActionView, ProjectHeaderView, ProjectValidationView} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

const NEXT_ACTION: NextActionView = {
    kind: "validate",
    title: "Validate your project",
    description: "Run a validation check to confirm your game package is ready to simulate.",
    actionLabel: "Validate project",
};

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
    it("announces the next-step recommendation as a polite status update, not a silent one", () => {
        renderWithMantine(
            <OverviewTab
                header={header()}
                inspection={{status: "loading"}}
                validation={VALIDATION_IDLE}
                onRevalidate={() => undefined}
                nextAction={NEXT_ACTION}
                onNextAction={() => undefined}
                onReinspect={() => undefined}
            />,
        );

        // Scoped via closest(), not a bare getByRole("status") -- the Inspect section's own
        // LoadingState is also role="status" while inspection is loading.
        const status = screen.getByText("Validate your project").closest('[role="status"]');
        expect(status).not.toBeNull();
    });
});
