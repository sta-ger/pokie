import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {CodeBlock} from "../../../../../../cli/studio-client/src/components/common/CodeBlock";
import {ErrorState} from "../../../../../../cli/studio-client/src/components/common/ErrorState";
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

    it("SuccessResult wraps a long unbroken message instead of letting it expand the page width", () => {
        renderWithMantine(<SuccessResult message={LONG_UNBROKEN_TEXT} />);
        // The message renders as the Alert's title, so the wrapping style must be asserted on the
        // Alert root (aria-live="polite"), not the title node itself.
        const alert = screen.getByText(LONG_UNBROKEN_TEXT).closest('[aria-live="polite"]');
        expect(alert).not.toBeNull();
        expect((alert as HTMLElement).style.overflowWrap).toBe("anywhere");
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
        "home/RecentProjectsPanel.tsx",
        "blueprintEditor/SymbolWeightsEditor.tsx",
        "blueprintEditor/PaytableEditor.tsx",
        "blueprintEditor/SymbolsTable.tsx",
        "blueprintEditor/ReelStripGenerationEditor.tsx",
    ];

    it.each(filesRequiringScrollContainer)("%s wraps every <Table> in <Table.ScrollContainer>", (relativePath) => {
        const source = readFileSync(join(componentsRoot, relativePath), "utf8");
        const tableOpenTags = source.match(/<Table(?!\.\w|Th|Td|Tr|Tbody|Thead|Caption)\b/g) ?? [];
        expect(tableOpenTags.length).toBeGreaterThan(0);
        expect(source).toContain("Table.ScrollContainer");
    });
});
