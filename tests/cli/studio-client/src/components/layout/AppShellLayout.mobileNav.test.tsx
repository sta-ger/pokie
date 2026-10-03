import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "fs";
import {join} from "path";
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
    it("clears the inherited desktop navbar offset at phone width", () => {
        renderLayout();

        expect(document.querySelector(".studio-app-main")).toHaveTextContent("content");
        expect(document.getElementById("studio-navigation-panel")).toHaveStyle({"overflow-y": "auto"});
        expect(document.getElementById("studio-navigation-panel")?.style.overscrollBehavior).toBe("contain");
        const stylesheet = readFileSync(join(__dirname, "../../../../../../cli/studio-client/src/global.css"), "utf8");
        expect(stylesheet).toMatch(
            /@media \(max-width: 48em\)[\s\S]*?#root \.studio-app-main \{[\s\S]*?--app-shell-navbar-offset: 0px !important;[\s\S]*?padding-inline: var\(--mantine-spacing-md\) !important;/,
        );
    });

    it("closes the navbar after selecting a section, and returns focus to the burger", async () => {
        const user = userEvent.setup();
        const {onSelect, burger} = renderLayout();

        await user.click(burger);
        expect(isBurgerOpened(burger)).toBe(true);

        const focus = jest.spyOn(burger, "focus");
        await user.click(screen.getByRole("button", {name: "Section B"}));
        expect(focus).toHaveBeenCalledWith({preventScroll: true});

        expect(onSelect).toHaveBeenCalledWith("b");
        expect(isBurgerOpened(burger)).toBe(false);
        expect(document.activeElement).toBe(burger);
    });

    it("opens one labelled drawer on native Space release, then selects its tab by pointer", async () => {
        const user = userEvent.setup();
        const {burger, onSelect} = renderLayout();
        const panel = document.getElementById("studio-navigation-panel");
        const clicks = jest.fn();
        burger.addEventListener("click", clicks);

        burger.focus();
        expect(burger).toHaveAttribute("id", "studio-navigation-toggle");
        expect(burger).toHaveAttribute("aria-expanded", "false");
        await user.keyboard("[Space>]");
        expect(isBurgerOpened(burger)).toBe(false);
        expect(clicks).not.toHaveBeenCalled();
        await user.keyboard("[/Space]");

        expect(clicks).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(burger);
        expect(isBurgerOpened(burger)).toBe(true);
        expect(burger).toHaveAttribute("aria-expanded", "true");
        expect(burger).toHaveAttribute("aria-controls", "studio-navigation-panel");
        expect(document.getElementById("studio-navigation-toggle")).toBe(burger);
        expect(document.getElementById("studio-navigation-panel")).toBe(panel);

        const section = screen.getByRole("button", {name: "Section B"});
        expect(panel).toContainElement(section);
        await user.click(section);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith("b");
        expect(burger).toHaveAttribute("aria-expanded", "false");
        expect(document.activeElement).toBe(burger);

        // Follow the next workflow through the same disclosure identity.
        await user.keyboard("[Space]");
        expect(clicks).toHaveBeenCalledTimes(2);
        expect(burger).toHaveAttribute("aria-expanded", "true");
        await user.click(screen.getByRole("button", {name: "Section A"}));
        expect(onSelect.mock.calls).toEqual([["b"], ["a"]]);
        expect(burger).toHaveAttribute("aria-expanded", "false");
    });

    it("keeps the drawer closed when Space is pressed on a disabled toggle or another control", async () => {
        const user = userEvent.setup();
        const {burger, onSelect} = renderLayout();
        burger.focus();
        burger.setAttribute("disabled", "");
        await user.keyboard("[Space]");
        expect(burger).toHaveAttribute("aria-expanded", "false");
        expect(isBurgerOpened(burger)).toBe(false);
        expect(onSelect).not.toHaveBeenCalled();

        burger.removeAttribute("disabled");
        burger.blur();
        await user.keyboard("[Space]");
        expect(burger).toHaveAttribute("aria-expanded", "false");
        expect(isBurgerOpened(burger)).toBe(false);
    });

    it("selects a visible drawer section through its keyboard control", async () => {
        const user = userEvent.setup();
        const {onSelect, burger} = renderLayout();

        await user.click(burger);
        const section = screen.getByRole("button", {name: "Section B"});
        section.focus();
        await user.keyboard("{Enter}");

        expect(onSelect).toHaveBeenCalledTimes(1);
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
