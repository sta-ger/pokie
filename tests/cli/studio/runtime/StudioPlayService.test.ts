import {GameSessionHandling, PokieGame, PokieGameManifest, SymbolsCombination, VideoSlotConfig, VideoSlotSessionHandling, VideoSlotWinCalculator, WinEvaluationResult} from "pokie";
import {StudioPlayService} from "../../../../cli/studio/runtime/StudioPlayService.js";

const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

function winEvaluationResultWithWin(): WinEvaluationResult<string> {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    const symbols = new SymbolsCombination<string>().fromMatrix([
        ["A", "A", "A"],
        ["A", "K", "Q"],
        ["A", "K", "Q"],
        ["K", "Q", "J"],
        ["Q", "J", "10"],
    ]);
    winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
    return winCalculator.getWinEvaluationResult();
}

// A real GameSessionHandling + VideoSlotSessionHandling-shaped fake -- what "full" capture (always on
// for Play, see StudioPlayService's own doc comment) needs to actually build a RoundArtifact through
// buildRoundArtifactFromSession, not just a plain fake with no screen/win-evaluation shape.
function createFakeVideoSlotSession(seed: string | number | undefined): GameSessionHandling & VideoSlotSessionHandling<string> {
    let credits = 1000;
    const bet = 5;
    const screen = [[`seed-${String(seed ?? "none")}`]];

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            credits -= bet;
        },
        getWinAmount: () => winEvaluationResultWithWin().getTotalWin(),
        getSymbolsCombination: () => ({toMatrix: () => screen}),
        getWinEvaluationResult: () => winEvaluationResultWithWin(),
    } as unknown as GameSessionHandling & VideoSlotSessionHandling<string>;
}

function createFakeVideoSlotGame(): PokieGame {
    return {getManifest: () => manifest, createSession: (context) => createFakeVideoSlotSession(context?.seed)};
}

function fakeLoadVideoSlotGame(): (packageRoot: string) => Promise<PokieGame> {
    return () => Promise.resolve(createFakeVideoSlotGame());
}

// No getSymbolsCombination()/getWinEvaluationResult() at all -- plain GameSessionHandling, so a "full"
// capture can't build a RoundArtifact and must report roundArtifactUnavailableReason instead.
function createFakeNonVideoSlotGame(): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            let credits = 1000;
            const bet = 1;
            return {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: () => undefined,
                getAvailableBets: () => [bet],
                canPlayNextGame: () => credits >= bet,
                play: () => {
                    credits -= bet;
                },
                getWinAmount: () => 0,
            };
        },
    };
}

describe("StudioPlayService", () => {
    it("creates a real, live session directly, with no server/host/port involved", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.newSession("/fake/project");

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.sessionId).toEqual(expect.any(String));
        expect(result.session.game).toEqual(manifest);
        expect(result.session.credits).toBe(1000);
        expect(result.session.win).toBeUndefined();
    });

    it("passes a given seed through to the game's own createSession() as a real PokieGameContext", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.newSession("/fake/project", "my-seed");

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.screen).toEqual([["seed-my-seed"]]);
    });

    it("reports a safe 'failed' result when the game fails to load, never throwing", async () => {
        const service = new StudioPlayService(() => Promise.reject(new Error("bad package")));

        const result = await service.newSession("/fake/project");

        expect(result).toEqual({status: "failed", error: "bad package"});
    });

    it("spins the just-created session and returns a real RoundArtifact, settled through the same wallet SpinCommandHandler always uses", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId);

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.credits).toBe(995);
        expect(typeof result.session.win).toBe("number");
        expect(result.session.debug?.artifact).toBeDefined();
        expect(result.session.debug?.artifactUnavailableReason).toBeUndefined();
    });

    it("reports an honest artifactUnavailableReason instead of a fabricated artifact for a non-video-slot game", async () => {
        const service = new StudioPlayService(() => Promise.resolve(createFakeNonVideoSlotGame()));
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId);

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.debug?.artifact).toBeUndefined();
        expect(result.session.debug?.artifactUnavailableReason).toEqual(expect.any(String));
    });

    it("reports 'not-found' spinning a sessionId from before the most recent newSession() call", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const first = await service.newSession("/fake/project");
        if (first.status !== "ok") {
            throw new Error("expected ok");
        }

        await service.newSession("/fake/project");
        const result = await service.spin(first.session.sessionId);

        expect(result).toEqual({status: "not-found"});
    });

    it("reports 'not-found' spinning before any session was ever created", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.spin("unknown-session-id");

        expect(result).toEqual({status: "not-found"});
    });

    it("reports 'not-found' spinning after reset()", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        service.reset();
        const result = await service.spin(created.session.sessionId);

        expect(result).toEqual({status: "not-found"});
    });

    it("crosses the shared runtime-package-materialization boundary exactly once per newSession(), loading only the resolved runtime path", async () => {
        const rawProjectRoot = "/blueprints/raw-game.json";
        const resolvedRuntimePath = "/materialized/raw-game";
        const resolveCalls: string[] = [];
        const resolveRuntimePackageRoot = (packageRoot: string) => {
            resolveCalls.push(packageRoot);
            return Promise.resolve({runtimePath: resolvedRuntimePath, release: () => Promise.resolve()});
        };
        const loadCalls: string[] = [];
        const loadGame = (packageRoot: string) => {
            loadCalls.push(packageRoot);
            return Promise.resolve(createFakeVideoSlotGame());
        };
        const service = new StudioPlayService(loadGame, resolveRuntimePackageRoot);

        const result = await service.newSession(rawProjectRoot);

        expect(result.status).toBe("ok");
        expect(resolveCalls).toEqual([rawProjectRoot]);
        expect(loadCalls).toEqual([resolvedRuntimePath]);
    });

    it("reports a safe 'failed' result, without ever loading the game, when the runtime package cannot be materialized", async () => {
        const resolveRuntimePackageRoot = () => Promise.reject(new Error("dependencies phase failed"));
        const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
        const service = new StudioPlayService(loadGame, resolveRuntimePackageRoot);

        const result = await service.newSession("/fake/project");

        expect(result).toEqual({status: "failed", error: "dependencies phase failed"});
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("replaces whatever session was active on every newSession() call, discarding the previous one", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const first = await service.newSession("/fake/project");
        const second = await service.newSession("/fake/project");
        if (first.status !== "ok" || second.status !== "ok") {
            throw new Error("expected ok");
        }

        expect(first.session.sessionId).not.toEqual(second.session.sessionId);
        expect((await service.spin(second.session.sessionId)).status).toBe("ok");
        expect(await service.spin(first.session.sessionId)).toEqual({status: "not-found"});
    });
});
