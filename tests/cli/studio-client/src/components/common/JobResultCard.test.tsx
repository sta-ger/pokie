import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen} from "@testing-library/react";
import {JobResultCard} from "../../../../../../cli/studio-client/src/components/common/JobResultCard";

describe("JobResultCard", () => {
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
});
