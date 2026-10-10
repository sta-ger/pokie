import {MantineProvider, Tabs} from "@mantine/core";
import {render, screen, within} from "@testing-library/react";
import {StatusBadge} from "../../../../cli/studio-client/src/components/common/StatusBadge";
import {BLUEPRINT_SECTIONS} from "../../../../cli/studio-client/src/domain/interpret/BlueprintSections";
import {visibleContentOverflows} from "./visibleContentGeometry";

// jsdom has no layout. These supplied rectangles test the audit's selection and
// rejection contract, not rendered product quality; Chromium remains controller-owned.
function rectangle(x: number, y: number, width: number, height: number): DOMRect {
    return {x, y, width, height, left: x, top: y, right: x + width, bottom: y + height,
        toJSON: () => ({x, y, width, height})};
}

const contained = rectangle(10, 10, 100, 40);
const hiddenOverflow = rectangle(115, 10, 30, 12);

function rectangles(...rects: DOMRect[]): DOMRectList {
    return Object.assign(rects, {item: (index: number) => rects[index] ?? null});
}

beforeEach(() => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(contained);
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue(rectangles(contained));
    const createRange = Document.prototype.createRange.bind(document);
    jest.spyOn(document, 'createRange').mockImplementation(() => {
        const range = createRange();
        range.getClientRects = () => rectangles(range.startContainer.parentElement?.closest('.mantine-VisuallyHidden-root')
            ? hiddenOverflow : contained);
        return range;
    });
});

afterEach(() => jest.restoreAllMocks());

it('measures all six real validated tab labels and badges without including their accessible status text', () => {
    render(
        <MantineProvider>
            <Tabs defaultValue="basics">
                <Tabs.List aria-label="Game design sections">
                    {BLUEPRINT_SECTIONS.map(section => (
                        <Tabs.Tab key={section.id} value={section.id}
                            rightSection={<StatusBadge status={{tone: 'success', errorCount: 0, warningCount: 0}} />}>
                            {section.label}
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
            </Tabs>
        </MantineProvider>,
    );
    const list = screen.getByRole('tablist', {name: 'Game design sections'});
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(6);
    expect(tabs.map(tab => tab.querySelector('.mantine-Tabs-tabLabel')?.textContent))
        .toEqual(['Game basics', 'Layout', 'Symbols', 'Reels', 'Paytable', 'Bets']);
    for (const [index, tab] of tabs.entries()) {
        expect(tab).toHaveAccessibleName(`${BLUEPRINT_SECTIONS[index].label} valid`);
        const status = tab.querySelector('.mantine-VisuallyHidden-root')!;
        const range = document.createRange();
        range.selectNodeContents(status.firstChild!);
        expect(range.getClientRects()[0].right).toBeGreaterThan(contained.right);
        expect(visibleContentOverflows(tab)).toBe(false);
        expect(tab).toHaveAccessibleName(`${BLUEPRINT_SECTIONS[index].label} valid`);
    }

    // Decorative visible status presentation must still fail when it clips.
    const badge = tabs[0].querySelector('[aria-hidden="true"]')!;
    jest.spyOn(badge, 'getClientRects').mockReturnValue(rectangles(hiddenOverflow));
    expect(visibleContentOverflows(tabs[0])).toBe(true);
});

it.each(['button', 'label', 'div', 'legend'])('rejects overflowing visible text in a %s even beside hidden status text', tag => {
    const control = document.createElement(tag);
    control.innerHTML = '<span>Visible label</span><span class="mantine-VisuallyHidden-root">valid</span>';
    document.body.append(control);
    try {
        expect(visibleContentOverflows(control)).toBe(false);
        // Element boxes fit, but the label's glyphs overflow. A box-only check would miss this.
        const createRange = Document.prototype.createRange.bind(document);
        jest.spyOn(document, 'createRange').mockImplementation(() => {
            const range = createRange();
            range.getClientRects = () => rectangles(contained, hiddenOverflow);
            return range;
        });
        expect(visibleContentOverflows(control)).toBe(true);
    } finally {
        control.remove();
    }
});

it('excludes nonvisual subtrees while retaining checks on each wrapped line and all four bounds', () => {
    const control = document.createElement('button');
    control.innerHTML = ' \n<span style="display:none">Hidden</span><span style="visibility:hidden">Hidden</span><span>Wrapped label</span>';
    document.body.append(control);
    try {
        const createRange = Document.prototype.createRange.bind(document);
        let textRects = rectangles(rectangle(12, 12, 30, 12), rectangle(12, 28, 50, 12));
        jest.spyOn(document, 'createRange').mockImplementation(() => {
            const range = createRange();
            range.getClientRects = () => {
                expect(range.startContainer.textContent).toBe('Wrapped label');
                return textRects;
            };
            return range;
        });
        expect(visibleContentOverflows(control)).toBe(false);
        for (const rect of [rectangle(7, 12, 10, 12), hiddenOverflow,
            rectangle(12, 7, 10, 12), rectangle(12, 42, 10, 12)]) {
            textRects = rectangles(rect);
            expect(visibleContentOverflows(control)).toBe(true);
        }
    } finally {
        control.remove();
    }
});
