import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {ErrorState} from "../../../../../../cli/studio-client/src/components/common/ErrorState";

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("ErrorState", () => {
    it("shows the primary message with no expandable disclosure when no detail is given", () => {
        renderWithMantine(<ErrorState message="Installing dependencies failed." />);

        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Installing dependencies failed.");
        expect(screen.queryByText("Technical details")).toBeNull();
    });

    it("renders the raw technical detail inside a collapsed native <details> disclosure, never inline", () => {
        renderWithMantine(<ErrorState message="Installing dependencies failed." detail="npm ERR! simulated failure" />);

        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Installing dependencies failed.");

        const summary = screen.getByText("Technical details");
        const details = summary.closest("details");
        expect(details).not.toBeNull();
        // Collapsed by default -- no explicit `open` attribute -- so the raw diagnostic never renders up
        // front, only on demand.
        expect(details).not.toHaveAttribute("open");
        expect(details?.textContent).toContain("npm ERR! simulated failure");
    });

    it("omits the disclosure entirely for an empty detail string, same as no detail at all", () => {
        renderWithMantine(<ErrorState message="Installing dependencies failed." detail="" />);

        expect(screen.queryByText("Technical details")).toBeNull();
    });
});
