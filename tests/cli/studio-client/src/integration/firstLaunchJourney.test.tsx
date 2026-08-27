import {fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../testUtils/fakeFetch";
import {renderRoutedApp} from "../testUtils/renderRoutedApp";

// This deliberately uses the routed application instead of rendering an isolated dialog: it protects
// the first visit's visible explanation, start choices, a recoverable bad import, and the create ->
// project-scoped workspace transition as one designer journey.
describe("clean first-launch journey", () => {
    it("explains the choices, recovers from an unrecognized game, and opens the saved game workspace", async () => {
        const user = userEvent.setup();
        const projectRoot = "/games/starter-slot.json";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/projects/registry/preview": () => ({ok: true, status: 200, body: {status: "unrecognized", path: "/not-a-game"}}),
            "/api/home/blueprints/save-managed": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    path: projectRoot,
                    blueprintHash: "saved-hash",
                    registeredProject: {location: projectRoot, name: "Starter Slot", type: "blueprint", capabilities: [], origin: "managed", lastOpenedAt: "2026-08-27T00:00:00.000Z", status: "ok"},
                },
            }),
            "/api/home/projects/open": () => ({ok: true, status: 200, body: {context: {mode: "project", projectRoot}}}),
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot, game: {id: "starter-slot", name: "Starter Slot", version: "1.0.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: projectRoot, valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/"]});

        expect(await screen.findByText(/Start with the ready-to-edit starter game/i)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Projects"}));
        expect(await screen.findByText("Add a game you already have")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Game location"), "/not-a-game");
        await user.click(screen.getByRole("button", {name: "Check game"}));
        expect(await screen.findByText(/Choose another game folder or game-design file, then try again/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Start a game"}));
        await user.click(screen.getByRole("button", {name: "Choose a different start"}));
        expect(await screen.findByRole("button", {name: "Use the starter game"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Start with a blank game"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Generate random"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open a saved game design"})).toBeInTheDocument();
        await user.keyboard("{Escape}");

        fireEvent.click(screen.getByRole("button", {name: "Create game"}));
        await waitFor(() => expect(calls.some((call) => call.url === "/api/home/blueprints/save-managed")).toBe(true));
        expect(await screen.findByRole("heading", {name: "Starter Slot"})).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(projectRoot)}/overview`);
    });
});
