import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {RoundArtifactJson, StudioRuntimeSessionView} from "../../../../../../cli/studio-client/src/api/types";
import {RoundArtifactInspector} from "../../../../../../cli/studio-client/src/components/common/RoundArtifactInspector";
import {describeRoundArtifact} from "../../../../../../cli/studio-client/src/domain/interpret/Replay";
import {deriveWinHighlightsFromRoundArtifactWins} from "../../../../../../cli/client/player/videoSlotRoundView";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
};

function sessionFor(overrides: Partial<StudioRuntimeSessionView> = {}): StudioRuntimeSessionView {
    return {sessionId: "sess-1", game: GAME, credits: 1000, ...overrides};
}

async function goToPlayTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Play"}));
}

describe("ProjectDashboardPage - Play", () => {
    it("creates a real session directly through Studio's own API -- never the Runtime tab's server-start route -- with no host/port/server URL shown", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);

        await user.click(await screen.findByRole("button", {name: "New Play session"}));

        await screen.findByRole("button", {name: "Spin"});
        expect(calls.some((call) => call.url === "/api/project/play/session")).toBe(true);
        expect(calls.some((call) => call.url === "/api/project/runtime/start")).toBe(false);
        expect(screen.queryByTitle("POKIE player")).not.toBeInTheDocument();
        expect(screen.queryByText(/Copy server URL/)).not.toBeInTheDocument();
        expect(screen.queryByText(/host/i)).not.toBeInTheDocument();
    }, 30000);

    it("threads a given seed through to the session-creation request", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);

        await user.click(await screen.findByRole("button", {name: "Show advanced details (seed)"}));
        await user.type(screen.getByLabelText("Seed (optional)"), "my-seed");
        await user.click(screen.getByRole("button", {name: "New Play session"}));

        await screen.findByRole("button", {name: "Spin"});
        const createCall = calls.find((call) => call.url === "/api/project/play/session");
        expect(createCall?.init?.body).toBe(JSON.stringify({seed: "my-seed"}));
    }, 30000);

    it("shows a subject-specific recovery message, with a retry, when session creation fails", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: false, status: 500, body: {error: "boom"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);

        await user.click(await screen.findByRole("button", {name: "New Play session"}));

        expect(
            await screen.findByText("This session couldn't be completed. Try again. If it continues, start a new session and retry."),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "New Play session"})).toBeInTheDocument();
    }, 30000);

    it("keeps the last settled round and its controls visible when a retryable Spin request fails", async () => {
        const user = userEvent.setup();
        let spinCalls = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor({bet: 5, availableBets: [1, 5]})}}),
            "/api/project/play/sessions/sess-1/spin": () => {
                spinCalls += 1;
                return spinCalls === 1
                    ? {
                        ok: true,
                        status: 200,
                        body: {
                            status: "ok",
                            session: sessionFor({
                                bet: 5,
                                win: 15,
                                screen: [["cherry"]],
                                availableBets: [1, 5],
                                debug: {artifactUnavailableReason: "Round details were not captured in this fixture."},
                            }),
                        },
                    }
                    : {ok: false, status: 500, body: {error: "game worker disconnected"}};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await screen.findByText(/You won 15\.00/);

        await user.click(screen.getByRole("button", {name: "Spin"}));

        expect(await screen.findByText("This spin couldn't be completed. Try again. If it continues, start a new session and retry.")).toBeInTheDocument();
        expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled();
    }, 30000);

    it("keeps the settled round visible while a reset request is still loading", async () => {
        const user = userEvent.setup();
        let createCalls = 0;
        let resolveReset: ((response: {ok: boolean; status: number; json: () => Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/play/session") {
                createCalls += 1;
                if (createCalls === 2) {
                    return new Promise((resolve) => {
                        resolveReset = resolve;
                    });
                }
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: sessionFor({bet: 5, availableBets: [1, 5]})})});
            }
            if (path === "/api/project/play/sessions/sess-1/spin") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        status: "ok",
                        session: sessionFor({
                            bet: 5,
                            win: 15,
                            screen: [["cherry"]],
                            availableBets: [1, 5],
                            debug: {artifactUnavailableReason: "Round details were not captured in this fixture."},
                        }),
                    }),
                });
            }
            const route = BASE_ROUTES[path];
            if (route === undefined) {
                return Promise.reject(new Error(`No fake route registered for ${url}`));
            }
            const response = route({url, init});
            return Promise.resolve({ok: response.ok, status: response.status, json: () => Promise.resolve(response.body)});
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await screen.findByText(/You won 15\.00/);

        await user.click(screen.getByRole("button", {name: "Reset Play session"}));

        expect(await screen.findByRole("status")).toHaveTextContent("Spinning…");
        expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument();

        resolveReset?.({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: sessionFor({sessionId: "sess-2"})})});

        await screen.findByLabelText("Game player");
        expect(screen.queryByText(/You won 15\.00/)).toBeNull();
    }, 30000);

    it("stops offering controls for a stale Play session instead of presenting its previous round as current", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/play/sessions/sess-1/spin": () => ({ok: true, status: 404, body: {status: "not-found", error: "session expired"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));

        expect(await screen.findByText("Unknown session id.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "New Play session"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Spin"})).not.toBeInTheDocument();
    }, 30000);

    // Spinning renders the real round straight through the shared RoundSummary/GameScreenView chain the
    // Runtime tab's own Session Tools and the Replay tab's other sources already use -- not a Play-local
    // re-presentation of the same screen/win data, and never an embedded copy of the canonical player.
    // (RoundArtifactInspector's own artifact-shaped rendering is already covered by
    // RoundArtifactInspector.test.tsx -- this exercises RoundSummary's fallback flat-table/GameScreenView
    // path, the same one a session with no captured RoundArtifact renders through.)
    it("Spin renders the played round through the shared RoundSummary/GameScreenView chain in the production StrictMode lifecycle", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor({bet: 5, win: 0})}}),
            "/api/project/play/sessions/sess-1/spin": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    session: sessionFor({
                        credits: 1015,
                        bet: 5,
                        win: 15,
                        screen: [["cherry", "lemon"], ["bar", "seven"]],
                        debug: {artifactUnavailableReason: "no round artifact in this fixture"},
                    }),
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"], strictMode: true});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));

        await waitFor(() => expect(screen.getByText("cherry")).toBeInTheDocument());
        expect(screen.getByText("seven")).toBeInTheDocument();
        expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument();
        // The canonical DOM contract itself owns horizontal-scroll containment, so all hosts get the
        // same narrow-width behavior without relying on a Studio-only Mantine wrapper.
        expect(screen.getByText("cherry").closest(".pokie-player-grid-scroll")).not.toBeNull();
        // A cell rendered through the canonical player's own renderReelsGrid is addressable by its own
        // [reelIndex, rowIndex] data-cell id -- the literal DOM output of cli/client/player's own
        // rendering, not a Mantine <Table> cell.
        expect(screen.getByText("cherry")).toHaveAttribute("data-cell");
        expect(screen.getByText("cherry").closest(".player-grid")).not.toBeNull();
    }, 30000);

    it("submits the canonical session's selected bet and runtime mode with Spin", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    session: sessionFor({bet: 1, availableBets: [1, 5], availableBetModeIds: ["base", "ante", "buyFeature"], betModeId: "base"}),
                },
            }),
            "/api/project/play/sessions/sess-1/spin": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    // A consumed buyFeature reports the returned persistent session mode, while the
                    // exact completed round's buy identity comes from its RoundArtifact.
                    session: sessionFor({bet: 5, availableBets: [1, 5], availableBetModeIds: ["base", "ante", "buyFeature"], betModeId: "base", win: 0, debug: {artifactUnavailableReason: "fixture"}}),
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));

        await user.click(await screen.findByRole("button", {name: "Select bet 5"}));
        await user.click(screen.getByRole("button", {name: "Select mode buyFeature"}));
        await user.click(screen.getByRole("button", {name: "Spin"}));

        await waitFor(() => expect(calls.some((call) => call.url === "/api/project/play/sessions/sess-1/spin")).toBe(true));
        const spinCall = calls.find((call) => call.url === "/api/project/play/sessions/sess-1/spin");
        expect(spinCall?.init?.body).toBe(JSON.stringify({bet: 5, mode: "buyFeature"}));
    }, 30000);

    it("Reset discards the current session and creates a fresh one, clearing the previous round", async () => {
        const user = userEvent.setup();
        let createCalls = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => {
                createCalls += 1;
                return {ok: true, status: 201, body: {status: "ok", session: sessionFor({sessionId: `sess-${createCalls}`})}};
            },
            "/api/project/play/sessions/sess-1/spin": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    session: sessionFor({
                        sessionId: "sess-1",
                        credits: 995,
                        bet: 5,
                        win: 0,
                        screen: [["a"]],
                        debug: {artifactUnavailableReason: "no round artifact in this fixture"},
                    }),
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(screen.getByText(/Round complete/)).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Reset Play session"}));

        await waitFor(() => expect(screen.getByLabelText("Game player")).toBeInTheDocument());
        expect(createCalls).toBe(2);
    }, 30000);

    it("keeps a completed round usable after a typed reset failure, then replaces it after a successful reset", async () => {
        const user = userEvent.setup();
        let createCalls = 0;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => {
                createCalls += 1;
                if (createCalls === 2) {
                    return {ok: true, status: 200, body: {status: "failed", error: "materialization failed"}};
                }
                return {ok: true, status: 201, body: {status: "ok", session: sessionFor({sessionId: `sess-${createCalls}`, bet: 5, availableBets: [1, 5]})}};
            },
            "/api/project/play/sessions/sess-1/spin": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    session: sessionFor({
                        sessionId: "sess-1",
                        credits: 1015,
                        bet: 5,
                        win: 15,
                        screen: [["cherry"]],
                        availableBets: [1, 5],
                        debug: {artifactUnavailableReason: "Round details were not captured in this fixture."},
                    }),
                },
            }),
            "/api/project/play/sessions/sess-3/spin": () => ({ok: true, status: 200, body: {status: "ok", session: sessionFor({sessionId: "sess-3"})}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await screen.findByText(/You won 15\.00/);

        await user.click(screen.getByRole("button", {name: "Reset Play session"}));

        expect(await screen.findByText("This session couldn't be completed. Try again. If it continues, start a new session and retry.")).toBeInTheDocument();
        expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Find any win"})).toBeEnabled();

        await user.click(screen.getByRole("button", {name: "Reset Play session"}));

        await screen.findByLabelText("Game player");
        expect(screen.queryByText(/You won 15\.00/)).toBeNull();
        await user.click(screen.getByRole("button", {name: "Spin"}));
        await waitFor(() => expect(calls.some((call) => call.url === "/api/project/play/sessions/sess-3/spin")).toBe(true));
        expect(createCalls).toBe(3);
    }, 30000);

    // Find any win / Find symbol win drive Studio Play's own authoritative scenario controls -- a real
    // spin (or a real, symbol-chooser-selected spin) run server-side through StudioPlayService, never a
    // client-computed/simulated round. This exercises the request/response flow end to end: the button
    // click reaches the right route and the returned round renders through the same RoundSummary chain a
    // plain Spin does.
    it("Find any win requests the scenario route and renders the round it returns", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/play/sessions/sess-1/find-any-win": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    session: sessionFor({
                        credits: 1015,
                        bet: 5,
                        win: 15,
                        screen: [["cherry", "lemon"]],
                        debug: {artifactUnavailableReason: "no round artifact in this fixture"},
                    }),
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Find any win"}));

        await waitFor(() => expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument());
        expect(calls.some((call) => call.url === "/api/project/play/sessions/sess-1/find-any-win")).toBe(true);
    }, 30000);

    it("shows a symbol chooser once the session reports available symbols, and Find symbol win propagates the chosen symbol", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({
                ok: true,
                status: 201,
                body: {status: "ok", session: sessionFor({availableSymbols: ["cherry", "seven"]})},
            }),
            "/api/project/play/sessions/sess-1/find-symbol-win": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    session: sessionFor({
                        credits: 1050,
                        bet: 5,
                        win: 50,
                        screen: [["seven", "seven"]],
                        debug: {artifactUnavailableReason: "no round artifact in this fixture"},
                    }),
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));

        const chooser = await screen.findByRole("combobox", {name: "Symbol"});
        await user.click(chooser);
        // Mantine's own dropdown positioning never settles to visible under jsdom's layout-less
        // environment (its Popover stays "display: none" even once opened -- a jsdom limitation, not a
        // real hidden state), so the option is targeted directly with fireEvent rather than a visibility-
        // checking userEvent.click; the option element itself is real and already in the DOM.
        fireEvent.click(screen.getByRole("option", {name: "seven", hidden: true}));
        await user.click(screen.getByRole("button", {name: "Find symbol win"}));

        await waitFor(() => expect(screen.getByText(/You won 50\.00/)).toBeInTheDocument());
        const findCall = calls.find((call) => call.url === "/api/project/play/sessions/sess-1/find-symbol-win");
        expect(findCall?.init?.body).toBe(JSON.stringify({symbolId: "seven"}));
    }, 30000);

    // Find free games -- the canonical shared "custom scenario" abstraction (see
    // StudioPlayService.findFreeGames()'s own doc comment): pokie-examples' own custom-scenario dropdown
    // already uses the same shared PlayFreeGamesStrategy for its "Free games" entry. Same real,
    // authoritative request/response flow as Find any win/Find symbol win above.
    it("Find free games requests the scenario route and renders the round it returns", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/play/sessions/sess-1/find-free-games": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    session: sessionFor({
                        credits: 1000,
                        bet: 5,
                        win: 0,
                        screen: [["scatter", "scatter"]],
                        debug: {
                            artifact: {
                                schemaVersion: 1,
                                roundId: "r1",
                                provenance: {game: GAME, pokieVersion: "1.0.0"},
                                betMode: "base",
                                stake: 5,
                                totalWin: 0,
                                payoutMultiplier: 0,
                                screen: [["scatter", "scatter"]],
                                steps: [
                                    {
                                        index: 0,
                                        screen: [["scatter", "scatter"]],
                                        totalWin: 0,
                                        wins: [],
                                        featureEvents: [{type: "freeGamesTriggered", data: {count: 3}}],
                                    },
                                ],
                                wins: [],
                                featureEvents: [{type: "freeGamesTriggered", data: {count: 3}}],
                                hash: "fake-hash",
                            } as unknown as RoundArtifactJson,
                        },
                    }),
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Find free games"}));

        // Feature payloads are inspector data, deliberately separate from the player-facing game
        // window. Opening the real round inspector proves the scenario's authoritative artifact -- not
        // a client-computed/simulated indicator -- contains and renders its feature event.
        await user.click(await screen.findByText("Inspect round artifact"));
        await waitFor(() => expect(screen.getAllByText("freeGamesTriggered").length).toBeGreaterThan(0));
        expect(calls.some((call) => call.url === "/api/project/play/sessions/sess-1/find-free-games")).toBe(true);
    }, 30000);

    it("explains a free-games scenario that the current Game Model has not configured instead of offering a misleading retry", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor()}}),
            "/api/project/play/sessions/sess-1/find-free-games": () => ({
                ok: true,
                status: 200,
                body: {status: "error", error: "This game doesn't support free games, so Find free games isn't available for it."},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Find free games"}));

        expect(
            await screen.findByText("Find free games isn't available for this game. Configure the required game feature, then start a new session."),
        ).toBeInTheDocument();
        expect(screen.queryByText(/couldn't be completed/)).toBeNull();
    }, 30000);

    it("Find symbol win is disabled until a symbol is chosen", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({
                ok: true,
                status: 201,
                body: {status: "ok", session: sessionFor({availableSymbols: ["cherry", "seven"]})},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));

        expect(await screen.findByRole("button", {name: "Find symbol win"})).toBeDisabled();
    }, 30000);
});

// One fixture round (a real, already-computed RoundArtifact -- Studio never recomputes a win from a
// screen) rendered two ways: through Play's own real workflow (New Play session -> Spin, driven through the
// fetch-mocked API the same way every other test in this file drives it) and directly through
// RoundArtifactInspector, the exact same component RoundSummary (Play, Session Spin), ReplayTab
// (recorded/recreated/simulation-sampled rounds) and OutcomeSourceOverview (Outcome Library "Draw an
// outcome") all render a RoundArtifact through -- see GameScreenView's own doc comment. Proves Play's
// live UI produces the identical screen/highlight presentation a direct inspector render of the same
// artifact does, closing the gap RoundArtifactInspector.test.tsx's own "Cross-surface round presentation
// parity" suite leaves open: that suite compares RoundSummary/RoundArtifactInspector as components, never
// through Play's own real session/spin request flow.
//
// Also proves this DOM output isn't just visually similar to cli/client's own player, but reaches the
// exact same shared presentation entrypoint: deriveWinHighlightsFromRoundArtifactWins (imported directly
// below from cli/client/player, the same module cli/client/main.ts and pokie-examples import) is the one
// function Studio's own WinOverlay calls to resolve which cells this fixture's own win highlights --
// see the "matches the shared deriveWinHighlightsFromRoundArtifactWins entrypoint" assertion below, and
// tests/cli/client/player/renderPlayer.test.ts's own "reaches the same shared presentation entrypoint as
// Studio" describe block for the reverse direction (that same function, called with the equivalent
// VideoSlotRoundResponse-derived data, from cli/client's own DOM-rendering test).
describe("canonical player parity: Play renders the same fixture round Replay/Outcome Library render via RoundArtifactInspector", () => {
    const GAME = {id: "a", name: "A", version: "1.0.0"};

    // Mirrors the fixture round in tests/cli/client/player/renderPlayer.test.ts's own "canonical player
    // fixture round parity" describe block: the same 3-reel screen (cherry/cherry/lemon on row 0), the
    // same win amount -- expressed here as a RoundArtifact (Studio's own shared round shape) rather than a
    // VideoSlotRoundResponse, since Play/Replay/Outcome Library render arbitrary game types, not only
    // video slots.
    function fixtureArtifact(): RoundArtifactJson {
        const screen = [
            ["cherry", "K", "Q"],
            ["cherry", "K", "Q"],
            ["lemon", "K", "Q"],
        ];
        const wins = [
            {
                type: "line",
                id: "w1",
                symbolId: "cherry",
                winAmount: 12.5,
                winningPositions: [[0, 0], [1, 0]],
                multiplierBreakdown: [],
                metadata: {definition: [0, 0, 0]},
            },
        ];
        return {
            schemaVersion: 1,
            roundId: "fixture:canonical-player:1",
            provenance: {game: GAME, pokieVersion: "1.0.0"},
            betMode: "base",
            stake: 5,
            totalWin: 12.5,
            payoutMultiplier: 2.5,
            screen,
            steps: [{index: 0, screen, totalWin: 12.5, wins}],
            wins,
            hash: "fixture-hash-1",
        };
    }

    function renderArtifactDirectly(artifact: RoundArtifactJson) {
        return render(
            <MantineProvider>
                <RoundArtifactInspector artifact={describeRoundArtifact(artifact)} credits={1012.5} />
            </MantineProvider>,
        );
    }

    it("Play's own Spin workflow renders the fixture round's screen/win highlighting identically to a direct RoundArtifactInspector render of the same artifact", async () => {
        const user = userEvent.setup();
        const artifact = fixtureArtifact();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/play/session": () => ({ok: true, status: 201, body: {status: "ok", session: sessionFor({bet: 5, win: 0})}}),
            "/api/project/play/sessions/sess-1/spin": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    session: sessionFor({credits: 1012.5, bet: 5, win: 12.5, screen: artifact.screen as string[][], debug: {artifact}}),
                },
            }),
        });

        const routed = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToPlayTab(user);
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        await user.click(await screen.findByRole("button", {name: "Spin"}));
        await waitFor(() => expect(within(routed.container).getByLabelText("Game player")).toBeInTheDocument());

        // Play's polished surface is the canonical player: it renders the round total and multiplier
        // as distinct player totals. The per-win "x stake" breakdown belongs to the separate inspector.
        const playTotals = within(routed.container).getByLabelText("Round totals");
        expect(within(playTotals).getByText("Total win").nextElementSibling).toHaveTextContent("12.50");
        expect(within(playTotals).getByText("Payout multiplier").nextElementSibling).toHaveTextContent("2.50");

        // Each render mounts into the shared document.body, so every query below is scoped to its own
        // container -- otherwise a text query bound to either render's own result would ambiguously match
        // both trees at once instead of proving each renders the fixture round independently.
        const direct = renderArtifactDirectly(artifact);

        const playGrid = routed.container.querySelector(".player-grid") as HTMLElement;
        const directGrid = direct.container.querySelector(".player-grid") as HTMLElement;
        // ".player-grid" is the literal className cli/client/player's own renderReelsGrid stamps onto the
        // <table> it creates (see renderPlayer.ts) -- its presence in both trees proves Play's own live
        // Spin workflow and a direct RoundArtifactInspector render both mount that exact DOM function,
        // never a page-local Mantine re-presentation of the same screen.
        expect(playGrid).not.toBeNull();
        expect(directGrid).not.toBeNull();

        for (const {container, grid} of [
            {container: routed.container, grid: playGrid},
            {container: direct.container, grid: directGrid},
        ]) {
            // The persistent tint applyPersistentHighlights applies -- both matched cells, straight off
            // this fixture's own already-computed winningPositions, no hover needed.
            const cherryCells = within(grid).getAllByText("cherry");
            expect(cherryCells).toHaveLength(2);
            for (const cell of cherryCells) {
                expect((cell as HTMLElement).style.backgroundColor).not.toBe("");
            }
            const lemonCell = within(grid).getByText("lemon") as HTMLElement;
            expect(lemonCell.style.backgroundColor).toBe("");

            // Hovering the win's own hover-list entry (renderWinHighlightsList) traces its full
            // configured payline: green for the two cells that actually won, grey for the third reel's
            // own row-0 cell that's on the path but never won.
            const winButton = within(container).getByRole("button", {name: "line: cherry, win: 12.5"});
            fireEvent.mouseEnter(winButton);
            for (const cell of cherryCells) {
                expect((cell as HTMLElement).style.backgroundColor).toBe("rgb(0, 255, 0)");
            }
            expect(lemonCell.style.backgroundColor).toBe("rgb(153, 153, 153)");
            fireEvent.mouseLeave(winButton);
        }

        // The player-facing surface stays compact; opening its real inspector reveals the same
        // per-win position detail as a direct inspector render.
        await user.click(within(routed.container).getByText("Inspect round artifact"));

        // Same win detail: real symbol, real position count, the same "x stake" unit.
        expect(within(routed.container).getByText("2")).toBeInTheDocument();
        expect(within(direct.container).getByText("2")).toBeInTheDocument();

        // Both renders' own tinted/traced cells match exactly what the shared
        // deriveWinHighlightsFromRoundArtifactWins entrypoint derives for this fixture's own wins -- not
        // just "the same as each other", but the same as the one function every other RoundArtifact-
        // rendering surface (and, via its VideoSlotRoundResponse counterpart deriveWinHighlights, cli/client
        // and pokie-examples) resolves highlights through.
        const [expectedHighlight] = deriveWinHighlightsFromRoundArtifactWins(artifact.wins, artifact.screen.length);
        expect(expectedHighlight.positions).toEqual([[0, 0], [1, 0]]);
        expect(expectedHighlight.paylinePositions).toEqual([[0, 0], [1, 0], [2, 0]]);
    }, 30000);
});
