import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {GameModelProjection} from "../../../../../../cli/studio-client/src/api/types";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

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
