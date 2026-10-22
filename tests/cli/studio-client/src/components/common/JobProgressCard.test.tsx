import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen} from "@testing-library/react";
import {useLayoutEffect, useRef} from "react";
import {JobProgressCard} from "../../../../../../cli/studio-client/src/components/common/JobProgressCard";
import {JobCard} from "../../../../../../cli/studio-client/src/components/common/JobCard";
import {jobFocusLayout} from "../../testUtils/jobFocusLayout";
import type {StudioJobView} from "../../../../../../cli/studio-client/src/api/types";

describe("JobProgressCard", () => {
    it.each(["pending", "cancelling", "queued", "id", "projectId", "startedAt", "progress", "stage", "unit", "total", "regression", "execution-and-progress"] as const)("excludes stale estimates from the first committed %s transition before passive effects", transition => {
        let now = 1_000;
        const dateNow = jest.spyOn(Date, "now").mockImplementation(() => now);
        const commits: string[] = [];
        function ObservedCard({job, pending = false}: {job: StudioJobView; pending?: boolean}) {
            const region = useRef<HTMLDivElement>(null);
            // Layout effects observe committed DOM before the rate's passive
            // reset. A settled RTL rerender alone missed the retained frame.
            useLayoutEffect(() => {
                commits.push(region.current?.textContent ?? "");
            });
            return <div ref={region}><JobProgressCard job={job} cancellationPending={pending} onCancel={() => undefined} /></div>;
        }
        const job: StudioJobView = {
            id: "committed-rate", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation",
            status: "running", createdAt: 1, startedAt: 1,
            progress: {stage: "simulation", unit: "accepted plays", current: 10, total: 100},
        };
        const view = (value: StudioJobView, pending = false) => <MantineProvider><ObservedCard job={value} pending={pending} /></MantineProvider>;
        const rendered = render(view(job));
        try {
            now = 2_000;
            const advanced = {...job, progress: {...job.progress!, current: 20}};
            rendered.rerender(view(advanced));
            expect(screen.getByText(/Throughput: 10\.00 accepted plays\/s/)).toBeInTheDocument();
            let next: StudioJobView = advanced;
            if (transition === "cancelling" || transition === "queued") next = {...advanced, status: transition};
            else if (transition === "id" || transition === "projectId") next = {...advanced, [transition]: "new-owner"};
            else if (transition === "startedAt") next = {...advanced, startedAt: 3_000};
            else if (transition === "progress") next = {...advanced, progress: undefined};
            else if (transition === "stage" || transition === "unit") next = {...advanced, progress: {...advanced.progress, [transition]: "changed"}};
            else if (transition === "total") next = {...advanced, progress: {...advanced.progress, total: "unknown"}};
            else if (transition === "regression") next = {...advanced, progress: {...advanced.progress, current: 5}};
            else if (transition === "execution-and-progress") next = {...advanced, id: "new-owner", projectId: "/new-project", startedAt: 3_000, progress: {...advanced.progress, current: 30}};
            commits.length = 0;
            now = 3_000;
            rendered.rerender(view(next, transition === "pending"));
            expect(commits.length).toBeGreaterThan(0);
            expect(commits[0]).not.toMatch(/Throughput:|ETA:/);
            if (transition === "pending") expect(commits[0]).toContain("Sending cancellation request…");
            if (transition === "cancelling") expect(commits[0]).toContain("Cancellation requested; waiting for cleanup.");
            expect(screen.queryByText(/Throughput:/)).toBeNull();
        } finally {
            rendered.unmount();
            dateNow.mockRestore();
        }
    });

    it.each(["queued", "running"] as const)("describes a %s job honestly before its first progress sample", status => {
        const cancel = jest.fn();
        render(<MantineProvider><JobProgressCard job={{
            id: "no-sample", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation",
            status, createdAt: 1,
        }} onCancel={cancel} /></MantineProvider>);
        expect(screen.getByText(status === "queued" ? "Queued" : "Running")).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(screen.queryByText(/Throughput:/)).toBeNull();
        expect(screen.getByRole("button", {name: "Cancel"})).toBeEnabled();
        fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
        expect(cancel).toHaveBeenCalledWith("no-sample");
        if (status === "running") {
            expect(screen.queryByText("Queued")).toBeNull();
            expect(screen.getByText(/Progress is indeterminate/)).toBeInTheDocument();
        }
    });

    it.each(["id", "projectId", "startedAt"] as const)("does not carry a rate across a changed execution %s", field => {
        let now = 1_000;
        const dateNow = jest.spyOn(Date, "now").mockImplementation(() => now);
        const job: StudioJobView = {
            id: "rate-owner", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation",
            status: "running", createdAt: 1, startedAt: 1,
            progress: {stage: "Simulating", unit: "rounds", current: 10, total: 100},
        };
        try {
            const view = (value: StudioJobView) => <MantineProvider><JobProgressCard job={value} /></MantineProvider>;
            const {rerender} = render(view(job));
            now = 2_000;
            const advanced = {...job, progress: {...job.progress!, current: 20}};
            rerender(view(advanced));
            expect(screen.getByText(/Throughput: 10\.00 rounds\/s/)).toBeInTheDocument();
            now = 3_000;
            // Keep the very same progress object: execution identity itself must invalidate the rate.
            const next = {...advanced, [field]: field === "startedAt" ? 3_000 : "another-owner"};
            rerender(view(next));
            expect(screen.queryByText(/Throughput:/)).toBeNull();
            now = 4_000;
            rerender(view({...next, progress: {...next.progress!, current: 30}}));
            expect(screen.getByText(/Throughput: 10\.00 rounds\/s · ETA: 7000ms/)).toBeInTheDocument();
        } finally {
            dateNow.mockRestore();
        }
    });

    it.each(["pending", "cancelling"] as const)("removes the work ETA while cancellation is %s and cleanup is unmeasured", phase => {
        let now = 1_000;
        const dateNow = jest.spyOn(Date, "now").mockImplementation(() => now);
        const job: StudioJobView = {
            id: "cancel-rate", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation",
            status: "running", createdAt: 1, startedAt: 1,
            progress: {stage: "Simulating", unit: "rounds", current: 10, total: 100},
        };
        try {
            const view = (value: StudioJobView, pending = false) => <MantineProvider><JobProgressCard job={value} cancellationPending={pending} onCancel={() => undefined} /></MantineProvider>;
            const {rerender} = render(view(job));
            now = 2_000;
            const advanced = {...job, progress: {...job.progress!, current: 20}};
            rerender(view(advanced));
            expect(screen.getByText(/Throughput:/)).toBeInTheDocument();
            rerender(view({...advanced, status: phase === "cancelling" ? "cancelling" : "running"}, phase === "pending"));
            expect(screen.queryByText(/Throughput:/)).toBeNull();
            expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
            expect(screen.getByText(phase === "pending" ? "Sending cancellation request…" : "Cancellation requested; waiting for cleanup.")).toBeInTheDocument();
            // A rejected cancellation returns to running; two new observations are needed for a rate.
            now = 3_000;
            rerender(view(advanced));
            expect(screen.queryByText(/Throughput:/)).toBeNull();
            now = 4_000;
            rerender(view({...advanced, progress: {...advanced.progress, current: 30}}));
            expect(screen.getByText(/Throughput: 10\.00 rounds\/s/)).toBeInTheDocument();
        } finally {
            dateNow.mockRestore();
        }
    });

    it.each(["completed", "cancelled", "failed"] as const)("keeps the same %s region visible after later ancestor expansion, then releases layout observation", async status => {
        const layout = jobFocusLayout();
        const job = {id: "displaced", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation", status: "running" as const, createdAt: 1};
        const view = (terminal = false) => <MantineProvider><main><JobCard
            job={terminal ? {...job, status, result: {summary: "Retained result", outputs: [{label: "Report", downloadPath: "/report"}]}} : job}
            onCancel={() => undefined}
        /><button>Another task</button></main></MantineProvider>;
        const rendered = render(view());
        const region = screen.getByRole("region", {name: "simulation job displaced"});
        const geometry = layout.place(region, 100);
        try {
            screen.getByRole("button", {name: "Cancel"}).focus();
            rendered.rerender(view(true));
            expect(region).toHaveFocus();
            expect(layout.scroll).not.toHaveBeenCalled();
            const ancestor = region.closest("main")!;
            expect(layout.observing(ancestor)).toBe(true);
            // Completion already transferred focus. A separate later layout
            // notification displaces that unchanged region (saved y=994.75).
            geometry.moveTo(994.75);
            await layout.expand(ancestor);
            expect(region).toHaveFocus();
            expect(layout.scroll).toHaveBeenCalledTimes(1);
            expect(layout.scroll).toHaveBeenLastCalledWith({block: "nearest", inline: "nearest", behavior: "instant"});
            expect(layout.scroll.mock.instances[0]).toBe(region);
            geometry.moveTo(100);
            await layout.expand(ancestor);
            expect(layout.scroll).toHaveBeenCalledTimes(1);
            screen.getByRole("link", {name: "Download Report"}).focus();
            expect(layout.observing(ancestor)).toBe(false);
            geometry.moveTo(994.75);
            await layout.expand(ancestor);
            expect(screen.getByRole("link", {name: "Download Report"})).toHaveFocus();
            expect(layout.scroll).toHaveBeenCalledTimes(1);
            geometry.moveTo(100);
            region.focus();
            expect(layout.observing(ancestor)).toBe(true);
            rendered.unmount();
            expect(layout.observing(ancestor)).toBe(false);
        } finally {
            rendered.unmount();
            geometry.restore();
            layout.restore();
        }
    });

    it("cancels a queued visibility correction when a dialog takes focus after transfer", async () => {
        const layout = jobFocusLayout();
        const job = {id: "focus-race", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation", status: "running" as const, createdAt: 1};
        const view = (terminal = false) => <MantineProvider><main>
            <JobCard job={terminal ? {...job, status: "completed"} : job} onCancel={() => undefined} />
            <div role="dialog"><button>Dialog action</button></div>
        </main></MantineProvider>;
        const rendered = render(view());
        const region = screen.getByRole("region", {name: "simulation job focus-race"});
        const geometry = layout.place(region, 100);
        try {
            screen.getByRole("button", {name: "Cancel"}).focus();
            rendered.rerender(view(true));
            expect(region).toHaveFocus();
            geometry.moveTo(994.75);
            const dialogAction = screen.getByRole("button", {name: "Dialog action"});
            await layout.expand(region.closest("main")!, () => dialogAction.focus());
            expect(dialogAction).toHaveFocus();
            expect(layout.scroll).not.toHaveBeenCalled();
        } finally {
            rendered.unmount();
            geometry.restore();
            layout.restore();
        }
    });

    it.each(["control", "job", "dialog"])("does not steal focus or scroll on background completion when another %s owns focus", async owner => {
        const layout = jobFocusLayout();
        const job = {id: "background", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation", status: "running" as const, createdAt: 1};
        const view = (terminal = false) => <MantineProvider><main><JobCard job={terminal ? {...job, status: "failed"} : job} onCancel={() => undefined} />
            <button>Another control</button>
            <JobCard job={{...job, id: "other"}} onCancel={() => undefined} />
            <div role="dialog" aria-label="Another dialog"><button>Dialog action</button></div>
        </main></MantineProvider>;
        const rendered = render(view());
        const region = screen.getByRole("region", {name: "simulation job background"});
        const geometry = layout.place(region, 994.75);
        try {
            region.querySelector<HTMLButtonElement>("button")!.focus();
            let target = screen.getByRole("button", {name: "Another control"});
            if (owner === "dialog") target = screen.getByRole("button", {name: "Dialog action"});
            else if (owner === "job") target = screen.getByRole("region", {name: "simulation job other"}).querySelector<HTMLButtonElement>("button")!;
            target.focus();
            rendered.rerender(view(true));
            await layout.expand(region.closest("main")!);
            expect(target).toHaveFocus();
            expect(layout.scroll).not.toHaveBeenCalled();
        } finally {
            rendered.unmount();
            geometry.restore();
            layout.restore();
        }
    });

    it("keeps a keyboard reading position when the focused active card becomes its retained terminal", () => {
        const job = {id: "focus-job", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation", status: "running" as const, createdAt: 1};
        const {rerender} = render(<MantineProvider><JobCard job={job} onCancel={() => undefined} /></MantineProvider>);
        screen.getByRole("button", {name: "Cancel"}).focus();
        rerender(<MantineProvider><JobCard job={{...job, status: "cancelled"}} onCancel={() => undefined} /></MantineProvider>);
        expect(screen.getByRole("region", {name: "simulation job focus-job"})).toHaveFocus();
        expect(screen.getByText("simulation · Cancelled")).toBeInTheDocument();
    });
    it("keeps Cancel disabled while sending intent and explains executor cleanup after acceptance", () => {
        const job = {id: "pending", projectId: "/project", operation: "simulation", request: {}, conflictKey: "simulation", status: "running" as const, createdAt: 1};
        const {rerender} = render(<MantineProvider><JobProgressCard job={job} cancellationPending onCancel={() => undefined} /></MantineProvider>);
        expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
        expect(screen.getByText("Sending cancellation request…")).toBeInTheDocument();
        rerender(<MantineProvider><JobProgressCard job={{...job, status: "cancelling"}} cancellationPending onCancel={() => undefined} /></MantineProvider>);
        expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
        expect(screen.getByText("Cancellation requested; waiting for cleanup.")).toBeInTheDocument();
    });
    it("renders the persisted semantic stage and indeterminate unit without inventing a percentage", () => {
        render(<MantineProvider><JobProgressCard job={{
            id: "job-1", projectId: "/project", operation: "deployment", request: {}, conflictKey: "deployment",
            status: "running", createdAt: 1, progress: {stage: "Delivering", unit: "artifacts", current: 1, total: "unknown", message: "Waiting for delivery"},
        }} /></MantineProvider>);

        expect(screen.getByText("Delivering")).toBeInTheDocument();
        expect(screen.getByText("1 / unknown artifacts · Waiting for delivery")).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("calculates a bounded percentage from bigint-safe durable progress without Number precision loss", () => {
        render(<MantineProvider><JobProgressCard job={{
            id: "job-big", projectId: "/project", operation: "outcome-library-generation", request: {}, conflictKey: "generation",
            status: "running", createdAt: 1, startedAt: 1,
            progress: {stage: "Analyzing outcomes", unit: "outcome records", current: "9007199254740993", total: "18014398509481986"},
        }} /></MantineProvider>);

        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
        expect(screen.getByText(/Elapsed:/)).toBeInTheDocument();
    });

    it("shows throughput and ETA only after monotonic progress in the same stage with a stable known total", () => {
        let now = 1_000;
        const dateNow = jest.spyOn(Date, "now").mockImplementation(() => now);
        const job = (current: string, total = "20") => ({
            id: "job-rate", projectId: "/project", operation: "outcome-library-generation", request: {}, conflictKey: "generation",
            status: "running" as const, createdAt: 1, startedAt: 1,
            progress: {stage: "Writing outcomes", unit: "outcome records", current, total},
        });
        const {rerender} = render(<MantineProvider><JobProgressCard job={job("10")} /></MantineProvider>);

        expect(screen.queryByText(/Throughput:/)).toBeNull();
        now = 2_000;
        rerender(<MantineProvider><JobProgressCard job={job("15")} /></MantineProvider>);
        expect(screen.getByText(/Throughput: 5\.00 outcome records\/s · ETA: 1000ms/)).toBeInTheDocument();

        now = 3_000;
        rerender(<MantineProvider><JobProgressCard job={job("16", "25")} /></MantineProvider>);
        expect(screen.queryByText(/Throughput:/)).toBeNull();
        dateNow.mockRestore();
    });

    it("wraps the active operation controls instead of allowing a long stage to displace Cancel", () => {
        render(<MantineProvider><JobProgressCard onCancel={() => undefined} job={{
            id: "job-wrap", projectId: "/project", operation: "outcome-library-generation", request: {}, conflictKey: "generation",
            status: "running", createdAt: 1,
            progress: {stage: "A long but meaningful generation stage that must leave the cancellation control reachable", unit: "outcome records", current: "1", total: "2"},
        }} /></MantineProvider>);

        const controls = screen.getByRole("button", {name: "Cancel"}).closest(".mantine-Group-root") as HTMLElement;
        expect(controls.style.getPropertyValue("--group-wrap")).toBe("wrap");
    });
});
