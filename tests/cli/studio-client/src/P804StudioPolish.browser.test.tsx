import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {JobProgressCard} from "../../../../cli/studio-client/src/components/common/JobProgressCard";
import {JobResultCard} from "../../../../cli/studio-client/src/components/common/JobResultCard";
import {OutcomeBanner} from "../../../../cli/studio-client/src/components/common/OutcomeBanner";

const LONG_VALUE = `sha256:${"a".repeat(64)}`;

function renderStudio(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("P8-04 Studio polish browser surface", () => {
    it("keeps integrity success, durable progress, and a completed long-content result distinct in the rendered product surface", () => {
        renderStudio(
            <>
                <OutcomeBanner
                    color="green"
                    icon={null}
                    title="Imported successfully"
                    errors={[]}
                    warnings={[]}
                    information={[{code: "parsheet-provenance-present", message: "The recorded hash matches the imported data."}]}
                    informationTitle="Verified integrity"
                />
                <JobProgressCard job={{
                    id: "running", projectId: "/projects/long", operation: "Generate outcome library", request: {}, conflictKey: "generation",
                    status: "cancelling", createdAt: 1, startedAt: 1, progress: {stage: "Cleaning up", unit: "files", current: 1, total: 2},
                }} />
                <JobResultCard job={{
                    id: "completed", projectId: "/projects/long", operation: "Generate outcome library", request: {}, conflictKey: "generation",
                    status: "completed", createdAt: 1, completedAt: 2,
                    result: {summary: `Published output with ${LONG_VALUE}`, outputs: [{label: "Long output", path: `/projects/${LONG_VALUE}/out`}]},
                }} />
            </>,
        );

        expect(screen.getAllByRole("status")[0]).toHaveTextContent("Imported successfully");
        expect(screen.getByText("Verified integrity")).toBeInTheDocument();
        expect(screen.getByText("Cancellation requested; waiting for cleanup.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Cancel"})).toBeNull();
        expect(screen.getByText(`Published output with ${LONG_VALUE}`)).toBeInTheDocument();
        expect(screen.getByText(`Published output with ${LONG_VALUE}`).closest(".mantine-Alert-root")).toBeTruthy();
    });

    it("gives every durable terminal state an observable semantic result rather than silently unmounting it", () => {
        renderStudio(
            <>
                {(["cancelled", "failed", "recovery-required", "completed"] as const).map((status) => (
                    <JobResultCard key={status} onRecoveryAction={() => undefined} job={{
                        id: status, projectId: "/project", operation: "Generate outcome library", request: {destination: LONG_VALUE}, conflictKey: status,
                        status, createdAt: 1, error: status === "failed" ? LONG_VALUE : undefined,
                        result: status === "failed" ? undefined : {summary: `${status} ${LONG_VALUE}`},
                        recovery: status === "recovery-required" ? {action: "retry", reason: "Retry from the retained request."} : undefined,
                    }} />
                ))}
            </>,
        );

        expect(screen.getByRole("alert")).toHaveTextContent("failed");
        expect(screen.getAllByRole("status")).toHaveLength(3);
        expect(screen.getByRole("button", {name: "Retry"})).toBeInTheDocument();
        expect(screen.getByText(`cancelled ${LONG_VALUE}`)).toBeInTheDocument();
        expect(screen.getByText(`completed ${LONG_VALUE}`)).toBeInTheDocument();
    });
});
