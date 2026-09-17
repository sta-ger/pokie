import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {JobProgressCard} from "../../../../../../cli/studio-client/src/components/common/JobProgressCard";

describe("JobProgressCard", () => {
    it("renders the persisted semantic stage and indeterminate unit without inventing a percentage", () => {
        render(<MantineProvider><JobProgressCard job={{
            id: "job-1", projectId: "/project", operation: "deployment", request: {}, conflictKey: "deployment",
            status: "running", createdAt: 1, progress: {stage: "Delivering", unit: "artifacts", current: 1, total: "unknown", message: "Waiting for delivery"},
        }} /></MantineProvider>);

        expect(screen.getByText("Delivering")).toBeInTheDocument();
        expect(screen.getByText("1 / unknown artifacts · Waiting for delivery")).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).toBeNull();
    });
});
