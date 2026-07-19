import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {OverviewTab} from "../../../../../../cli/studio-client/src/components/project/OverviewTab";
import type {InspectionResultView, NextActionView} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

const NEXT_ACTION: NextActionView = {
    kind: "validate",
    title: "Validate your project",
    description: "Run a validation check to confirm your game package is ready to simulate.",
    actionLabel: "Validate project",
};

describe("OverviewTab", () => {
    // A long, unbroken build-info "source" path (e.g. a deeply nested absolute path with no spaces)
    // must wrap inside its table cell instead of forcing the whole page to scroll horizontally --
    // the same treatment already given to Blueprint hash/Generated files right next to it.
    it("wraps a long, unbroken provenance source path instead of letting it force horizontal page scroll", () => {
        const longSource = "/home/user/projects/some-very-deeply-nested-workspace/games/crazy-fruits/blueprint/game.blueprint.json";
        const inspection: InspectionResultView = {
            status: "loaded",
            packageRoot: "/games/crazy-fruits",
            packageName: "crazy-fruits",
            packageVersion: "1.0.0",
            provenance: {
                status: "generated",
                blueprintHash: "sha256:abc",
                source: longSource,
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-01T00:00:00.000Z",
                files: ["index.js"],
            },
        };

        renderWithMantine(
            <OverviewTab
                header={{id: "crazy-fruits", version: "1.0.0", projectRoot: "/games/crazy-fruits"}}
                inspection={inspection}
                nextAction={NEXT_ACTION}
                onNextAction={() => undefined}
                onReinspect={() => undefined}
            />,
        );

        const sourceCell = screen.getByText(longSource);
        expect(sourceCell.style.overflowWrap).toBe("anywhere");
    });

    it("announces the next-step recommendation as a polite status update, not a silent one", () => {
        renderWithMantine(
            <OverviewTab
                header={{id: "crazy-fruits", version: "1.0.0", projectRoot: "/games/crazy-fruits"}}
                inspection={{status: "loading"}}
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
