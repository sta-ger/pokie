import {fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {GameModelProjection} from "../../../../../../cli/studio-client/src/api/types";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService";
import {InMemoryRecentProjectsRepository} from "../../../../../../cli/studio/InMemoryRecentProjectsRepository";
import boundedExample from "../../../../../../examples/blueprints/bounded-cascade-respins-collection.blueprint.json";

// Design Game's own live "Preview Game Model" action (GameModelPreviewPanel.tsx) -- an on-demand POST
// against the editor's current in-memory draft, rendered through the exact same GameModelSections
// component the Project Workspace's Game Model tab uses (see that panel's own doc comment for why this
// is the third of the three surfaces acceptance criterion 3 asks to share one projection).

function respond(body: unknown) {
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
}

function unavailableProjection(): GameModelProjection {
    const reason = "no tracked source recorded";
    return {
        basics: {status: "available", data: {id: "starter", name: "Starter", version: "0.1.0"}},
        layout: {status: "unavailable", reason},
        symbols: {status: "unavailable", reason},
        reels: {status: "unavailable", reason},
        paytable: {status: "unavailable", reason},
        betsAndModes: {status: "unavailable", reason},
        mechanics: {status: "unavailable", reason},
        limits: {status: "unavailable", reason},
    };
}

describe("Guided Design Game: Game Model preview", () => {
    it.each([
        {mechanics: {respins: {grant: 2}}, path: "mechanics.respins.trigger"},
        {mechanics: {cascade: {maxCascades: {invalid: true}}}, path: "mechanics.cascade.maxCascades"},
        {mechanics: {collection: {...boundedExample.mechanics.collection, reset: {invalid: true}}}, path: "mechanics.collection.reset"},
    ])("keeps $path recoverable through the real preview service without saving or building", async ({mechanics, path}) => {
        const service = new StudioBlueprintService("1.3.0", process.cwd(), new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository()));
        const previews: unknown[] = [];
        const writes: string[] = [];
        const valid = {...boundedExample, mechanics: {...boundedExample.mechanics, collection: {...boundedExample.mechanics.collection, contribution: 0, payout: 0}}};
        const malformed = {...valid, mechanics};
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/symbol-artwork") return respond({artwork: {}});
            if (init?.method === "POST") {
                writes.push(url);
                const request = JSON.parse(init.body!);
                if (url === "/api/home/blueprints/validate") return respond(service.validate(request.blueprint));
                if (url === "/api/home/blueprints/game-model-preview") {
                    previews.push(request.blueprint);
                    return respond(JSON.parse(JSON.stringify(service.previewGameModel(request.blueprint))));
                }
                throw new Error(`Unexpected write: ${url}`);
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        fireEvent.click(screen.getByRole("button", {name: /Show advanced options/}));
        fireEvent.click(screen.getByLabelText("JSON"));
        for (const [index, draft] of [valid, malformed, valid, valid].entries()) {
            const authored = JSON.stringify(draft, null, 2);
            // Apply JSON intentionally remounts the JSON and preview panels. Re-query public
            // controls after each apply; the final preview reuses the repaired panel directly.
            if (index < 3) {
                fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: authored}});
                fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
            }
            const preview = screen.getByRole("button", {name: "Preview Game Model"});
            fireEvent.click(preview);
            const panel = screen.getByText("Game Model preview").closest("fieldset")!;
            await waitFor(() => expect(preview).toBeEnabled());
            expect(await within(panel).findByText(`Id: ${valid.manifest.id}`)).toBeVisible();
            expect(within(panel).getByText("Paytable")).toBeVisible();
            if (draft === malformed) {
                const alert = within(panel).getByRole("alert");
                expect(alert).toHaveTextContent("These mechanics can't be previewed yet. Correct the rule fields, then preview again. The authored draft is unchanged.");
                fireEvent.click(within(alert).getByText("Technical details"));
                expect(alert).toHaveTextContent(path);
                expect(within(panel).queryByText(/^Respins:/)).toBeNull();
                expect(within(panel).queryByText(/^Cascade:/)).toBeNull();
                expect(within(panel).queryByText(/^Collection:/)).toBeNull();
                expect(within(panel).queryByText("No mechanics/features configured.")).toBeNull();
            } else {
                expect(within(panel).queryByRole("alert")).toBeNull();
                expect(within(panel).getByText(/^Cascade: maximum/)).toBeVisible();
                expect(within(panel).getByText(/^Respins: trigger symbol/)).toBeVisible();
                expect(within(panel).getByText(/^Collection: symbol/)).toHaveTextContent(/contribution 0 per symbol;.*payout 0/);
            }
            expect(screen.getByLabelText("Blueprint JSON")).toHaveValue(authored);
        }
        expect(previews).toEqual([valid, malformed, valid, valid]);
        expect(writes.every(url => ["/api/home/blueprints/validate", "/api/home/blueprints/game-model-preview"].includes(url))).toBe(true);
    });

    it("shows the projection returned by POST /api/home/blueprints/game-model-preview after clicking Preview Game Model", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/game-model-preview" && init?.method === "POST") {
                return respond(unavailableProjection());
            }
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await user.click(screen.getByRole("button", {name: "Preview Game Model"}));

        expect(await screen.findByText("Id: starter")).toBeInTheDocument();
        expect(screen.getAllByText("This part of the Game Model isn't available yet. Check the game design, then try viewing the Game Model again.").length).toBeGreaterThan(0);
        const details = screen.getAllByText("no tracked source recorded").map((reason) => reason.closest("details"));
        expect(details).not.toHaveLength(0);
        expect(details.every((detail) => detail !== null && !detail.hasAttribute("open"))).toBe(true);
    });

    it("shows a recovery message, never a raw stack trace, when the preview request fails", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/game-model-preview" && init?.method === "POST") {
                return Promise.resolve({ok: false, status: 500, json: () => Promise.resolve({error: "boom"})});
            }
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await user.click(screen.getByRole("button", {name: "Preview Game Model"}));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("We couldn't build this game model preview. Check the game design, then try previewing it again.");
        const details = screen.getByText("Technical details").closest("details");
        expect(details).not.toHaveAttribute("open");
        expect(details).toHaveTextContent("boom");
    });
});
