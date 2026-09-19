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
});
