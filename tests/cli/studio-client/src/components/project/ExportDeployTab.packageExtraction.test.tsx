import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {
    PackageBlueprintExtractionResult,
    StudioArtifactConversionPlan,
} from "../../../../../../cli/studio-client/src/api/types";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

function extraction(status: PackageBlueprintExtractionResult["status"] = "complete"): PackageBlueprintExtractionResult {
    return {
        schemaVersion: 1,
        status,
        blueprintHash: "sha256:reviewed-model",
        source: {kind: "custom", location: "/games/source", gameId: "real-game", descriptorVersion: 1},
        diagnostics:
            status === "complete"
                ? []
                : [{path: "mechanics", code: "opaque-feature", message: "Feature behavior is unavailable."}],
        fields: [
            {path: "reels", status: "exact", authority: "public descriptor"},
            {path: "declaredHint", status: "inferred", authority: "supplied inference"},
            {path: "winModel", status: "defaulted", authority: "declared default lines"},
            {path: "mechanics.custom", status: "unsupported", authority: "opaque custom feature"},
        ],
        comparisonLimits: ["Custom declarations do not prove arbitrary TypeScript losslessness."],
    };
}
function plan(model = extraction()): StudioArtifactConversionPlan {
    return {
        status: model.status === "complete" ? "planned" : "unavailable",
        source: {kind: "tsPackage", capabilities: [], configurationProvenance: {inputBindingHash: "sha256:reviewed-source"}},
        target: {kind: "blueprint", capabilities: []},
        steps: [
            {
                kind: "extractPackageModel",
                choice: "materialize",
                estimatedWork: "read",
                output: {kind: "blueprint", capabilities: []},
            },
        ],
        preflight: {destinationKind: "file", estimatedWork: "read", losses: [], oneWay: false},
        packageExtraction: model,
    };
}
function response(body: unknown, status = 200): ReturnType<FetchLike> {
    return Promise.resolve({ok: true, status, json: () => Promise.resolve(body)});
}
function transport(handler: FetchLike, sourcePlan = plan()): FetchLike {
    return (url, init) => {
        const request = url.split("?")[0];
        if (request === "/api/project/jobs") return response({jobs: []});
        if (request === "/api/home/fs/browse") return response({status: "error", reason: "absent", error: "Path does not exist", resolvedPath: "/games"});
        if (request === "/api/home/fs/native-browse/availability") return response({status: "unavailable", reason: "Fixture has no native picker"});
        if (request === "/api/project/context") return response({
            status: "loaded",
            projectRoot: "/games/source",
            type: "tsPackage",
            game: {id: "real-game", name: "Real Game", version: "1"},
            capabilities: ["runtime.execute"],
        });
        if (request === "/api/project/inspect") return response({valid: true, packageRoot: "/games/source", generated: false});
        if (["/api/project/reports", "/api/project/replays", "/api/project/deployment/targets"].includes(request)) return response([]);
        if (request === "/api/project/outcome-libraries/generate/estimate") return response({status: "unsupported", error: "No enumeration capability in fixture", plan: sourcePlan});
        if (request === "/api/project/artifacts/targets") return response([
            {
                target: "blueprint",
                supported: sourcePlan.status === "planned",
                state: sourcePlan.status === "planned" ? "supported" : "diagnostic-required",
                diagnostic: "Public model extraction is incomplete.",
                unsupportedNotes: [],
                plan: sourcePlan,
            },
        ]);
        return handler(url, init);
    };
}
async function open(fetchImpl: FetchLike): Promise<HTMLElement> {
    renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
    await screen.findByRole("heading", {name: "Real Game"});
    fireEvent.click(screen.getByRole("button", {name: "Build/Export"}));
    return (await screen.findByText("Build artifact")).closest("fieldset") as HTMLElement;
}
function preview(destination = "/games/extracted.json") {
    return {
        status: "ok",
        target: "blueprint",
        destination,
        destinationKind: "file",
        plannedOutputs: ["Blueprint and extraction evidence"],
        sourceType: "tsPackage",
        preparedOperationId: "reviewed-extraction",
        plan: plan(),
    };
}

it.each(["partial", "unsupported"] as const)(
    "shows field diagnostics and comparison boundaries for %s package models",
    async (status) => {
        const section = await open(transport(() => response({}), plan(extraction(status))));
        expect(await within(section).findByText(`Package model: ${status} (custom)`)).toBeInTheDocument();
        expect(within(section).getByText(/opaque-feature: Feature behavior is unavailable/)).toBeInTheDocument();
        expect(within(section).getByText(/do not prove arbitrary TypeScript losslessness/)).toBeInTheDocument();
        expect(within(section).queryByRole("button", {name: "Save Blueprint"})).not.toBeInTheDocument();
    },
);

it("previews extraction, builds a separate artifact and opens its returned Blueprint identity", async () => {
    let opened: string | undefined;
    const builds: unknown[] = [];
    const fetchImpl = transport((url, init) => {
        const request = url.split("?")[0];
        if (request === "/api/project/artifacts/preview") return response(preview());
        if (request === "/api/project/artifacts/build") {
            builds.push(JSON.parse(String(init?.body)));
            return response(
                {
                    status: "created",
                    job: {id: "extraction", target: "blueprint", status: "queued", cancellationRequested: false},
                },
                202,
            );
        }
        if (request === "/api/project/artifacts/build/extraction") return response({
            id: "extraction",
            target: "blueprint",
            status: "completed",
            cancellationRequested: false,
            result: {
                status: "ok",
                target: "blueprint",
                outputPath: "/games/extracted.json",
                outputKind: "file",
                sourceType: "tsPackage",
                conversionEvidencePath: "/games/extracted.json.conversion-evidence.json",
                plan: plan(),
            },
        });
        if (request === "/api/home/projects/open") {
            opened = (JSON.parse(String(init?.body)) as {projectRoot: string}).projectRoot;
            return response({status: "ok", context: {mode: "project", projectRoot: opened}});
        }
        return response({});
    });
    const section = await open(fetchImpl);
    expect(await within(section).findByText("Package model: complete (custom)")).toBeInTheDocument();
    expect(within(section).getByText(/winModel: defaulted/)).toBeInTheDocument();
    expect(builds).toEqual([]);
    for (const field of ["reels: exact — public descriptor", "declaredHint: inferred — supplied inference", "mechanics.custom: unsupported — opaque custom feature"]) expect(within(section).getByText(field)).toBeInTheDocument();
    expect(within(section).getByText(/Source: \/games\/source/)).toBeInTheDocument();
    expect(within(section).getByText(/Conversion evidence:.*Preview publishes no files/)).toBeInTheDocument();
    expect(within(section).getByText("Source binding: sha256:reviewed-source")).toBeInTheDocument();
    expect(within(section).getByText("Extracted Blueprint hash: sha256:reviewed-model")).toBeInTheDocument();
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    expect(await within(section).findByText(/Built to \/games\/extracted.json/)).toBeInTheDocument();
    expect(builds).toEqual([{target: "blueprint", preparedOperationId: "reviewed-extraction"}]);
    fireEvent.click(within(section).getByRole("button", {name: "Open as Project"}));
    await waitFor(() => expect(opened).toBe("/games/extracted.json"));
});

it("cancels extraction through the durable job and exposes no successful result action", async () => {
    let cancelled = false;
    let cancellingReads = 0;
    const section = await open(
        transport((url) => {
            if (url.includes("/preview")) return response(preview());
            if (url.endsWith("/cancel")) {
                cancelled = true;
                return response({
                    id: "extraction",
                    target: "blueprint",
                    status: "running",
                    cancellationRequested: true,
                });
            }
            if (url.endsWith("/build")) return response(
                {
                    status: "created",
                    job: {id: "extraction", target: "blueprint", status: "queued", cancellationRequested: false},
                },
                202,
            );
            if (cancelled) cancellingReads++;
            const cancelStatus = cancellingReads < 3 ? "cancelling" : "cancelled";
            return response({
                id: "extraction",
                target: "blueprint",
                status: cancelled ? cancelStatus : "running",
                cancellationRequested: cancelled,
                ...(cancelled
                    ? {result: {status: "cancelled", message: "Cancelled before publication", plan: plan()}}
                    : {progress: {status: "running", message: "Extracting public model"}}),
            });
        }),
    );
    await within(section).findByText("Package model: complete (custom)");
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    fireEvent.click(await within(section).findByRole("button", {name: "Cancel"}));
    expect(
        await within(section).findByText(/Build cancelled\. No incomplete artifact was published/),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("button", {name: "Open as Project"})).not.toBeInTheDocument();
});

it("suppresses a stale extraction preview after changing the destination", async () => {
    let resolveFirst: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    let reads = 0;
    const section = await open(
        transport((_url, init) => {
            reads++;
            if (reads === 1) return new Promise((resolve) => {
                resolveFirst = resolve;
            });
            const request = JSON.parse(String(init?.body)) as {outDir: string};
            return response(preview(request.outDir));
        }),
    );
    await waitFor(() => expect(resolveFirst).toBeDefined());
    fireEvent.change(within(section).getByLabelText("Output file (optional)"), {
        target: {value: "/games/current.json"},
    });
    expect(await within(section).findByText("Resolved absolute path: /games/current.json")).toBeInTheDocument();
    await act(() =>
        resolveFirst!({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    status: "unsupported",
                    target: "blueprint",
                    message: "stale opaque diagnosis",
                    plan: plan(extraction("unsupported")),
                }),
        }),
    );
    expect(within(section).queryByText(/stale opaque diagnosis/)).not.toBeInTheDocument();
    expect(within(section).getByText("Package model: complete (custom)")).toBeInTheDocument();
});

it("ignores an old job response after selecting another extraction destination", async () => {
    let settle!: (value: Awaited<ReturnType<FetchLike>>) => void;
    const section = await open(transport((url, init) => {
        if (url.endsWith("/preview")) {
            const body = JSON.parse(String(init?.body)) as {outDir?: string};
            return response(preview(body.outDir));
        }
        if (url.endsWith("/build")) return response({status: "created", job: {id: "old", target: "blueprint", status: "queued", cancellationRequested: false}}, 202);
        return new Promise(resolve => {
            settle = resolve;
        });
    }));
    await within(section).findByText("Package model: complete (custom)");
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    await waitFor(() => expect(settle).toBeDefined());
    fireEvent.change(within(section).getByLabelText("Output file (optional)"), {target: {value: "/games/next.json"}});
    await within(section).findByText("Resolved absolute path: /games/next.json");
    await act(async () => settle(await response({id: "old", target: "blueprint", status: "completed", cancellationRequested: false,
        result: {status: "ok", outputPath: "/games/old.json", plan: plan()}})));
    expect(within(section).queryByText(/Built to \/games\/old.json/)).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", {name: "Open as Project"})).not.toBeInTheDocument();
});

it("invalidates a rejected extraction preview and waits for a new preview before saving again", async () => {
    let previewReads = 0;
    let settle!: (value: Awaited<ReturnType<FetchLike>>) => void;
    const section = await open(transport(url => {
        if (url.endsWith("/preview")) {
            if (++previewReads === 1) return response(preview());
            return new Promise(resolve => {
                settle = resolve;
            });
        }
        return Promise.resolve({ok: false, status: 409, json: () => Promise.resolve({error: "Source changed; refresh the preview"})});
    }));
    await within(section).findByText("Package model: complete (custom)");
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    await waitFor(() => expect(previewReads).toBe(2));
    expect(within(section).getByRole("button", {name: "Build"})).toBeDisabled();
    expect(within(section).queryByRole("button", {name: "Open as Project"})).not.toBeInTheDocument();
    await act(async () => settle(await response(preview())));
    expect(await within(section).findByRole("button", {name: "Save Blueprint"})).toBeEnabled();
});

it("does not show an open action for a failed job carrying an inconsistent success payload", async () => {
    const section = await open(transport(url => {
        if (url.endsWith("/preview")) return response(preview());
        if (url.endsWith("/build")) return response({status: "created", job: {id: "failure", target: "blueprint", status: "queued", cancellationRequested: false}}, 202);
        return response({id: "failure", target: "blueprint", status: "failed", cancellationRequested: false,
            result: {status: "ok", outputPath: "/games/unpublished.json", plan: plan()}});
    }));
    await within(section).findByText("Package model: complete (custom)");
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    await within(section).findByText("Artifact job failed without confirming a successful publication.");
    expect(within(section).queryByRole("button", {name: "Open as Project"})).not.toBeInTheDocument();
    expect(within(section).queryByText(/Built to/)).not.toBeInTheDocument();
});
