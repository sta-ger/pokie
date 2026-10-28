import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import type {MathDefinitionDiff} from "../../../../../../cli/studio-client/src/api/types";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {MathDefinitionDiffPreview} from "../../../../../../cli/studio-client/src/components/common/MathDefinitionDiffPreview";
import {GameModelPreviewPanel} from "../../../../../../cli/studio-client/src/components/blueprintEditor/GameModelPreviewPanel";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {renderWithProviders} from "../../testUtils/renderWithProviders";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const result = (status: MathDefinitionDiff["status"] = "identical"): MathDefinitionDiff => ({
    schemaVersion: 1,
    comparisonKind: "math-definition",
    status,
    scope: "declared-effective-model",
    left: {identity: {kind: "blueprint", location: "/a"}, support: "complete", fields: [], diagnostics: [], limits: []},
    right: {
        identity: {kind: "blueprint", location: "/b"},
        support: status === "partial" ? "partial" : "complete",
        fields: [],
        diagnostics: [],
        limits: status === "partial" ? ["custom declaration only"] : [],
    },
    changes:
        status === "different"
            ? [
                {
                    path: "/paytable/A/3",
                    classification: "mathematical",
                    mathematical: true,
                    seededTraceImpact: false,
                    before: {
                        present: false,
                        provenance: {authority: "descriptor", status: "authored", authored: {present: false}},
                    },
                    after: {
                        present: true,
                        value: 0.05,
                        provenance: {
                            authority: "descriptor",
                            status: "authored",
                            authored: {present: true, value: 0.05},
                        },
                    },
                },
            ]
            : [],
});
const respond = (body: unknown, ok = true) =>
    Promise.resolve({ok, status: ok ? 200 : 400, json: () => Promise.resolve(body)});

it.each(["identical", "different", "partial", "unsupported", "invalid", "failed", "cancelled"] as const)(
    "renders the server's %s result and makes only a preview call",
    async (status) => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            calls.push(url);
            expect(JSON.parse(init!.body!)).toMatchObject({leftPath: "/a", revision: 3, draft: {}});
            return respond(result(status));
        };
        render(
            <StudioApiProvider fetchImpl={fetchImpl}>
                <MathDefinitionDiffPreview sourcePath="/a" draft={{}} revision={3} />
            </StudioApiProvider>,
        );
        fireEvent.click(screen.getByText("Compare saved versus draft"));
        await screen.findByText(`Definition comparison: ${status}`);
        if (status === "different") {
            expect(screen.getByText("/paytable/A/3 [mathematical]")).toBeInTheDocument();
            expect(screen.getByText(/"present": false/)).toBeInTheDocument();
        }
        if (status === "partial") expect(screen.getByText("Limit: custom declaration only")).toBeInTheDocument();
        expect(calls).toEqual(["/api/math-definition-diff/preview"]);
    },
);
it("shows actionable transport failures and cancellation", async () => {
    const fetchImpl: FetchLike = () => respond({error: "Source missing"}, false);
    const view = render(
        <StudioApiProvider fetchImpl={fetchImpl}>
            <MathDefinitionDiffPreview sourcePath="/a" draft={{}} />
        </StudioApiProvider>,
    );
    fireEvent.click(screen.getByText("Compare saved versus draft"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Source missing");
    view.unmount();
    let settle!: (body: Awaited<ReturnType<FetchLike>>) => void;
    const pending: FetchLike = () =>
        new Promise((resolve) => {
            settle = resolve;
        });
    render(
        <StudioApiProvider fetchImpl={pending}>
            <MathDefinitionDiffPreview sourcePath="/a" draft={{}} />
        </StudioApiProvider>,
    );
    fireEvent.click(screen.getByText("Compare saved versus draft"));
    expect(screen.getByText("Comparing definitions…")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel comparison"));
    await act(async () => {
        settle(await respond(result("different")));
    });
    expect(screen.getByText(/Comparison cancelled/)).toBeInTheDocument();
    expect(screen.queryByText("Definition comparison: different")).not.toBeInTheDocument();
});
it.each(["edit", "project", "new comparison", "unmount"])(
    "discards a late result after %s even when fetch ignores cancellation",
    async (action) => {
        const pending: ((value: Awaited<ReturnType<FetchLike>>) => void)[] = [];
        const signals: AbortSignal[] = [];
        const fetchImpl: FetchLike = (_url, init) => {
            signals.push(init!.signal!);
            return new Promise((resolve) => {
                pending.push(resolve);
            });
        };
        const wrap = (sourcePath: string, revision: number) => (
            <StudioApiProvider fetchImpl={fetchImpl}>
                <MathDefinitionDiffPreview
                    sourcePath={sourcePath}
                    projectRoot={sourcePath}
                    draft={{}}
                    revision={revision}
                />
            </StudioApiProvider>
        );
        const view = render(wrap("/a", 0));
        fireEvent.click(screen.getByText("Compare saved versus draft"));
        if (action === "edit") view.rerender(wrap("/a", 1));
        if (action === "project") view.rerender(wrap("/c", 0));
        if (action === "unmount") view.unmount();
        if (action === "new comparison") {
            fireEvent.click(screen.getByText("Compare saved versus draft"));
            await act(async () => {
                pending[1](await respond(result("identical")));
            });
        }
        expect(signals[0].aborted).toBe(true);
        await act(async () => {
            pending[0](await respond(result("different")));
        });
        expect(screen.queryByText("Definition comparison: different")).not.toBeInTheDocument();
    },
);
it("is reachable in editor preview and project Game Model with no implicit save or build", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = (url) => {
        calls.push(url);
        return respond(result());
    };
    const editor = renderWithProviders(<GameModelPreviewPanel sourcePath="/saved" blueprint={{}} revision={2} />, {
        fetchImpl,
    });
    fireEvent.click(screen.getByText("Compare saved versus draft"));
    await screen.findByText("Definition comparison: identical");
    expect(calls).toEqual(["/api/math-definition-diff/preview"]);
    editor.unmount();
    const projectFetch: FetchLike = (url) => {
        calls.push(url);
        if (url === "/api/project/context") return respond({
            status: "loaded",
            projectRoot: "/saved",
            type: "blueprint",
            capabilities: [],
            game: {id: "g", name: "Game", version: "1"},
        });
        if (url.startsWith("/api/project/gameModel")) return respond(
            Object.fromEntries(
                ["basics", "layout", "symbols", "reels", "paytable", "betsAndModes", "mechanics", "limits"].map(
                    (key) => [key, {status: "unavailable", reason: "unavailable"}],
                ),
            ),
        );
        if (url === "/api/math-definition-diff/preview") return respond(result());
        return respond({jobs: []});
    };
    renderRoutedApp({fetchImpl: projectFetch, initialEntries: ["/project/gameModel"]});
    await screen.findByLabelText("Compare with saved source");
    fireEvent.change(screen.getByLabelText("Compare with saved source"), {target: {value: "/other"}});
    fireEvent.click(screen.getByText("Compare definitions"));
    await waitFor(() => expect(calls.filter((url) => url === "/api/math-definition-diff/preview")).toHaveLength(2));
    expect(calls.some((url) => (/\/(save|save-managed|build|build-preview)$/).test(url.split("?")[0]))).toBe(false);
});


it("discloses each comparison side's analysis independently without hiding its support or diagnostic", async () => {
    const {advancedUnknownReport} = await import("../../../../../v2/fixtures/AdvancedModelReport");
    const diff = result("partial");
    diff.left.advanced = advancedUnknownReport();
    diff.right.advanced = {...advancedUnknownReport(), limitations: ["Right-only unfinished frontier"]};
    const calls: string[] = [];
    const fetchImpl: FetchLike = url => {
        calls.push(url);
        return respond(diff);
    };
    renderWithProviders(<MathDefinitionDiffPreview sourcePath="/a" draft={{}} />, {fetchImpl});
    fireEvent.click(screen.getByText("Compare saved versus draft"));
    expect(await screen.findByText("Definition comparison: partial")).toBeVisible();
    expect(screen.getByText("Limit: custom declaration only")).toBeVisible();
    expect(screen.getByText("Right-only unfinished frontier")).not.toBeVisible();
    const toggles = screen.getAllByRole("button", {name: "Show model analysis details"});
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[1]);
    expect(screen.getByText("Right-only unfinished frontier")).toBeVisible();
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", {name: "Hide model analysis details"}));
    expect(screen.getByText("Right-only unfinished frontier")).not.toBeVisible();
    expect(calls).toEqual(["/api/math-definition-diff/preview"]);
});
