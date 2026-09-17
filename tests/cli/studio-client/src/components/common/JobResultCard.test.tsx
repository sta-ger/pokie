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
});
