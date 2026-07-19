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
    it("reveals its children on click and includes the detail parenthetical", () => {
        renderWithMantine(
            <AdvancedDisclosure detail="seed, workers">
                <div>hidden content</div>
            </AdvancedDisclosure>,
        );
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

    // The controlled region must never be a dangling IDREF: aria-controls always names a real element
    // in the DOM, in both the closed and open states -- it's toggled via the native `hidden` attribute,
    // not conditional rendering, so the id-bearing element is present the whole time and only its
    // hidden-ness (and therefore its presence in the accessibility tree) changes.
    it("keeps the aria-controls target mounted in the DOM in both the closed and open states, hidden only while closed", () => {
        renderWithMantine(
            <AdvancedDisclosure detail="raw JSON">
                <div>hidden content</div>
            </AdvancedDisclosure>,
        );
        const toggle = screen.getByRole("button", {name: "Show advanced details (raw JSON)"});
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        const controlsId = toggle.getAttribute("aria-controls");
        expect(controlsId).toBeTruthy();

        // Closed: the element aria-controls names already exists (no dangling IDREF) but is hidden --
        // absent from the accessibility tree, so getByRole can't see it, yet still reachable by id.
        const regionWhileClosed = document.getElementById(controlsId as string);
        expect(regionWhileClosed).not.toBeNull();
        expect(regionWhileClosed).toHaveAttribute("hidden");
        expect(screen.queryByRole("group", {name: "Advanced details"})).toBeNull();

        fireEvent.click(toggle);

        // Open: the *same* element (never a freshly-mounted one) is now visible/accessible.
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        const regionWhileOpen = document.getElementById(controlsId as string);
        expect(regionWhileOpen).toBe(regionWhileClosed);
        expect(regionWhileOpen).not.toHaveAttribute("hidden");
        expect(regionWhileOpen?.textContent).toContain("hidden content");
        expect(screen.getByRole("group", {name: "Advanced details"})).toBe(regionWhileOpen);
        expect(screen.getByRole("button", {name: "Hide advanced details (raw JSON)"})).toHaveAttribute("aria-controls", controlsId);
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

    it("is announced as an alert -- every recovery notice needs the user's attention now", () => {
        renderWithMantine(<RecoveryNotice title="Stale selection" message="This changed since you selected it." actionLabel="Refresh" onAction={() => undefined} />);
        expect(screen.getByRole("alert").textContent).toContain("This changed since you selected it.");
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

    it("is announced as an alert when it reports at least one error", () => {
        renderWithMantine(
            <OutcomeBanner color="red" icon={null} title="Incompatible with this target" errors={[{message: "Missing required field"}]} warnings={[]} />,
        );
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("is announced as a status, not an alert, when it has no errors (success or warnings-only)", () => {
        renderWithMantine(
            <OutcomeBanner color="blue" icon={null} title="Loaded with warnings" errors={[]} warnings={[{message: "Deprecated option used"}]} />,
        );
        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
    });
});
