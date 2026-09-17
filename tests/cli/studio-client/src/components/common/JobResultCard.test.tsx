import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen} from "@testing-library/react";
import {JobResultCard} from "../../../../../../cli/studio-client/src/components/common/JobResultCard";

describe("JobResultCard", () => {
    it("offers only the server-supported resume action and retained safe output link", () => {
        const recover = jest.fn();
        render(<MantineProvider><JobResultCard onRecover={recover} job={{
            id: "job-1", projectId: "/project", operation: "outcome-library-generation", request: {}, conflictKey: "generation",
            status: "recovery-required", createdAt: 1, completedAt: 2, durationMs: 1,
            result: {summary: "Checkpoint retained", outputs: [{label: "Bundle", path: "/tmp/bundle", downloadPath: "/api/download/bundle"}]},
            recovery: {action: "resume", reason: "Exact checkpoint is valid."},
        }} /></MantineProvider>);

        expect(screen.getByRole("link", {name: "Bundle"})).toHaveAttribute("href", "/api/download/bundle");
        fireEvent.click(screen.getByRole("button", {name: "Resume"}));
        expect(recover).toHaveBeenCalledWith("job-1");
    });
});
