import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

const RESOLVE_REELS_URL = "/api/home/blueprints/reel-strip-generation-preview";

function createDeferredResolveReelsFetch(): {fetchImpl: FetchLike; resolve: (body: unknown) => void} {
    let resolver: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
    const fetchImpl: FetchLike = (url) => {
        if (url === RESOLVE_REELS_URL) {
            return new Promise((res) => {
                resolver = res;
            });
        }
        throw new Error(`unexpected fetch to ${url}`);
    };
    return {
        fetchImpl,
        resolve: (body) => resolver?.({ok: true, status: 200, json: () => Promise.resolve(body)}),
    };
}

async function switchToReelStripModeler(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("radio", {name: "Per-reel (Reel Strip Modeler)"}));
}

describe("BlueprintEditorPage - Reel Strip Modeler stale-response guard", () => {
    it("drops a late Resolve reels response if the blueprint was edited while the request was in flight", async () => {
        const user = userEvent.setup();
        const {fetchImpl, resolve} = createDeferredResolveReelsFetch();

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await switchToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Resolve reels"}));
        expect(await screen.findByText("Working…")).toBeInTheDocument();

        // An edit elsewhere in the form happens while the request is still in flight -- the Reel Strip
        // Modeler section must survive this (not remount/lose its pending request) exactly as the old
        // app's own imperative code did, since only formGeneration (New/Load/JSON-apply) should ever
        // tear down the Form subtree, not a routine field edit. The edit itself immediately resets the
        // preview back to idle (any edit invalidates a previously-shown/pending preview, matching the
        // old app exactly) -- so "Working…" disappearing here is the *first* layer of protection.
        await user.type(screen.getByLabelText("New symbol id"), "wild");
        // Several "Add symbol" buttons exist (the top-level Symbols section, plus one per literal reel
        // in the Reel Strip Modeler) -- the first is the top-level Symbols section's own.
        await user.click(screen.getAllByRole("button", {name: "Add symbol"})[0]);
        await waitFor(() => expect(screen.queryByText("Working…")).not.toBeInTheDocument());

        resolve({
            status: "ok",
            errors: [],
            warnings: [],
            reels: [
                {reelIndex: 0, type: "literal", strip: ["A", "B"], analysis: {length: 2, symbolCounts: {A: 1, B: 1}, symbolFrequencies: {}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {}}},
            ],
        });

        // Give the stale response a chance to (incorrectly) apply, then assert it never did -- this is
        // the *second*, load-bearing layer: isStaleReelStripGenerationRequest itself, which is what
        // must reject this specific response even though the component never unmounted.
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 20);
        });
        expect(screen.queryByText(/Sequence:/)).not.toBeInTheDocument();
        expect(screen.queryByText("Working…")).not.toBeInTheDocument();
    });

    it("applies the response normally when nothing else changed while it was in flight", async () => {
        const user = userEvent.setup();
        const {fetchImpl, resolve} = createDeferredResolveReelsFetch();

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await switchToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Resolve reels"}));
        expect(await screen.findByText("Working…")).toBeInTheDocument();

        resolve({
            status: "ok",
            errors: [],
            warnings: [],
            reels: [
                {
                    reelIndex: 0,
                    type: "literal",
                    strip: ["A", "B"],
                    analysis: {length: 2, symbolCounts: {A: 1, B: 1}, symbolFrequencies: {}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {}},
                },
            ],
        });

        await waitFor(() => {
            expect(screen.getByText("Sequence: A, B")).toBeInTheDocument();
        });
    });
});
