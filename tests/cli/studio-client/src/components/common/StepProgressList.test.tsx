import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {StepProgressList, type StepProgressItem} from "../../../../../../cli/studio-client/src/components/common/StepProgressList";

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

const ALL_STATUSES: StepProgressItem[] = [
    {id: "a", label: "Configure", status: "completed"},
    {id: "b", label: "Validate", status: "current"},
    {id: "c", label: "Build", status: "available"},
    {id: "d", label: "Publish", status: "blocked"},
    {id: "e", label: "Notify", status: "skipped"},
    {id: "f", label: "Archive", status: "failed"},
];

describe("StepProgressList", () => {
    it("renders as a non-interactive list -- no buttons, unlike Mantine's Stepper", () => {
        renderWithMantine(<StepProgressList steps={ALL_STATUSES} />);
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(screen.getByRole("list")).toBeInTheDocument();
    });

    it("marks the current step, and a failed step (also the flow's current position), with aria-current=\"step\"", () => {
        renderWithMantine(<StepProgressList steps={ALL_STATUSES} />);
        expect(screen.getByText("Validate").closest("li")).toHaveAttribute("aria-current", "step");
        expect(screen.getByText("Archive").closest("li")).toHaveAttribute("aria-current", "step");
        for (const label of ["Configure", "Build", "Publish", "Notify"]) {
            expect(screen.getByText(label).closest("li")).not.toHaveAttribute("aria-current");
        }
    });

    it("marks a blocked step aria-disabled, and no other status", () => {
        renderWithMantine(<StepProgressList steps={ALL_STATUSES} />);
        expect(screen.getByText("Publish").closest("li")).toHaveAttribute("aria-disabled", "true");
        for (const label of ["Configure", "Validate", "Build", "Notify", "Archive"]) {
            expect(screen.getByText(label).closest("li")).not.toHaveAttribute("aria-disabled");
        }
    });

    it("exposes each step's status as real (non-color-only) accessible text", () => {
        renderWithMantine(<StepProgressList steps={ALL_STATUSES} />);
        expect(screen.getByText("Configure").textContent).toContain("completed");
        expect(screen.getByText("Validate").textContent).toContain("current step");
        expect(screen.getByText("Build").textContent).toContain("not started");
        expect(screen.getByText("Publish").textContent).toContain("blocked");
        expect(screen.getByText("Notify").textContent).toContain("skipped");
        expect(screen.getByText("Archive").textContent).toContain("failed");
    });

    it("renders an optional description alongside the label", () => {
        renderWithMantine(<StepProgressList steps={[{id: "a", label: "Configure", description: "Game model", status: "current"}]} />);
        expect(screen.getByText("Game model")).toBeInTheDocument();
    });
});
