import {MantineProvider, Stepper} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {CodeBlock} from "../../../../../../cli/studio-client/src/components/common/CodeBlock";
import {EmptyState} from "../../../../../../cli/studio-client/src/components/common/EmptyState";
import {ErrorState} from "../../../../../../cli/studio-client/src/components/common/ErrorState";
import {LoadingState} from "../../../../../../cli/studio-client/src/components/common/LoadingState";
import {QuickActions} from "../../../../../../cli/studio-client/src/components/common/QuickActions";
import {ScreenTable} from "../../../../../../cli/studio-client/src/components/common/ScreenTable";
import {SuccessResult} from "../../../../../../cli/studio-client/src/components/common/SuccessResult";

const LONG_UNBROKEN_TEXT = "a".repeat(500);

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("Responsive / no-horizontal-page-overflow primitives", () => {
    it("ScreenTable wraps its table in a horizontally-scrollable container instead of letting it expand the page", () => {
        renderWithMantine(<ScreenTable screen={[[LONG_UNBROKEN_TEXT, "B", "C"]]} />);
        const cell = screen.getByText(LONG_UNBROKEN_TEXT);
        // Table.ScrollContainer (default type="scrollarea") renders Mantine's ScrollArea as the table's
        // ancestor -- its presence is what confines an arbitrarily wide table to its own scroll region.
        expect(cell.closest(".mantine-ScrollArea-root")).not.toBeNull();
    });

    it("CodeBlock wraps long unbroken content so it wraps within its box instead of forcing horizontal scroll on the page", () => {
        renderWithMantine(<CodeBlock>{LONG_UNBROKEN_TEXT}</CodeBlock>);
        const pre = screen.getByText(LONG_UNBROKEN_TEXT);
        expect(pre.tagName).toBe("PRE");
        expect(pre.style.overflowWrap).toBe("anywhere");
        expect(pre.style.whiteSpace).toBe("pre-wrap");
        // Also height-bounded (ScrollArea.Autosize), so a very long report/debug JSON dump can't push
        // the rest of the page down indefinitely either.
        expect(pre.closest(".mantine-ScrollArea-root")).not.toBeNull();
    });

    it("ErrorState wraps a long unbroken message instead of letting it expand the page width", () => {
        renderWithMantine(<ErrorState message={LONG_UNBROKEN_TEXT} />);
        const alert = screen.getByRole("alert");
        expect(alert.style.overflowWrap).toBe("anywhere");
    });

    it("EmptyState wraps a long unbroken message instead of letting it expand the page width", () => {
        renderWithMantine(<EmptyState message={LONG_UNBROKEN_TEXT} />);
        const status = screen.getByRole("status");
        expect(status.style.overflowWrap).toBe("anywhere");
    });

    it("SuccessResult wraps a long unbroken message instead of letting it expand the page width", () => {
        renderWithMantine(<SuccessResult message={LONG_UNBROKEN_TEXT} />);
        // The message renders as the Alert's title, so the wrapping style must be asserted on the
        // Alert root (role="status"), not the title node itself.
        const status = screen.getByRole("status");
        expect(status.style.overflowWrap).toBe("anywhere");
    });
});

describe("Status/alert/live region semantics", () => {
    it("ErrorState is role=alert with no conflicting explicit aria-live -- role=alert's own implicit assertive live region must not be quietly downgraded to polite", () => {
        renderWithMantine(<ErrorState message="Something failed." />);
        const alert = screen.getByRole("alert");
        expect(alert).not.toHaveAttribute("aria-live");
    });

    it("LoadingState is role=status, not role=alert", () => {
        renderWithMantine(<LoadingState label="Validating…" />);
        expect(screen.getByRole("status").textContent).toContain("Validating…");
    });

    it("EmptyState is role=status, not role=alert", () => {
        renderWithMantine(<EmptyState message="No completed simulations yet." />);
        expect(screen.getByText("No completed simulations yet.")).toHaveAttribute("role", "status");
    });

    it("SuccessResult is role=status, not role=alert", () => {
        renderWithMantine(<SuccessResult message="Applied successfully." />);
        expect(screen.getByRole("status").textContent).toContain("Applied successfully.");
    });
});

describe("Stepper wraps onto multiple lines instead of overflowing on a narrow viewport", () => {
    it("Mantine's Stepper defaults to wrap=true (data-wrap present) when no wrap prop is passed", () => {
        renderWithMantine(
            <Stepper active={0} size="sm">
                <Stepper.Step label="One" />
                <Stepper.Step label="Two" />
                <Stepper.Step label="Three" />
            </Stepper>,
        );
        // Mantine's own CSS keys wrapping off this data attribute (`[data-wrap] { flex-wrap: wrap }`);
        // its presence is what lets steps reflow onto a second line on a narrow viewport instead of
        // forcing the whole page to scroll horizontally.
        const root = screen.getByText("One").closest('[data-wrap]');
        expect(root).not.toBeNull();
    });

    it("no Stepper in the app opts out of the default wrap=true (source guard)", () => {
        const componentsRoot = join(__dirname, "../../../../../../cli/studio-client/src/components");
        const filesWithSteppers = [
            "blueprintEditor/ParSheetImportExportPanel.tsx",
            "blueprintEditor/ReelStripGenerationEditor.tsx",
            "blueprintEditor/BlueprintEditorPage.tsx",
            "project/SimulationTab.tsx",
            "project/OutcomeLibrariesTab.tsx",
            "project/RuntimeTab.tsx",
            "project/DeploymentTab.tsx",
            "project/MechanicsEditorTab.tsx",
            "project/ReplayTab.tsx",
        ];
        for (const relativePath of filesWithSteppers) {
            const source = readFileSync(join(componentsRoot, relativePath), "utf8");
            expect(source).toContain("<Stepper active=");
            expect(source).not.toMatch(/<Stepper\b[^>]*\bwrap={false}/);
        }
    });
});

describe("Button/action groups wrap instead of overflowing (source + render guard)", () => {
    it("QuickActions (the shared action-row wrapper) renders a Group with wrap=\"wrap\"", () => {
        renderWithMantine(
            <QuickActions>
                <button type="button">Action</button>
            </QuickActions>,
        );
        const group = screen.getByRole("button", {name: "Action"}).closest(".mantine-Group-root") as HTMLElement;
        expect(group).not.toBeNull();
        expect(group.style.getPropertyValue("--group-wrap")).toBe("wrap");
    });
});

// Regression guard for the wide-table components named explicitly in the stabilization pass (paytable,
// symbol weights, locked positions, reports, recent projects) -- these each need real
// blueprint/mutate/fetch fixtures to mount at runtime, which would make this test heavy without adding
// meaningfully more confidence than asserting the actual guard (Table.ScrollContainer) is still in
// place around every <Table> in each file. Runtime coverage for the *behavior* those tables render
// lives in each screen's own test file; this only guards against someone silently dropping the
// ScrollContainer wrapper while editing table markup.
describe("Wide tables stay wrapped in Table.ScrollContainer (source guard)", () => {
    const componentsRoot = join(__dirname, "../../../../../../cli/studio-client/src/components");
    const filesRequiringScrollContainer = [
        "common/ScreenTable.tsx",
        "common/SimulationReportDisplay.tsx",
        "common/RoundArtifactInspector.tsx",
        "home/RecentProjectsPanel.tsx",
        "blueprintEditor/SymbolWeightsEditor.tsx",
        "blueprintEditor/PaytableEditor.tsx",
        "blueprintEditor/SymbolsTable.tsx",
        "blueprintEditor/ReelStripGenerationEditor.tsx",
        "project/OutcomeLibrariesTab.tsx",
    ];

    it.each(filesRequiringScrollContainer)("%s wraps every <Table> in <Table.ScrollContainer>", (relativePath) => {
        const source = readFileSync(join(componentsRoot, relativePath), "utf8");
        const tableOpenTags = source.match(/<Table(?!\.\w|Th|Td|Tr|Tbody|Thead|Caption)\b/g) ?? [];
        expect(tableOpenTags.length).toBeGreaterThan(0);
        expect(source).toContain("Table.ScrollContainer");
    });
});
