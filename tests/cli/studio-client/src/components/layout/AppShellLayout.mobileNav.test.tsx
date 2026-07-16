import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {AppShellLayout} from "../../../../../../cli/studio-client/src/components/layout/AppShellLayout";
import {NavTabs} from "../../../../../../cli/studio-client/src/components/layout/NavTabs";

// Mantine's Burger renders its animated "opened" indicator as data-opened="true"/absent on an inner
// element, driven entirely by AppShellLayout's own `opened` state -- the most direct DOM signal
// available (short of computed CSS transforms, which jsdom doesn't lay out) that the mobile drawer is
// actually open vs. closed.
function isBurgerOpened(burger: HTMLElement): boolean {
    return burger.querySelector('[data-opened="true"]') !== null;
}

function renderLayout() {
    const onSelect = jest.fn();
    render(
        <MantineProvider>
            <AppShellLayout
                navbar={
                    <NavTabs
                        items={[
                            {value: "a", label: "Section A"},
                            {value: "b", label: "Section B"},
                        ]}
                        active="a"
                        onSelect={onSelect}
                    />
                }
            >
                <div>content</div>
            </AppShellLayout>
        </MantineProvider>,
    );
    return {onSelect, burger: screen.getByRole("button", {name: "Toggle navigation"})};
}

describe("AppShellLayout - mobile navigation", () => {
    it("closes the navbar after selecting a section, and returns focus to the burger", async () => {
        const user = userEvent.setup();
        const {onSelect, burger} = renderLayout();

        await user.click(burger);
        expect(isBurgerOpened(burger)).toBe(true);

        await user.click(screen.getByRole("button", {name: "Section B"}));

        expect(onSelect).toHaveBeenCalledWith("b");
        expect(isBurgerOpened(burger)).toBe(false);
        expect(document.activeElement).toBe(burger);
    });

    it("closes the navbar on Escape and returns focus to the burger", async () => {
        const user = userEvent.setup();
        const {burger} = renderLayout();

        await user.click(burger);
        expect(isBurgerOpened(burger)).toBe(true);

        // Move focus away from the burger first, so returning focus to it on Escape is a real,
        // observable assertion rather than trivially already being true -- .focus() (not a click, which
        // would also trigger NavTabs' own onSelect-driven close) on another focusable element in the
        // still-open navbar.
        screen.getByRole("button", {name: "Section A"}).focus();
        expect(document.activeElement).not.toBe(burger);
        expect(isBurgerOpened(burger)).toBe(true);

        await user.keyboard("{Escape}");

        expect(isBurgerOpened(burger)).toBe(false);
        expect(document.activeElement).toBe(burger);
    });

    it("does not react to Escape while the navbar is already closed", async () => {
        const {burger} = renderLayout();

        expect(isBurgerOpened(burger)).toBe(false);
        const user = userEvent.setup();
        await user.keyboard("{Escape}");

        expect(isBurgerOpened(burger)).toBe(false);
        expect(document.activeElement).not.toBe(burger);
    });
});
