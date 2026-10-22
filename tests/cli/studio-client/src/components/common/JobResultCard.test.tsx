import {MantineProvider} from "@mantine/core";
import {act, fireEvent, render, screen, within} from "@testing-library/react";
import {JobCard} from "../../../../../../cli/studio-client/src/components/common/JobCard";
import {JobResultCard} from "../../../../../../cli/studio-client/src/components/common/JobResultCard";
import {jobFocusLayout} from "../../testUtils/jobFocusLayout";

describe("JobResultCard", () => {
    it.each(["simulation", "design-build"])("V35-RETRY-FOCUS-REFLOW keeps the actual %s Retry visible through layout and viewport changes", async operation => {
        const layout = jobFocusLayout();
        const width = window.innerWidth;
        const height = window.innerHeight;
        const removed = jest.spyOn(window, "removeEventListener");
        const recover = jest.fn();
        const job = {id: "retained-reflow", projectId: "/project", operation, request: {rounds: 2000000}, conflictKey: operation,
            status: "cancelled" as const, createdAt: 1, recovery: {action: "retry" as const, reason: "Review the captured request."}};
        const rendered = render(<MantineProvider><main>
            <JobCard job={job} onRecoveryAction={recover} />
            <button>Sibling task</button>
            <JobCard job={{...job, id: "another-job"}} onRecoveryAction={recover} />
            <div role="dialog"><button>Dialog action</button></div>
        </main></MantineProvider>);
        const region = screen.getByRole("region", {name: `${operation} job retained-reflow`});
        const retry = within(region).getByRole("button", {name: "Retry"});
        // Exact retained desktop and narrow Retry bounds, read from JSONL
        // records 140/143. Region intersection alone missed this failure.
        let narrow = false;
        const bounds = jest.spyOn(retry, "getBoundingClientRect").mockImplementation(() => ({
            x: narrow ? 33 : 293, y: narrow ? 1049.390625 : 836.828125,
            left: narrow ? 33 : 293, right: (narrow ? 33 : 293) + 66.859375,
            top: narrow ? 1049.390625 : 836.828125, bottom: (narrow ? 1049.390625 : 836.828125) + 30,
            width: 66.859375, height: 30, toJSON: () => ({}),
        }));
        const regionGeometry = layout.place(region, 792.1875);
        try {
            Object.assign(window, {innerWidth: 1439, innerHeight: 956});
            retry.focus();
            fireEvent.click(retry);
            expect(recover).toHaveBeenCalledWith(job);
            expect(layout.scroll).not.toHaveBeenCalled();
            expect(layout.observing(region.closest("main")!)).toBe(true);
            narrow = true;
            Object.assign(window, {innerWidth: 390, innerHeight: 844});
            await layout.expand(region.closest("main")!);
            expect(retry).toHaveFocus();
            expect(layout.scroll).toHaveBeenCalledTimes(1);
            expect(layout.scroll.mock.instances[0]).toBe(retry);
            expect(layout.scroll).toHaveBeenLastCalledWith({block: "nearest", inline: "nearest", behavior: "instant"});

            // A viewport-only height change is independent of ResizeObserver.
            await act(async () => {
                fireEvent.resize(window);
                await new Promise(requestAnimationFrame);
            });
            expect(layout.scroll).toHaveBeenCalledTimes(2);
            expect(layout.scroll.mock.instances[1]).toBe(retry);
            for (const target of [screen.getByRole("button", {name: "Sibling task"}),
                within(screen.getByRole("region", {name: `${operation} job another-job`})).getByRole("button", {name: "Retry"}),
                screen.getByRole("button", {name: "Dialog action"})]) {
                narrow = false;
                Object.assign(window, {innerWidth: 1439, innerHeight: 956});
                retry.focus();
                narrow = true;
                Object.assign(window, {innerWidth: 390, innerHeight: 844});
                // Queue while Retry owns focus, then transfer before the frame.
                await layout.expand(region.closest("main")!, () => target.focus());
                expect(target).toHaveFocus();
                expect(layout.scroll).toHaveBeenCalledTimes(2);
                expect(layout.observing(region)).toBe(false);
            }
            narrow = false;
            Object.assign(window, {innerWidth: 1439, innerHeight: 956});
            retry.focus();
            expect(layout.observing(region)).toBe(true);
            narrow = true;
            fireEvent.resize(window);
            rendered.unmount();
            expect(layout.observing(region)).toBe(false);
            expect(removed).toHaveBeenCalledWith("resize", expect.any(Function));
            await act(async () => {
                fireEvent.resize(window);
                await new Promise(requestAnimationFrame);
            });
            expect(layout.scroll).toHaveBeenCalledTimes(2);
        } finally {
            rendered.unmount();
            Object.assign(window, {innerWidth: width, innerHeight: height});
            bounds.mockRestore();
            regionGeometry.restore();
            removed.mockRestore();
            layout.restore();
        }
    });

    it("keeps historical completion and provenance visible without offering missing project output actions", () => {
        const open = jest.fn();
        const reveal = jest.fn();
        render(<MantineProvider><JobResultCard onOpenOutput={open} onRevealOutput={reveal} job={{
            id: "retained-open", projectId: "/old/blueprint.json", operation: "project-open-materialization",
            request: {sourcePath: "/old/blueprint.json"}, conflictKey: "open", status: "completed", createdAt: 1,
            result: {summary: "Project opening and runtime materialization completed.",
                outputs: [{label: "Opened project", path: "/old/blueprint.json", unavailableReason: "The retained project is missing. Use Projects to Relocate it."}],
                provenance: {sourcePath: "/old/blueprint.json"}},
        }} /></MantineProvider>);
        expect(screen.getByRole("status")).toHaveTextContent("project-open-materialization · Completed");
        expect(screen.getByText(/Use Projects to Relocate/)).toBeVisible();
        expect(screen.queryByRole("button", {name: "Open Opened project"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Reveal Opened project"})).not.toBeInTheDocument();
        fireEvent.click(screen.getByText("Inspect provenance"));
        expect(screen.getAllByText(/\/old\/blueprint.json/).length).toBeGreaterThan(0);
        expect(open).not.toHaveBeenCalled();
        expect(reveal).not.toHaveBeenCalled();
    });

    it.each([
        ["completed", "Completed", "status", "This operation completed."],
        ["cancelled", "Cancelled", "status", "This operation was cancelled safely."],
        ["recovery-required", "Recovery required", "status", "This operation needs an explicit recovery action."],
        ["failed", "Failed", "alert", "This operation failed before it could complete."],
    ] as const)("presents %s as a distinct %s lifecycle state", (status, label, role, fallback) => {
        render(<MantineProvider><JobResultCard job={{
            id: `job-${status}`, projectId: "/project", operation: "artifact-build", request: {}, conflictKey: "artifact",
            status, createdAt: 1,
        }} /></MantineProvider>);

        expect(screen.getByRole(role)).toHaveTextContent(`artifact-build · ${label}`);
        expect(screen.getByText(fallback)).toBeInTheDocument();
    });

    it("offers only retained safe output actions and the server-supported resume action", () => {
        const recover = jest.fn();
        const open = jest.fn();
        render(<MantineProvider><JobResultCard onRecover={recover} job={{
            id: "job-1", projectId: "/project", operation: "outcome-library-generation", request: {}, conflictKey: "generation",
            status: "recovery-required", createdAt: 1, completedAt: 2, durationMs: 1,
            result: {summary: "Checkpoint retained", outputs: [
                {label: "Bundle", path: "/tmp/bundle", downloadPath: "/api/download/bundle"},
                {label: "Manifest", path: "/tmp/manifest.json"},
            ]},
            recovery: {action: "resume", reason: "Exact checkpoint is valid."},
        }} onOpenOutput={open} /></MantineProvider>);

        expect(screen.getByRole("link", {name: "Download Bundle"})).toHaveAttribute("href", "/api/download/bundle");
        fireEvent.click(screen.getByRole("button", {name: "Open Manifest"}));
        expect(open).toHaveBeenCalledWith("/tmp/manifest.json");
        fireEvent.click(screen.getByRole("button", {name: "Resume"}));
        expect(recover).toHaveBeenCalledWith("job-1");
    });

    it.each([
        ["retry", "Retry"],
        ["rebuild", "Rebuild"],
        ["new-session", "Start new session"],
    ] as const)("makes %s recovery an actionable %s control", (action, label) => {
        const recover = jest.fn();
        const job = {
            id: `job-${action}`, projectId: "/project", operation: action === "new-session" ? "play-find-any-win" : "artifact-build", request: {}, conflictKey: action,
            status: "recovery-required" as const, createdAt: 1,
            recovery: {action, reason: "Restart recovery requires an explicit new action."},
        };
        render(<MantineProvider><JobResultCard job={job} onRecoveryAction={recover} /></MantineProvider>);

        fireEvent.click(screen.getByRole("button", {name: label}));
        expect(recover).toHaveBeenCalledWith(job);
    });

    it("keeps operation-specific terminal detail and the immutable retry request inspectable", () => {
        render(<MantineProvider><JobResultCard job={{
            id: "certification-job", projectId: "/project", operation: "certification-build", request: {bundleDir: "/bundle", outDir: "/evidence", modes: [{modeName: "base", seed: "s", sampleCount: 10}]},
            conflictKey: "certification", status: "cancelled", createdAt: 1,
            result: {summary: "Cancelled after cleanup", detail: {cleanup: "staging removed", completedSamples: 32}},
            recovery: {action: "rebuild", reason: "Rebuild from the retained source and destination."},
        }} /></MantineProvider>);

        fireEvent.click(screen.getByText("Inspect operation result"));
        fireEvent.click(screen.getByText("Inspect retained request"));
        expect(screen.getByText(/staging removed/)).toBeInTheDocument();
        expect(screen.getByText(/\/bundle/)).toBeInTheDocument();
    });

    it("renders a retained Outcome Library result and keeps inspection usable when host output actions are unavailable", () => {
        const inspect = jest.fn();
        render(<MantineProvider><JobResultCard onInspectOutput={inspect} outputActionsUnavailableReason="This is a remote Studio session." job={{
            id: "outcome-completed", projectId: "/project", operation: "outcome-library-generation", request: {}, conflictKey: "generation",
            status: "completed", createdAt: 1, completedAt: 2, durationMs: 321,
            result: {
                summary: "Outcome Library generation completed.",
                warnings: ["retained-warning: The retained warning."],
                provenance: {library: {id: "fixture-base", hash: "sha256:library"}},
                outputs: [{label: "Outcome Library bundle", path: "outcomelibrary"}],
                detail: {status: "ok", result: {
                    status: "ok", resolvedBundleDir: "/owning-project/outcomelibrary", byteSize: 4096,
                    mode: {modeName: "base", libraryId: "fixture-base", hash: "sha256:library", outcomeCount: 4},
                    generator: {algorithm: "exact", strategy: "exact", configHash: "sha256:config", generatedAt: "2026-09-18T00:00:00.000Z", game: {id: "fixture", version: "1.0.0"}},
                    selector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"},
                }},
            },
        }} /></MantineProvider>);

        expect(screen.getByText("Duration: 321ms")).toBeInTheDocument();
        expect(screen.getByText("Final size: 4,096 bytes")).toBeInTheDocument();
        expect(screen.getByText("Library hash: sha256:library")).toBeInTheDocument();
        expect(screen.getByText("Configuration hash: sha256:config")).toBeInTheDocument();
        expect(screen.getByText("Selector: Bundle outcomelibrary, mode base")).toBeInTheDocument();
        expect(screen.getByText("retained-warning: The retained warning.")).toBeInTheDocument();
        expect(screen.getByText(/Open and reveal are unavailable: This is a remote Studio session/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Open Outcome Library bundle"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Reveal Outcome Library bundle"})).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: "Inspect Outcome Library bundle"}));
        expect(inspect).toHaveBeenCalledWith("/owning-project/outcomelibrary");
    });

    it("sends Inspect, Open, and Reveal to the retained resolved Outcome Library bundle", () => {
        const inspect = jest.fn();
        const open = jest.fn();
        const reveal = jest.fn();
        render(<MantineProvider><JobResultCard onInspectOutput={inspect} onOpenOutput={open} onRevealOutput={reveal} job={{
            id: "outcome-local", projectId: "/owning-project", operation: "outcome-library-generation", request: {}, conflictKey: "generation",
            status: "completed", createdAt: 1,
            result: {
                summary: "Outcome Library generation completed.",
                outputs: [{label: "Outcome Library bundle", path: "outcomelibrary"}],
                detail: {result: {
                    status: "ok", resolvedBundleDir: "/owning-project/outcomelibrary",
                    mode: {}, generator: {}, selector: {},
                }},
            },
        }} /></MantineProvider>);

        fireEvent.click(screen.getByRole("button", {name: "Inspect Outcome Library bundle"}));
        fireEvent.click(screen.getByRole("button", {name: "Open Outcome Library bundle"}));
        fireEvent.click(screen.getByRole("button", {name: "Reveal Outcome Library bundle"}));
        expect(inspect).toHaveBeenCalledWith("/owning-project/outcomelibrary");
        expect(open).toHaveBeenCalledWith("/owning-project/outcomelibrary");
        expect(reveal).toHaveBeenCalledWith("/owning-project/outcomelibrary");
    });

    it("wraps retained-output and recovery actions so every action remains reachable on a narrow surface", () => {
        render(<MantineProvider><JobResultCard onRecover={() => undefined} onOpenOutput={() => undefined} onRevealOutput={() => undefined} job={{
            id: "recoverable-output", projectId: "/project", operation: "artifact-build", request: {}, conflictKey: "artifact",
            status: "recovery-required", createdAt: 1,
            result: {outputs: [{label: "A very long generated output label", path: "/project/a-very-long-generated-output"}]},
            recovery: {action: "resume", reason: "The saved checkpoint can be resumed safely."},
        }} /></MantineProvider>);

        const outputActions = screen.getByRole("button", {name: "Open A very long generated output label"}).closest(".mantine-Group-root") as HTMLElement;
        const recoveryActions = screen.getByRole("button", {name: "Resume"}).closest(".mantine-Group-root") as HTMLElement;
        expect(outputActions.style.getPropertyValue("--group-wrap")).toBe("wrap");
        expect(recoveryActions.style.getPropertyValue("--group-wrap")).toBe("wrap");
    });
});
