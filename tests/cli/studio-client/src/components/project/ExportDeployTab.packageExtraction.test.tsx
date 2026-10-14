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
        // Successful activation acknowledges the reservation; subsequent GETs own progress/results.
        if (url.endsWith("/activate")) return response({});
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
    expect(builds).toEqual([{target: "blueprint", preparedOperationId: "reviewed-extraction", deferExecution: true}]);
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

it("ignores an obsolete job response after cancellation settles and the destination changes", async () => {
    let settle!: (value: Awaited<ReturnType<FetchLike>>) => void;
    let cancelled = false;
    const section = await open(transport((url, init) => {
        if (url.endsWith("/preview")) {
            const body = JSON.parse(String(init?.body)) as {outDir?: string};
            return response(preview(body.outDir));
        }
        if (url.endsWith("/build")) return response({status: "created", job: {id: "old", target: "blueprint", status: "queued", cancellationRequested: false}}, 202);
        if (url.endsWith("/cancel")) {
            cancelled = true;
            return response({id: "old", target: "blueprint", status: "cancelling", cancellationRequested: true});
        }
        if (cancelled) return response({id: "old", target: "blueprint", status: "cancelled", cancellationRequested: true,
            result: {status: "cancelled", message: "Cancelled before publication", plan: plan()}});
        return new Promise(resolve => {
            settle = resolve;
        });
    }));
    await within(section).findByText("Package model: complete (custom)");
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    await waitFor(() => expect(settle).toBeDefined());
    fireEvent.click(within(section).getByRole("button", {name: "Cancel"}));
    await within(section).findByText(/Build cancelled/);
    fireEvent.change(within(section).getByLabelText("Output file (optional)"), {target: {value: "/games/next.json"}});
    await within(section).findByText("Resolved absolute path: /games/next.json");
    await act(async () => settle(await response({id: "old", target: "blueprint", status: "completed", cancellationRequested: false,
        result: {status: "ok", outputPath: "/games/old.json", plan: plan()}})));
    expect(within(section).queryByText(/Built to \/games\/old.json/)).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", {name: "Open as Project"})).not.toBeInTheDocument();
});

it("retains cancellation while startup is pending and locks the destination until cleanup settles", async () => {
    let accept!: (value: Awaited<ReturnType<FetchLike>>) => void;
    let acknowledgeCancel!: (value: Awaited<ReturnType<FetchLike>>) => void;
    let finish = false;
    let builds = 0;
    let cancels = 0;
    let reads = 0;
    const activations: string[] = [];
    const fetchImpl = transport((url, init) => {
        if (url.endsWith("/preview")) return response(preview());
        if (url.endsWith("/build")) {
            expect(JSON.parse(String(init?.body))).toMatchObject({deferExecution: true});
            builds++;
            return new Promise(resolve => {
                accept = resolve;
            });
        }
        if (url.endsWith("/cancel")) {
            cancels++;
            return new Promise(resolve => {
                acknowledgeCancel = resolve;
            });
        }
        reads++;
        return response({id: "pending", target: "blueprint", status: finish ? "cancelled" : "running", cancellationRequested: finish,
            ...(finish ? {result: {status: "cancelled", message: "Cleanup settled", plan: plan()}} : {progress: {status: "running", message: "Waiting for descriptor"}})});
    });
    const section = await open((url, init) => {
        if (url.endsWith("/activate")) activations.push(url);
        return fetchImpl(url, init);
    });
    await within(section).findByText("Package model: complete (custom)");
    const save = within(section).getByRole("button", {name: "Save Blueprint"});
    const destination = within(section).getByLabelText("Output file (optional)");
    fireEvent.click(save);
    expect(destination).toBeDisabled();
    expect(within(section).getByRole("button", {name: "Browse…"})).toBeDisabled();
    fireEvent.change(destination, {target: {value: "/games/overlap.json"}});
    expect(destination).toHaveValue("");
    fireEvent.click(save);
    expect(builds).toBe(1);
    fireEvent.click(within(section).getByRole("button", {name: "Cancel"}));
    expect(await within(section).findByText(/Starting artifact build.*Cancellation requested/)).toBeInTheDocument();
    expect(within(section).getByRole("button", {name: "Cancel"})).toBeDisabled();
    expect(cancels).toBe(0);
    await act(async () => accept(await response({status: "created", job: {id: "pending", target: "blueprint", status: "queued", cancellationRequested: false}}, 202)));
    await waitFor(() => expect(cancels).toBe(1));
    // An older running view must not clear the local cancellation intent.
    expect(await within(section).findByText(/Waiting for descriptor.*Cancellation requested/)).toBeInTheDocument();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    expect(destination).toBeDisabled();
    finish = true;
    await act(async () => acknowledgeCancel(await response({id: "pending", target: "blueprint", status: "cancelling", cancellationRequested: true})));
    await within(section).findByText(/Build cancelled/);
    expect(destination).toBeEnabled();
    expect(cancels).toBe(1);
    expect(activations).toEqual([]);
    expect(within(section).queryByRole("button", {name: "Open as Project"})).not.toBeInTheDocument();
});

it.each(["cancelled", "failed"] as const)("keeps the running and cancelling destination owned until a %s terminal", async terminal => {
    let cancelled = false;
    let finish = false;
    let builds = 0;
    let cancellingReads = 0;
    const destinations: (string | undefined)[] = [];
    const section = await open(transport((url, init) => {
        if (url.endsWith("/preview")) {
            const body = JSON.parse(String(init?.body)) as {outDir?: string};
            destinations.push(body.outDir);
            return response(preview(body.outDir));
        }
        if (url.endsWith("/build")) {
            builds++;
            return response({status: "created", job: {id: "owned", target: "blueprint", status: "queued", cancellationRequested: false}}, 202);
        }
        if (url.endsWith("/cancel")) {
            cancelled = true;
            return response({id: "owned", target: "blueprint", status: "cancelling", cancellationRequested: true});
        }
        if (cancelled) cancellingReads++;
        // Losing a read during cleanup must not release ownership or stop polling.
        if (cancelled && cancellingReads === 1) return Promise.reject(new Error("Temporary poll failure"));
        const activeStatus = cancelled ? "cancelling" : "running";
        return response({id: "owned", target: "blueprint", status: finish ? terminal : activeStatus, cancellationRequested: cancelled,
            ...(finish ? {result: {status: terminal === "cancelled" ? "cancelled" : "error", message: "Descriptor failed", plan: plan()}} : {progress: {status: "running", message: cancelled ? "Releasing snapshot" : "Extracting descriptor"}})});
    }));
    await within(section).findByText("Package model: complete (custom)");
    const destination = within(section).getByLabelText("Output file (optional)");
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    await within(section).findByText(/Extracting descriptor/);
    fireEvent.change(destination, {target: {value: "/games/running.json"}});
    expect(destination).toBeDisabled();
    expect(destination).toHaveValue("");
    expect(within(section).getByRole("button", {name: "Save Blueprint"})).toBeDisabled();
    fireEvent.click(within(section).getByRole("button", {name: "Cancel"}));
    await within(section).findByText(/Releasing snapshot.*Cancellation requested/);
    fireEvent.change(destination, {target: {value: "/games/cancelling.json"}});
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    expect(destination).toBeDisabled();
    expect(destination).toHaveValue("");
    expect(within(section).getByRole("button", {name: "Browse…"})).toBeDisabled();
    expect(builds).toBe(1);
    expect(destinations).toEqual([undefined]);
    await waitFor(() => expect(cancellingReads).toBeGreaterThan(1));
    finish = true;
    await within(section).findByText(terminal === "cancelled" ? /Build cancelled/ : "Descriptor failed");
    expect(destination).toBeEnabled();
    expect(within(section).queryByRole("button", {name: "Open as Project"})).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", {name: "Add to Projects"})).not.toBeInTheDocument();
});

it("withholds successful actions when a completed read races requested cancellation", async () => {
    let finish = false;
    const section = await open(transport((url) => {
        if (url.endsWith("/preview")) return response(preview());
        if (url.endsWith("/build")) return response({status: "created", job: {id: "racing", target: "blueprint", status: "queued", cancellationRequested: false}}, 202);
        if (url.endsWith("/cancel")) {
            finish = true;
            return response({id: "racing", target: "blueprint", status: "completed", cancellationRequested: false});
        }
        return response({id: "racing", target: "blueprint", status: finish ? "completed" : "running", cancellationRequested: false,
            ...(finish ? {result: {status: "ok", target: "blueprint", outputPath: "/games/extracted.json", outputKind: "file", sourceType: "tsPackage", plan: plan()}} : {progress: {status: "running", message: "Publishing"}})});
    }));
    await within(section).findByText("Package model: complete (custom)");
    fireEvent.click(within(section).getByRole("button", {name: "Save Blueprint"}));
    await within(section).findByText("Publishing");
    fireEvent.click(within(section).getByRole("button", {name: "Cancel"}));
    await within(section).findByText(/completed before cancellation reached the server/);
    for (const name of ["Open as Project", "Add to Projects", "Open output folder"]) {
        expect(within(section).queryByRole("button", {name})).not.toBeInTheDocument();
    }
    expect(within(section).queryByText("Build completed")).not.toBeInTheDocument();
    expect(within(section).getByLabelText("Output file (optional)")).toBeEnabled();
});
