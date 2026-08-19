import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    it("explains a playable project's working path and opens Play while retaining its project facts", async () => {
        const user = userEvent.setup();
        const onOpenPlay = jest.fn();
        renderWithMantine(
            <OverviewTab
                header={header({type: "blueprint", origin: "managed", capabilities: ["blueprint.build"]})}
                validation={VALIDATION_IDLE}
                onRevalidate={() => undefined}
                onOpenPlay={onOpenPlay}
            />,
        );

        expect(screen.getByText("sample-slot")).toBeInTheDocument();
        expect(screen.getByText("1.0.0")).toBeInTheDocument();
        expect(screen.getByText("Blueprint")).toBeInTheDocument();
        expect(screen.getByText("Managed")).toBeInTheDocument();
        expect(screen.getByText("/games/sample-slot")).toBeInTheDocument();
        expect(screen.getByText(/Editable — this project's Blueprint source file/)).toBeInTheDocument();

        expect(screen.getByText(/Open Play to spin a real round and find a win or free-games feature/)).toBeInTheDocument();
        expect(screen.getByText(/Use Game Model to edit the saved layout, symbols, reels, paytable, and bets/)).toBeInTheDocument();
        expect(screen.getByText(/generate an outcome library before exporting it for Stake Engine/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Open Play"}));
        expect(onOpenPlay).toHaveBeenCalledTimes(1);

        // A Blueprint is not a package.json-shaped project, so Overview still avoids invented package
        // metadata while guiding the next real workflow.
        expect(screen.queryByText("Package name")).not.toBeInTheDocument();
        expect(screen.queryByText("Package version")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Re-run Inspect"})).not.toBeInTheDocument();
    });

    it("announces the automatic validation check as a polite status update while it's in flight", () => {
        renderWithMantine(<OverviewTab header={header()} validation={{status: "loading"}} onRevalidate={() => undefined} onOpenPlay={() => undefined} />);

        expect(screen.getByText("Checking project…").closest('[role="status"]')).not.toBeNull();
    });
});
