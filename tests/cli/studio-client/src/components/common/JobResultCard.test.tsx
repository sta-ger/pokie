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
                    status: "ok", byteSize: 4096,
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
        expect(inspect).toHaveBeenCalledWith("outcomelibrary");
    });
});
