import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {readFileSync} from "node:fs";
import {join} from "node:path";
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

        expect(screen.getByRole("status")).toHaveTextContent("Imported successfully");
        expect(screen.getByText("Verified integrity")).toBeInTheDocument();
        expect(screen.getByText("Cancellation requested; waiting for cleanup.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Cancel"})).toBeNull();
        expect(screen.getByText(`Published output with ${LONG_VALUE}`)).toBeInTheDocument();
        expect(screen.getByText(`Published output with ${LONG_VALUE}`).closest(".mantine-Alert-root")).toBeTruthy();
    });

    it("ships the wide, compact, and phone responsive safeguards with local overflow containment", () => {
        const css = readFileSync(join(process.cwd(), "cli/studio-client/src/global.css"), "utf8");
        expect(css).toContain("max-width: 100%");
        expect(css).toContain("overflow-x: hidden");
        expect(css).toContain("@media (max-width: 75em)");
        expect(css).toContain("@media (max-width: 48em)");
        expect(css).toContain("--app-shell-navbar-offset: 0px !important");
    });
});
