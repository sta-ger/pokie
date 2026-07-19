import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen} from "@testing-library/react";
import {AdvancedDisclosure} from "../../../../../../cli/studio-client/src/components/common/AdvancedDisclosure";
import {OutcomeBanner} from "../../../../../../cli/studio-client/src/components/common/OutcomeBanner";
import {RecoveryNotice} from "../../../../../../cli/studio-client/src/components/common/RecoveryNotice";
import {WarningState} from "../../../../../../cli/studio-client/src/components/common/WarningState";

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("AdvancedDisclosure", () => {
    it("starts closed, reveals its children on click, and includes the detail parenthetical", () => {
        renderWithMantine(
            <AdvancedDisclosure detail="seed, workers">
                <div>hidden content</div>
            </AdvancedDisclosure>,
        );
        expect(screen.queryByText("hidden content")).toBeNull();
        const toggle = screen.getByRole("button", {name: "Show advanced details (seed, workers)"});
        fireEvent.click(toggle);
        expect(screen.getByText("hidden content")).not.toBeNull();
        expect(screen.getByRole("button", {name: "Hide advanced details (seed, workers)"})).not.toBeNull();
    });

    it("omits the parenthetical when no detail is given", () => {
        renderWithMantine(
            <AdvancedDisclosure>
                <div>hidden content</div>
            </AdvancedDisclosure>,
        );
        expect(screen.getByRole("button", {name: "Show advanced details"})).not.toBeNull();
    });
});

describe("WarningState", () => {
    it("renders a yellow, non-error status alert for the given message", () => {
        renderWithMantine(<WarningState message="A simulation is already running for this project." />);
        const alert = screen.getByRole("status");
        expect(alert.textContent).toContain("A simulation is already running for this project.");
    });
});

describe("RecoveryNotice", () => {
    it("renders the message and invokes onAction when the recovery button is clicked", () => {
        const onAction = jest.fn();
        renderWithMantine(<RecoveryNotice title="Stale selection" message="This changed since you selected it." actionLabel="Refresh" onAction={onAction} />);
        expect(screen.getByText("Stale selection")).not.toBeNull();
        fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
        expect(onAction).toHaveBeenCalledTimes(1);
    });
});

describe("OutcomeBanner", () => {
    it("shows errors and warnings when present", () => {
        renderWithMantine(
            <OutcomeBanner
                color="red"
                icon={null}
                title="Incompatible with this target"
                errors={[{message: "Missing required field"}]}
                warnings={[{message: "Deprecated option used"}]}
            />,
        );
        expect(screen.getByText("Incompatible with this target")).not.toBeNull();
        expect(screen.getByText("Missing required field")).not.toBeNull();
        expect(screen.getByText("Deprecated option used")).not.toBeNull();
    });

    it("falls back to a 'no issues reported' message when both lists are empty", () => {
        renderWithMantine(<OutcomeBanner color="green" icon={null} title="Deployed successfully" errors={[]} warnings={[]} />);
        expect(screen.getByText("No issues reported.")).not.toBeNull();
    });
});
