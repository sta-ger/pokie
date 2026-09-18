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

    it("calculates a bounded percentage from bigint-safe durable progress without Number precision loss", () => {
        render(<MantineProvider><JobProgressCard job={{
            id: "job-big", projectId: "/project", operation: "outcome-library-generation", request: {}, conflictKey: "generation",
            status: "running", createdAt: 1, startedAt: 1,
            progress: {stage: "Analyzing outcomes", unit: "outcome records", current: "9007199254740993", total: "18014398509481986"},
        }} /></MantineProvider>);

        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
        expect(screen.getByText(/Elapsed:/)).toBeInTheDocument();
    });
});
