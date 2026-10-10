import {MantineProvider, Text, TextInput} from "@mantine/core";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {parse} from "postcss";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {AdvancedDisclosure} from "../../../../../../cli/studio-client/src/components/common/AdvancedDisclosure";
import {JobCard} from "../../../../../../cli/studio-client/src/components/common/JobCard";
import {OverviewTab} from "../../../../../../cli/studio-client/src/components/project/OverviewTab";
import {theme} from "../../../../../../cli/studio-client/src/theme";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {jobFocusLayout} from "../../testUtils/jobFocusLayout";

const LONG_PATH = `/games/${"long-project-location/".repeat(12)}package`;
// Load the actual focus selectors/declarations, without jsdom's unsupported
// light-dark() presentation rules. The deferred browser checks the full cascade.
const focusStyle = document.createElement("style");
parse(readFileSync(join(__dirname, "../../../../../../cli/studio-client/src/global.css"), "utf8")).walkRules(rule => {
    if (rule.selector.includes(":focus")) focusStyle.textContent += rule.toString();
});
beforeEach(() => document.head.append(focusStyle));
afterEach(() => focusStyle.remove());

it("keeps section semantics and the same editable field across technical disclosure changes", async () => {
    const user = userEvent.setup();
    render(<MantineProvider theme={theme}>
        <AdvancedDisclosure label="project location">
            <Text className="studio-technical-text">Project path: {LONG_PATH}</Text>
            <TextInput label="Output directory" defaultValue="saved-output" />
        </AdvancedDisclosure>
    </MantineProvider>);
    const toggle = screen.getByRole("button", {name: "Show project location"});
    const section = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(section).toHaveClass("studio-section");
    expect(section.tagName).toBe("FIELDSET");
    expect(section).not.toBeVisible();
    toggle.focus();
    await user.keyboard("{Enter}");
    const input = screen.getByRole("textbox", {name: "Output directory"});
    await user.type(input, "-edited");
    expect(screen.getByText(`Project path: ${LONG_PATH}`)).toBeVisible();
    await user.click(toggle);
    expect(section).not.toBeVisible();
    await user.click(toggle);
    expect(screen.getByRole("textbox", {name: "Output directory"})).toBe(input);
    expect(input).toHaveValue("saved-output-edited");
});

it("keeps all project facts, the full location and the primary Play action in distinct semantic groups", async () => {
    const user = userEvent.setup();
    const play = jest.fn();
    render(<MantineProvider theme={theme}><OverviewTab
        header={{status: "loaded", projectRoot: LONG_PATH, id: "starter-slot", name: "Starter Slot",
            version: "1.0.0", type: "blueprint", origin: "managed", capabilities: ["blueprint.build"]}}
        validation={{status: "idle"}} onRevalidate={() => undefined} onOpenPlay={play}
    /></MantineProvider>);
    const facts = screen.getByRole("table", {name: "Project facts"});
    expect(facts).toHaveClass("studio-metadata");
    expect(within(facts).getAllByRole("row")).toHaveLength(6);
    expect(within(facts).getByText(LONG_PATH)).toHaveClass("studio-technical-text");
    expect(within(facts).getByText("Created in Studio")).toBeVisible();
    expect(within(facts).getByText("Editable — you can change this game in Studio.")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Open Play"}));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("group", {name: "Validation"})).toHaveClass("studio-section");
});

it("keeps disabled cancellation, keyboard terminal focus, full output paths and retained technical disclosures", async () => {
    const user = userEvent.setup();
    const job = {id: "presentation-job", projectId: "/games/starter", operation: "simulation", request: {rounds: 500000},
        conflictKey: "simulation", status: "running" as const, createdAt: 1};
    const cancel = jest.fn();
    const {rerender} = render(<MantineProvider theme={theme}><div className="studio-page"><JobCard job={job} onCancel={cancel} /></div></MantineProvider>);
    const control = screen.getByRole("button", {name: "Cancel"});
    const region = screen.getByRole("region", {name: "simulation job presentation-job"});
    await user.tab();
    expect(control).toHaveFocus();
    rerender(<MantineProvider theme={theme}><div className="studio-page"><JobCard job={{...job, status: "cancelling"}} onCancel={cancel} /></div></MantineProvider>);
    expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    expect(cancel).not.toHaveBeenCalled();
    rerender(<MantineProvider theme={theme}><div className="studio-page"><JobCard job={{...job, status: "completed", durationMs: 100,
        result: {summary: "Simulation completed", outputs: [{label: "Report", path: LONG_PATH},
            {label: "JSON", downloadPath: "/api/project/reports/presentation-job"}], detail: {rounds: 500000}}}} /></div></MantineProvider>);
    expect(screen.getByRole("region", {name: "simulation job presentation-job"})).toBe(region);
    expect(region).toHaveFocus();
    expect(getComputedStyle(region).outline).toBe("2px solid var(--mantine-primary-color-filled)");
    expect(getComputedStyle(region).outlineOffset).toBe("3px");
    expect(screen.getByRole("status")).toHaveClass("studio-job-card");
    expect(screen.getByText(`Report: ${LONG_PATH}`)).toHaveClass("studio-technical-text");
    const request = screen.getByText("Inspect retained request").closest("details")!;
    expect(request).not.toHaveAttribute("open");
    expect(request).toHaveTextContent('"rounds":500000');
    expect(screen.getByText("Inspect operation result")).toBeVisible();
    await user.tab();
    expect(screen.getByRole("link", {name: "Download JSON"})).toHaveFocus();
});

it("keeps Home editor and Projects region focus after keyboard section activation", async () => {
    const user = userEvent.setup();
    const {fetchImpl} = createRoutedFakeFetch({
        "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
    });
    const rendered = renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});
    try {
        const nav = within(screen.getByRole("navigation", {name: "Sections"}));
        nav.getByRole("button", {name: "Start a game"}).focus();
        await user.keyboard("{Enter}");
        await waitFor(() => expect(document.getElementById("home-design-panel")).toHaveFocus());
        expect(document.getElementById("home-design-panel")).toHaveAttribute("tabindex", "-1");
        expect(getComputedStyle(document.getElementById("home-design-panel")!).outline).toBe("2px solid var(--mantine-primary-color-filled)");
        nav.getByRole("button", {name: "Projects"}).focus();
        await user.keyboard("{Enter}");
        await waitFor(() => expect(document.getElementById("home-projects-panel")).toHaveFocus());
        expect(getComputedStyle(document.getElementById("home-projects-panel")!).outline).toBe("2px solid var(--mantine-primary-color-filled)");
        expect(document.getElementById("home-design-panel")).not.toBeVisible();
    } finally {
        rendered.unmount();
    }
});

it.each(["cancelled", "failed"] as const)("keeps Home's %s job and indicator through later page expansion", async status => {
    const user = userEvent.setup();
    const layout = jobFocusLayout();
    let terminal = false;
    const job = () => ({id: "home-focus", projectId: "design:starter", operation: "design-build", request: {},
        conflictKey: "design-build", status: terminal ? status : "running", createdAt: 1,
        ...(terminal ? {result: {summary: "Retained Home result", outputs: [{label: "Result", downloadPath: "/home-result"}]}} : {})});
    const {fetchImpl, calls} = createRoutedFakeFetch({
        "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: [job()]}}),
        "/api/home/jobs/home-focus": () => ({ok: true, status: 200, body: job()}),
        "/api/home/jobs/home-focus/cancel": () => {
            terminal = true;
            return {ok: true, status: 200, body: job()};
        },
    });
    const rendered = renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});
    try {
        const region = await screen.findByRole("region", {name: "design-build job home-focus"});
        const geometry = layout.place(region, 100);
        try {
            within(region).getByRole("button", {name: "Cancel"}).focus();
            if (status === "cancelled") await user.keyboard("{Enter}");
            else terminal = true;
            await waitFor(() => expect(region).toHaveFocus());
            expect(screen.getByRole("region", {name: "design-build job home-focus"})).toBe(region);
            expect(within(region).getByText("Retained Home result")).toBeVisible();
            expect(getComputedStyle(region).outline).toBe("2px solid var(--mantine-primary-color-filled)");
            layout.scroll.mockClear();
            geometry.moveTo(994.75);
            await layout.expand(region.closest(".studio-page")!);
            expect(region).toHaveFocus();
            expect(layout.scroll).toHaveBeenCalledTimes(1);
            expect(layout.scroll.mock.instances[0]).toBe(region);
            await user.tab();
            expect(within(region).getByRole("link", {name: "Download Result"})).toHaveFocus();
            expect(calls.filter(call => call.url.endsWith("/cancel"))).toHaveLength(status === "cancelled" ? 1 : 0);
        } finally {
            geometry.restore();
        }
    } finally {
        rendered.unmount();
        layout.restore();
    }
});

it("keeps build preflight, conflict recovery and the same completed receipt across output collapse", async () => {
    const user = userEvent.setup();
    const writes: unknown[] = [];
    const respond = (body: unknown, status = 200) => Promise.resolve({ok: true, status, json: () => Promise.resolve(body)});
    const fetchImpl: FetchLike = (url, init) => {
        const [path] = url.split("?");
        if (path === "/api/project/context") return respond({status: "loaded", projectRoot: "/games/a",
            game: {id: "a", name: "A", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]});
        if (path === "/api/project/inspect") return respond({packageRoot: "/games/a", valid: true, generated: false});
        if (["/api/project/reports", "/api/project/replays", "/api/project/deployment/targets"].includes(path)) return respond([]);
        if (path === "/api/project/artifacts/targets") return respond([{target: "tsPackage", supported: true, state: "supported", unsupportedNotes: []}]);
        if (path === "/api/project/artifacts/preview") {
            const {outDir} = JSON.parse(init?.body ?? "{}");
            return respond({status: outDir === "occupied" ? "conflict" : "ok", target: "tsPackage",
                destination: outDir === "occupied" ? "/games/occupied" : LONG_PATH, destinationKind: "directory",
                plannedOutputs: ["package.json"], sourceType: "blueprint"});
        }
        if (path === "/api/project/artifacts/build") {
            writes.push(JSON.parse(init?.body ?? "{}"));
            return respond({status: "created", job: {id: "presentation-build", target: "tsPackage", status: "queued", cancellationRequested: false}}, 202);
        }
        if (path === "/api/project/artifacts/build/presentation-build") return respond({id: "presentation-build",
            target: "tsPackage", status: "completed", cancellationRequested: false,
            result: {status: "ok", target: "tsPackage", outputPath: LONG_PATH, outputKind: "directory", sourceType: "blueprint"}});
        return Promise.reject(new Error(`No fixture route for ${path}`));
    };
    const rendered = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
    try {
        await screen.findByRole("heading", {name: "A"});
        screen.getByRole("button", {name: "Build/Export"}).focus();
        await user.keyboard("{Enter}");
        await waitFor(() => expect(screen.getByRole("region", {name: "A"})).toHaveFocus());
        expect(screen.getByRole("region", {name: "A"})).toHaveClass("studio-page");
        expect(getComputedStyle(screen.getByRole("region", {name: "A"})).outline).toBe("2px solid var(--mantine-primary-color-filled)");
        const toggle = await screen.findByRole("button", {name: "Hide options for TypeScript Game Package"});
        const choice = toggle.closest(".studio-output-choice") as HTMLElement;
        const input = within(choice).getByRole("textbox", {name: "Output directory (optional)"});
        const build = within(choice).getByRole("button", {name: "Build"});
        expect(await within(choice).findByText(`Resolved absolute path: ${LONG_PATH}`)).toHaveClass("studio-technical-text");
        fireEvent.change(input, {target: {value: "occupied"}});
        await within(choice).findByText("Choose a different destination");
        expect(build).toBeDisabled();
        fireEvent.click(build);
        expect(writes).toEqual([]);
        fireEvent.change(input, {target: {value: "new-package"}});
        await within(choice).findByText("Ready to build");
        expect(build).toBeEnabled();
        await user.click(build);
        const receipt = await within(choice).findByText(`Built to ${LONG_PATH}.`);
        expect(receipt).toHaveClass("studio-technical-text");
        expect(receipt.closest('[role="status"]')).toHaveClass("studio-operation-result");
        expect(within(choice).getByText("Build completed")).toBeVisible();
        expect(writes).toEqual([{target: "tsPackage", outDir: "new-package"}]);
        await user.click(toggle);
        expect(receipt).not.toBeVisible();
        expect(within(choice).getByText("Built")).toBeVisible();
        expect(within(choice).getByText("Built")).toHaveAttribute("data-status", "Built");
        await user.click(toggle);
        expect(within(choice).getByText(`Built to ${LONG_PATH}.`)).toBe(receipt);
        expect(receipt).toBeVisible();
        expect(input).toHaveValue("new-package");
        expect(writes).toHaveLength(1);
    } finally {
        rendered.unmount();
    }
});
