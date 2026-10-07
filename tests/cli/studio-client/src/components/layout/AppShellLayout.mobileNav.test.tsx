import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "fs";
import {join} from "path";
import {useState} from "react";
import {AppShellLayout} from "../../../../../../cli/studio-client/src/components/layout/AppShellLayout";
import {NavTabs} from "../../../../../../cli/studio-client/src/components/layout/NavTabs";
import {ReplayTab, type ExpectedReplayState} from "../../../../../../cli/studio-client/src/components/project/ReplayTab";

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
    it.each([true, false])("keeps Replay Artifact recovery and its drawer navigation responsive (phone: %s)", async (phone) => {
        const previous = Reflect.getOwnPropertyDescriptor(window, "matchMedia");
        Reflect.defineProperty(window, "matchMedia", {configurable: true, value: (query: string) => ({
            matches: phone && query === "(max-width: 48em)", media: query,
            addEventListener: jest.fn(), removeEventListener: jest.fn(),
        })});
        const submissions = jest.fn();
        function RecoveryLayout() {
            const [route, setRoute] = useState("replay");
            const [expected, setExpected] = useState<ExpectedReplayState>({status: "empty"});
            return <AppShellLayout navbar={<NavTabs items={[
                {value: "simulation", label: "Simulation", auditControlId: "project-tab:simulation"},
                {value: "replay", label: "Replay", auditControlId: "project-tab:replay"},
            ]} active={route} onSelect={setRoute} />}>
                <div className="studio-page">
                    {route === "replay" ? <ReplayTab
                        progress={undefined} result={undefined} error={undefined}
                        onRun={() => undefined} onCancel={() => undefined} onRetry={() => undefined}
                        listView={{status: "empty"}} listError={undefined} onRefreshList={() => undefined}
                        onInspectStored={() => Promise.resolve()} onCompareStored={() => undefined}
                        expected={expected} onLoadExpectedFromPaste={(raw) => {
                            submissions(raw);
                            const value = JSON.parse(raw) as {round: number; seed: string};
                            setExpected(value.round > 0 ? {status: "loaded", ...value, artifactWarnings: []} : {status: "error", message: "Round must be positive"});
                        }} onClearExpected={() => setExpected({status: "empty"})} comparison={undefined}
                        recentSpins={{status: "empty"}} recentSpinsError={undefined} onRefreshRecentSpins={() => undefined}
                        recentRuns={{status: "empty"}} recentRunsError={undefined} onRefreshRecentRuns={() => undefined}
                        currentGame={undefined}
                    /> : <p role="status">Simulation configuration</p>}
                </div>
            </AppShellLayout>;
        }
        try {
            const user = userEvent.setup();
            render(<MantineProvider><RecoveryLayout /></MantineProvider>);
            const source = screen.getByLabelText("Replay Artifact");
            const picker = source.closest(".mantine-SegmentedControl-root");
            expect(picker).toHaveAttribute("data-orientation", phone ? "vertical" : "horizontal");
            if (phone) expect(picker).toHaveAttribute("data-full-width", "true");
            else expect(picker).not.toHaveAttribute("data-full-width");
            await user.click(source);
            const field = screen.getByLabelText(/Paste a replay artifact JSON/);
            for (const round of [1, 0, 1]) {
                await user.clear(field);
                await user.type(field, `{{"round":${round},"seed":"recovery"}`);
                await user.click(screen.getByRole("button", {name: "Validate & load"}));
                expect(document.querySelector('[data-pokie-lifecycle-result="replay-artifact"]')).toHaveAttribute("data-pokie-lifecycle-terminal", round ? "loaded" : "error");
            }
            expect(submissions.mock.calls).toEqual([1, 0, 1].map((round) => [JSON.stringify({round, seed: "recovery"})]));
            const burger = screen.getByRole("button", {name: "Toggle navigation"});
            burger.focus();
            await user.keyboard("[Space]");
            expect(burger).toHaveAttribute("aria-expanded", "true");
            expect(document.getElementById("studio-navigation-panel")?.style.maxWidth).toBe(phone ? "100vw" : "");
            await user.click(screen.getByRole("button", {name: "Simulation"}));
            expect(screen.getByRole("status")).toHaveTextContent("Simulation configuration");
            expect(burger).toHaveAttribute("aria-expanded", "false");
            expect(document.activeElement).toBe(burger);
        } finally {
            if (previous) Reflect.defineProperty(window, "matchMedia", previous);
            else Reflect.deleteProperty(window, "matchMedia");
        }
    });

    it("reopens the closed phone panel for Projects after editing the compound workflow's retained Home Design draft", async () => {
        const previous = Reflect.getOwnPropertyDescriptor(window, "matchMedia");
        Reflect.defineProperty(window, "matchMedia", {configurable: true, value: (query: string) => ({
            matches: query === "(max-width: 48em)", media: query,
            addEventListener: jest.fn(), removeEventListener: jest.fn(),
        })});
        const selections = jest.fn();
        function HomeReturn() {
            const [home, setHome] = useState(false);
            const [active, setActive] = useState("simulation");
            const [draft, setDraft] = useState("Starter game");
            return <AppShellLayout key={home ? "home" : "project"}
                breadcrumbs={home ? [] : [{label: "Your projects", onClick: () => {
                    setHome(true);
                    setActive("projects");
                }}]}
                navbar={<NavTabs items={home ? [
                    {value: "design", label: "Start a game", auditControlId: "home-tab:design"},
                    {value: "projects", label: "Projects", auditControlId: "home-tab:projects"},
                ] : [
                    {value: "simulation", label: "Simulation", auditControlId: "project-tab:simulation"},
                    {value: "replay", label: "Replay", auditControlId: "project-tab:replay"},
                ]} active={active} onSelect={(value) => {
                    selections(value);
                    setActive(value);
                }} />}>
                <p role="status">{active} terminal result</p>
                {home && <label style={{display: active === "design" ? undefined : "none"}}>
                    Game name <input value={draft} onChange={(event) => setDraft(event.target.value)} />
                </label>}
            </AppShellLayout>;
        }
        try {
            const user = userEvent.setup();
            render(<MantineProvider><HomeReturn /></MantineProvider>);
            for (const label of ["Replay", "Simulation"]) {
                const burger = screen.getByRole("button", {name: "Toggle navigation"});
                const panel = document.getElementById("studio-navigation-panel");
                expect(panel).toHaveAttribute("inert");
                burger.focus();
                await user.keyboard("[Space]");
                expect(panel).not.toHaveAttribute("inert");
                await user.click(screen.getByRole("button", {name: label}));
                expect(panel).toHaveAttribute("inert");
                expect(burger).toHaveAttribute("aria-expanded", "false");
            }
            const projectBurger = screen.getByRole("button", {name: "Toggle navigation"});
            await user.click(screen.getByRole("button", {name: "Your projects"}));
            const burger = screen.getByRole("button", {name: "Toggle navigation"});
            const panel = document.getElementById("studio-navigation-panel");
            expect(burger).not.toBe(projectBurger);
            expect(panel).toHaveAttribute("aria-labelledby", burger.id);
            expect(panel).toHaveAttribute("inert");
            expect(panel).toHaveStyle({maxWidth: "100vw"});
            burger.focus();
            await user.keyboard("[Space]");
            expect(burger).toHaveAttribute("aria-expanded", "true");
            expect(panel).not.toHaveAttribute("inert");
            const design = screen.getByRole("button", {name: "Start a game"});
            expect(panel).toContainElement(design);
            await user.click(design);
            expect(screen.getByRole("status")).toHaveTextContent("design terminal result");
            expect(selections.mock.calls).toEqual([["replay"], ["simulation"], ["design"]]);
            expect(panel).toHaveAttribute("inert");
            expect(burger).toHaveAttribute("aria-expanded", "false");
            expect(document.activeElement).toBe(burger);
            const draft = screen.getByRole("textbox", {name: "Game name"});
            await user.type(draft, " P805 unsaved");
            expect(draft).toHaveValue("Starter game P805 unsaved");
            expect(panel).toHaveAttribute("inert");
            for (const label of ["Projects", "Start a game"]) {
                burger.focus();
                await user.keyboard("[Space]");
                expect(burger).toHaveAttribute("aria-expanded", "true");
                expect(panel).not.toHaveAttribute("inert");
                const tab = screen.getByRole("button", {name: label});
                expect(panel).toContainElement(tab);
                expect(tab).toBeEnabled();
                await user.click(tab);
                expect(burger).toHaveAttribute("aria-expanded", "false");
                expect(panel).toHaveAttribute("inert");
                expect(document.activeElement).toBe(burger);
                expect(draft).toHaveValue("Starter game P805 unsaved");
                if (label === "Projects") {
                    expect(screen.getByRole("status")).toHaveTextContent("projects terminal result");
                    expect(draft).not.toBeVisible();
                }
            }
            expect(screen.getByRole("textbox", {name: "Game name"})).toBe(draft);
            expect(screen.getByRole("status")).toHaveTextContent("design terminal result");
            expect(selections.mock.calls).toEqual([["replay"], ["simulation"], ["design"], ["projects"], ["design"]]);
        } finally {
            if (previous) Reflect.defineProperty(window, "matchMedia", previous);
            else Reflect.deleteProperty(window, "matchMedia");
        }
    });

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

    it("reopens the retained disclosure before returning to Simulation after a terminal workflow", async () => {
        const user = userEvent.setup();
        const selections = jest.fn();
        function WorkflowLayout() {
            const [active, setActive] = useState("simulation");
            return (
                <AppShellLayout navbar={<NavTabs
                    items={[
                        {value: "simulation", label: "Simulation", auditControlId: "project-tab:simulation"},
                        {value: "replay", label: "Replay", auditControlId: "project-tab:replay"},
                    ]}
                    active={active}
                    onSelect={(value) => {
                        selections(value);
                        setActive(value);
                    }}
                />}>
                    <div role="status">{active} terminal result</div>
                </AppShellLayout>
            );
        }
        render(<MantineProvider><WorkflowLayout /></MantineProvider>);
        const burger = screen.getByRole("button", {name: "Toggle navigation"});
        const panel = document.getElementById("studio-navigation-panel");
        const simulation = screen.getByRole("button", {name: "Simulation"});
        if (!panel) {
            throw new Error("Navigation panel was not rendered");
        }
        panel.scrollTop = 420;

        burger.focus();
        await user.keyboard("[Space]");
        await user.click(screen.getByRole("button", {name: "Replay"}));
        expect(screen.getByRole("status")).toHaveTextContent("replay terminal result");
        expect(burger).toHaveAttribute("aria-expanded", "false");
        expect(document.activeElement).toBe(burger);
        // Mantine retains the drawer's controls through the closing transition.
        // Presence and focus alone do not reopen the product disclosure.
        expect(document.getElementById("project-tab:simulation")).toBe(simulation);
        expect(panel).toContainElement(simulation);
        expect(panel.scrollTop).toBe(420);
        simulation.focus();
        expect(burger).toHaveAttribute("aria-expanded", "false");

        burger.focus();
        await user.keyboard("[Space]");
        expect(burger).toHaveAttribute("aria-expanded", "true");
        expect(document.getElementById("studio-navigation-panel")).toBe(panel);
        expect(panel.scrollTop).toBe(420);
        await user.click(simulation);
        expect(screen.getByRole("status")).toHaveTextContent("simulation terminal result");
        expect(selections.mock.calls).toEqual([["replay"], ["simulation"]]);
        expect(burger).toHaveAttribute("aria-expanded", "false");
        expect(document.activeElement).toBe(burger);
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
