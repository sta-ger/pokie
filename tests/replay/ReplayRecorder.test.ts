import {generatedMechanicsGame, replayModesBlueprint} from "../v2/fixtures/ExistingMechanicsGame.js";
import {transactionalRoundGame} from "../v2/fixtures/TransactionalRoundGame.js";
import {createOverscanGame} from "../v2/fixtures/OverscanGame.js";
import {GameSessionHandling, loadPokieGame, PokieGame, PokieGameContext, PokieGameManifest, ReplayRecorder, ReplayDescriptor, SessionRuntime, AuditRoundReplay, AuditReplayError, ConvertableToSessionState, captureAuditBoundary, SessionCommand, validateAuditReplayDescriptor} from "@fromstan/pokie";
import path from "path";

function createFakeSession(): GameSessionHandling & {getSymbolsCombination(): {toMatrix(): string[][]}} {
    let credits = 1000;
    const bet = 1;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [1],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            round++;
            winAmount = round % 5 === 0 ? bet * 10 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
        getSymbolsCombination: () => ({toMatrix: () => [[`round-${round}`]]}),
    };
}

function createFakeGame(manifest: PokieGameManifest): PokieGame & {createdWith?: PokieGameContext} {
    return {
        getManifest: () => manifest,
        createSession(context) {
            this.createdWith = context;
            return createFakeSession();
        },
    };
}

describe("ReplayRecorder", () => {
    const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

    it("throws for a non-positive round", () => {
        const recorder = new ReplayRecorder();

        expect(() => recorder.record({game: createFakeGame(manifest), round: 0})).toThrow(/round must be a positive integer/);
    });

    it("creates the session with the given seed forwarded as context", () => {
        const game = createFakeGame(manifest);
        const recorder = new ReplayRecorder();

        recorder.record({game, seed: "demo", round: 1});

        expect(game.createdWith).toEqual({seed: "demo"});
    });

    it("creates the session without a context when no seed is given", () => {
        const game = createFakeGame(manifest);
        const recorder = new ReplayRecorder();

        recorder.record({game, round: 1});

        expect(game.createdWith).toBeUndefined();
    });

    it("maps the manifest id/name/version into the descriptor's game field", () => {
        const recorder = new ReplayRecorder();

        const descriptor = recorder.record({game: createFakeGame(manifest), round: 1});

        expect(descriptor.game).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
    });

    it("defaults seed to null when not given, and passes it through otherwise", () => {
        const recorder = new ReplayRecorder();

        const withoutSeed = recorder.record({game: createFakeGame(manifest), round: 1});
        const withSeed = recorder.record({game: createFakeGame(manifest), seed: "demo", round: 1});

        expect(withoutSeed.seed).toBeNull();
        expect(withSeed.seed).toBe("demo");
    });

    it("plays forward to the requested round, accumulating totalBet/totalWin along the way", () => {
        const recorder = new ReplayRecorder();

        const descriptor = recorder.record({game: createFakeGame(manifest), round: 5});

        expect(descriptor.round).toBe(5);
        expect(descriptor.totalBet).toBe(5);
        expect(descriptor.totalWin).toBe(10);
    });

    it("captures the screen via getSymbolsCombination() when the session exposes it", () => {
        const recorder = new ReplayRecorder();

        const descriptor = recorder.record({game: createFakeGame(manifest), round: 3});

        expect(descriptor.screen).toEqual([["round-3"]]);
    });

    it("returns a null screen when the session does not expose getSymbolsCombination()", () => {
        const game: PokieGame = {
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
                    getAvailableBets: () => [1],
                    canPlayNextGame: () => credits >= bet,
                    play: () => {
                        credits -= bet;
                    },
                    getWinAmount: () => 0,
                };
            },
        };
        const recorder = new ReplayRecorder();

        const descriptor = recorder.record({game, round: 1});

        expect(descriptor.screen).toBeNull();
    });

    it("records a non-negative durationMs and a timestamp", () => {
        const recorder = new ReplayRecorder();
        const before = Date.now();

        const descriptor = recorder.record({game: createFakeGame(manifest), round: 1});

        expect(descriptor.durationMs).toBeGreaterThanOrEqual(0);
        expect(descriptor.timestamp).toBeGreaterThanOrEqual(before);
    });

    it("fails explicitly instead of fabricating an unreachable target round", () => {
        const stoppingGame: PokieGame = {
            getManifest: () => manifest,
            createSession: () => {
                let played = false;
                return {
                    getCreditsAmount: () => 1,
                    setCreditsAmount: () => undefined,
                    getBet: () => 1,
                    setBet: () => undefined,
                    getAvailableBets: () => [1],
                    canPlayNextGame: () => !played,
                    play: () => {
                        played = true;
                    },
                    getWinAmount: () => 0,
                };
            },
        };

        expect(() => new ReplayRecorder().record({game: stoppingGame, round: 2})).toThrow(/target round 2 is unreachable/i);
    });
});

describe("ReplayRecorder (integration, real loadPokieGame + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "cli", "fixtures", "playable-game");

    it("replays a real game package's round deterministically for a given seed", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const recorder = new ReplayRecorder();

        const first = recorder.record({game, seed: "demo", round: 3});
        const second = recorder.record({game, seed: "demo", round: 3});

        // timestamp/durationMs are wall-clock and expected to vary between runs; sessionId is also
        // expected to vary since record() mints a brand-new session identity every call (see
        // ReplayDescriptor.sessionId's own doc comment) -- everything else that describes the round
        // itself must match exactly for the same seed + round.
        const {timestamp: firstTimestamp, durationMs: firstDurationMs, sessionId: firstSessionId, ...firstStable} = first;
        const {timestamp: secondTimestamp, durationMs: secondDurationMs, sessionId: secondSessionId, ...secondStable} = second;
        expect(firstStable).toEqual(secondStable);
        expect(firstTimestamp).toBeGreaterThan(0);
        expect(secondTimestamp).toBeGreaterThan(0);
        expect(firstDurationMs).toBeGreaterThanOrEqual(0);
        expect(secondDurationMs).toBeGreaterThanOrEqual(0);
        expect(firstSessionId).not.toBe(secondSessionId);
        expect(first.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(first.round).toBe(3);
        expect(Array.isArray(first.screen)).toBe(true);
    });

    it("produces a different screen for a different seed", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const recorder = new ReplayRecorder();

        const demo = recorder.record({game, seed: "demo", round: 3});
        const other = recorder.record({game, seed: "another-seed", round: 3});

        expect(demo.screen).not.toEqual(other.screen);
    });
});

describe("fractional logical replay payout", () => {
    it.each([0.05, 7.5, 1e-7].flatMap(bet => [false, true].map(deferred => ({bet, deferred}))))("preserves awards at $bet (deferred=$deferred)", ({bet, deferred}) => {
        const model = deferred ? createOverscanGame({
            manifest: {id: "fractional-bank", name: "Fractional bank", version: "1"},
            reels: 3, rows: 1, availableBets: [0.05, 7.5, 1e-7], symbols: ["A", "S"], wilds: [], scatters: ["S"],
            paylines: [[0, 0, 0]], paytable: {A: {"3": 2}}, reelStrips: Array.from({length: 3}, () => ["A"]),
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 2}}},
            betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 5, forcedFreeGames: 3}],
        }) : transactionalRoundGame();
        const entry = {kind: "spin" as const, bet, ...(deferred ? {mode: "buy"} : {})};
        const session = model.createSession({seed: "7"});
        session.setCreditsAmount(bet * 20);
        const reference = new SessionRuntime(session).execute({...entry, roundId: "reference", delivery: "composite"});
        if (reference.status !== "played" || !reference.logicalRound) throw new Error("Missing logical reference");
        const descriptor = new ReplayRecorder().record({game: model, seed: "7", round: 1, unit: "logical-round", entryCommands: [entry]});
        const actual = descriptor.logicalRound!;
        expect(actual.subrounds.map(step => step.win)).toEqual(reference.logicalRound.subrounds.map(step => step.win));
        for (const [index, step] of actual.subrounds.entries()) expect(Math.abs(step.payout - reference.logicalRound.subrounds[index].payout)).toBeLessThan(bet * 1e-10);
        expect(Math.abs(actual.totalPayout - actual.totalWin)).toBeLessThan(bet * 1e-10);
        if (deferred) {
            expect(actual.subrounds[1].payout).toBe(0);
            expect(actual.subrounds[0].payout).toBe(0);
            expect(actual.subrounds[actual.cursor - 1].payout).toBe(actual.totalWin);
        }
    });
});

describe("direct audit operation identity and retention", () => {
    const disposition = {status: "calculated" as const, sessionId: "direct", durability: "detached" as const};
    const game = {...transactionalRoundGame(), getConfigHash: () => "recorder-model"};

    it("executes identical unkeyed operations separately, reserves a checked bound and retires owned runtime references", () => {
        expect(() => new ReplayRecorder(0)).toThrow("1..10000");
        expect(() => new ReplayRecorder(10001)).toThrow("1..10000");
        const recorder = new ReplayRecorder(3),
            session = game.createSession(),
            play = jest.spyOn(session, "play");
        const first = recorder.recordAudit(game, session, [{kind: "spin"}], disposition);
        const second = recorder.recordAudit(game, session, [{kind: "spin"}], disposition);
        expect(play).toHaveBeenCalledTimes(2);
        expect(second.audit!.deliveries[0].before).toEqual(first.audit!.deliveries[0].after);
        expect(second.audit!.hash).not.toBe(first.audit!.hash);
        const keyed: SessionCommand = {kind: "spin", roundId: "retained"};
        const third = recorder.recordAudit(game, session, [keyed], {...disposition, requestId: "third"});
        expect(recorder.recordAudit(game, session, [keyed], {...disposition, requestId: "third"})).toEqual(third);
        expect(new SessionRuntime(session).getRetainedDeliveryCount()).toBe(1);
        expect(() => recorder.recordAudit(game, session, [{kind: "spin"}], disposition)).toThrow("retention limit");
        expect(play).toHaveBeenCalledTimes(3);
        recorder.releaseAuditSession(session);
        expect(new SessionRuntime(session).getRetainedDeliveryCount()).toBe(0);
        expect(new SessionRuntime(session).execute({kind: "spin"})).toMatchObject({status: "blocked"});
        expect(new AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(second.audit))).verification).toBe("verified");
    });

    it("preserves historical digest/context and rejects command, context, disposition and model substitutions before execution", () => {
        const recorder = new ReplayRecorder(2),
            session = game.createSession(),
            context = {seed: "original"},
            accepted = {...disposition, requestId: "identity"};
        const command: SessionCommand = {kind: "spin"};
        const first = recorder.recordAudit(game, session, [command], accepted, context);
        recorder.recordAudit(game, session, [{kind: "spin"}], {...disposition, requestId: "later"}, context);
        const before = captureAuditBoundary(session),
            play = jest.spyOn(session, "play");
        expect(recorder.recordAudit(game, session, [command], accepted, context)).toBe(first);
        for (const attempt of [
            () => recorder.recordAudit(game, session, [{...command, bet: 2}], accepted, context),
            () => recorder.recordAudit(game, session, [command], accepted, {seed: "replacement"}),
            () => recorder.recordAudit(game, session, [command], {...accepted, status: "committed"}, context),
            () => recorder.recordAudit({...game, getConfigHash: () => "replacement"}, session, [command], accepted, context),
        ]) expect(attempt).toThrow("audit-identity at operation");
        expect(play).not.toHaveBeenCalled();
        expect(captureAuditBoundary(session)).toEqual(before);
        expect(first.audit!.context).toEqual(context);
        expect(Object.isFrozen(first)).toBe(true);
        recorder.releaseAuditSession(session);
    });

    it("distinguishes every accepted delivery of a request-bearing composite recording", () => {
        const recorder = new ReplayRecorder(),
            session = game.createSession();
        const descriptor = recorder.recordAudit(game, session, [{kind: "spin", mode: "double", delivery: "composite", roundId: "round"}], {...disposition, requestId: "composite", expectedVersion: 1, version: 2});
        expect(descriptor.audit!.deliveries.length).toBeGreaterThan(1);
        expect(descriptor.audit!.deliveries.every(delivery => delivery.disposition.requestId === "composite")).toBe(true);
        expect(new AuditRoundReplay().replay(game, descriptor.audit!).verification).toBe("verified");
        recorder.releaseAuditSession(session);
    });

    it.each([2, 3, 4])("exports the accepted prefix on calculation %s failure and resumes the original bounded operation exactly once", failedCalculation => {
        let calculations = 0;
        const failure = new Error("successor failed");
        const model = {...transactionalRoundGame(() => {
            if (++calculations === failedCalculation) throw failure;
        }), getConfigHash: () => "interrupted-model"};
        const recorder = new ReplayRecorder(6),
            context = {seed: "original"},
            session = model.createSession(context),
            play = jest.spyOn(session, "play"),
            accepted = {...disposition, requestId: "interrupted", expectedVersion: 1, version: 2};
        const commands: SessionCommand[] = [
            {kind: "spin", roundId: "first", delivery: "composite", maxSubrounds: 3},
            {kind: "spin", roundId: "second", delivery: "composite", maxSubrounds: 3},
        ];
        let prefix: ReplayDescriptor | undefined;
        try {
            recorder.recordAudit(model, session, commands, accepted, context);
        } catch (error) {
            expect(error).toBe(failure);
            prefix = (error as Error & {committedRecording: ReplayDescriptor}).committedRecording;
        }
        expect(prefix!.audit!.deliveries).toHaveLength(failedCalculation - 1);
        expect(Object.isFrozen(prefix)).toBe(true);
        expect(prefix!.audit!.deliveries[0].command).toEqual(commands[0]);
        expect(prefix!.audit!.deliveries[0].disposition).toMatchObject(accepted);
        expect(prefix!.audit!.context).toEqual(context);
        expect(prefix!.auditCompletion).toBe(failedCalculation === 4 ? "completed" : "pending");
        const count = play.mock.calls.length;
        context.seed = "replacement";
        expect(() => recorder.recordAudit(model, session, commands, accepted, context)).toThrow("audit-identity at operation");
        context.seed = "original";
        expect(() => recorder.recordAudit(model, session, [{...commands[0], maxSubrounds: 2}, commands[1]], accepted, context)).toThrow("audit-identity at operation");
        expect(() => recorder.recordAudit(model, session, commands, {...accepted, version: 999}, context)).toThrow("audit-identity at operation");
        expect(play).toHaveBeenCalledTimes(count);
        // At exact capacity, accepted deliveries are not reserved or charged a second time.
        const resumed = recorder.recordAudit(model, session, commands, accepted, context);
        expect(play).toHaveBeenCalledTimes(7); // Six accepted calculations plus the failed attempt.
        expect(resumed.audit!.deliveries).toHaveLength(6);
        expect(resumed.audit!.deliveries.slice(0, failedCalculation - 1)).toEqual(prefix!.audit!.deliveries);
        expect(resumed.auditCompletion).toBe("completed");
        expect(recorder.recordAudit(model, session, commands, accepted, context)).toBe(resumed);
        expect(() => recorder.recordAudit(model, session, [{kind: "spin"}], disposition)).toThrow("retention limit");
        expect(play).toHaveBeenCalledTimes(7);
        recorder.releaseAuditSession(session);
        const restored = new AuditRoundReplay().replay(model, JSON.parse(JSON.stringify(resumed.audit)));
        expect(restored).toMatchObject({verification: "verified", completion: "completed"});
        expect(restored.recording.deliveries).toEqual(resumed.audit!.deliveries);
        expect(new AuditRoundReplay().replay(model, JSON.parse(JSON.stringify(prefix!.audit))).verification).toBe("verified");
    });

    it.each([1, 2, 3, 4])("recovers transient capture failure at accepted delivery %s without recalculating or omitting it", failedDelivery => {
        let calculations = 0,
            failed = false;
        const model = {...transactionalRoundGame(() => calculations++), getConfigHash: () => "capture-model"};
        const session = model.createSession({seed: "original"}),
            codec = session as GameSessionHandling & ConvertableToSessionState,
            capture = codec.toSessionState.bind(codec),
            before = captureAuditBoundary(session),
            recorder = new ReplayRecorder(6),
            accepted = {...disposition, requestId: "capture", expectedVersion: 1, version: 2},
            context = {seed: "original"};
        const commands: SessionCommand[] = [
            {kind: "spin", roundId: "first", delivery: "composite", maxSubrounds: 3},
            {kind: "spin", roundId: "second", delivery: "composite", maxSubrounds: 3},
        ];
        jest.spyOn(codec, "toSessionState").mockImplementation(() => {
            if (calculations === failedDelivery && !failed) {
                failed = true;
                throw new Error("transient post-acceptance capture failure");
            }
            return capture();
        });
        const recording = recorder.recordAudit(model, session, commands, accepted, context);
        expect(failed).toBe(true);
        expect(calculations).toBe(6);
        expect(recording.audit!.deliveries).toHaveLength(6);
        expect(recording.audit!.deliveries[0].before).toEqual(before);
        expect(recording.audit!.deliveries.map(delivery => delivery.command.continuation?.cursor ?? "entry")).toEqual(["entry", 1, 2, "entry", 1, 2]);
        expect(recording.audit!.captureUnavailable).toBeUndefined();
        expect(recording.audit!.deliveries.every(delivery => delivery.disposition.requestId === "capture")).toBe(true);
        expect(recording.audit!.context).toEqual(context);
        expect(recorder.recordAudit(model, session, commands, accepted, context)).toBe(recording);
        expect(() => recorder.recordAudit(model, session, commands, accepted, {seed: "later"})).toThrow("audit-identity at operation");
        expect(() => recorder.recordAudit(model, session, [{kind: "spin"}], disposition)).toThrow("retention limit");
        expect(calculations).toBe(6);
        recorder.releaseAuditSession(session);
        expect(new AuditRoundReplay().replay(model, JSON.parse(JSON.stringify(recording.audit)))).toMatchObject({verification: "verified", completion: "completed"});
    });

    it.each([1, 2, 3, 4])("binds persistent capture failure at accepted delivery %s and never advances past its unavailable boundary", failedDelivery => {
        let calculations = 0;
        const model = {...transactionalRoundGame(() => calculations++), getConfigHash: () => "capture-model"};
        const context = {seed: "original"},
            session = model.createSession(context),
            codec = session as GameSessionHandling & ConvertableToSessionState,
            capture = codec.toSessionState.bind(codec),
            originalBoundary = captureAuditBoundary(session),
            recorder = new ReplayRecorder(6),
            accepted = {...disposition, requestId: "capture", expectedVersion: 1, version: 2};
        const commands: SessionCommand[] = [
            {kind: "spin", roundId: "first", delivery: "composite", maxSubrounds: 3},
            {kind: "spin", roundId: "second", delivery: "composite", maxSubrounds: 3},
        ];
        const snapshot = jest.spyOn(codec, "toSessionState").mockImplementation(() => {
            if (calculations === failedDelivery) throw new Error("persistent post-acceptance capture failure");
            return capture();
        });
        type Failure = AuditReplayError & {acceptedDeliveries: number; committedRecording?: ReplayDescriptor; uncapturedDelivery: {before: unknown; command: SessionCommand}; operation: {commands: readonly SessionCommand[]; context: PokieGameContext; disposition: typeof accepted}};
        let failure: Failure | undefined;
        try {
            recorder.recordAudit(model, session, commands, accepted, context);
        } catch (error) {
            failure = error as Failure;
        }
        expect(failure).toMatchObject({code: "audit-capture-unavailable", path: `deliveries[${failedDelivery - 1}]`, acceptedDeliveries: failedDelivery});
        expect(calculations).toBe(failedDelivery);
        expect(new SessionRuntime(session).getRetainedDeliveryCount()).toBe(failedDelivery);
        expect(failure!.operation).toMatchObject({commands, context, disposition: accepted});
        expect(Object.isFrozen(failure!.operation)).toBe(true);
        expect(Object.isFrozen(failure!.uncapturedDelivery)).toBe(true);
        if (failedDelivery === 1) {
            expect(failure!.uncapturedDelivery.before).toEqual(originalBoundary);
            expect(failure!.uncapturedDelivery.command).toEqual(commands[0]);
            expect(failure!.committedRecording).toBeUndefined();
        } else {
            const prefix = failure!.committedRecording!;
            expect(Object.isFrozen(prefix)).toBe(true);
            expect(prefix.audit!.deliveries).toHaveLength(failedDelivery - 1);
            expect(prefix.audit!.deliveries[0].before).toEqual(originalBoundary);
            expect(prefix.audit!.captureUnavailable).toEqual({acceptedDeliveries: failedDelivery});
            expect(prefix.auditCompletion).toBe("pending");
            expect(prefix.auditUnavailableReason).toContain("could not be captured");
            expect(failure!.uncapturedDelivery.before).toEqual(prefix.audit!.deliveries[failedDelivery - 2].after);
            expect(new AuditRoundReplay().replay({...model, createSession: transactionalRoundGame().createSession}, JSON.parse(JSON.stringify(prefix.audit)))).toMatchObject({verification: "verified", completion: "pending"});
            // Even a prefix ending in a completed earlier command cannot complete the operation.
            if (failedDelivery === 4) expect(prefix.logicalRound!.status).toBe("completed");
        }
        const attempts = snapshot.mock.calls.length;
        // A later recovery of the codec cannot substitute a new boundary for lost evidence.
        snapshot.mockImplementation(capture);
        expect(() => recorder.recordAudit(model, session, commands, accepted, context)).toThrow(failure!);
        expect(snapshot).toHaveBeenCalledTimes(attempts);
        context.seed = "changed";
        expect(() => recorder.recordAudit(model, session, commands, accepted, context)).toThrow("audit-identity at operation");
        context.seed = "original";
        expect(() => recorder.recordAudit(model, session, [{...commands[0], maxSubrounds: 2}, commands[1]], accepted, context)).toThrow("audit-identity at operation");
        expect(() => recorder.recordAudit(model, session, commands, {...accepted, status: "committed"}, context)).toThrow("audit-identity at operation");
        expect(() => recorder.recordAudit(model, session, [{kind: "spin"}], {...disposition, requestId: "new"})).toThrow(failure!);
        expect(calculations).toBe(failedDelivery);
        expect(new SessionRuntime(session).getRetainedDeliveryCount()).toBe(failedDelivery);
        recorder.releaseAuditSession(session);
        expect(new SessionRuntime(session).getRetainedDeliveryCount()).toBe(0);
    });

    it("charges an unkeyed accepted capture failure and prevents a retry from starting a successor-only recording", () => {
        const recorder = new ReplayRecorder(1),
            session = game.createSession(),
            codec = session as GameSessionHandling & ConvertableToSessionState,
            capture = codec.toSessionState.bind(codec),
            play = jest.spyOn(session, "play");
        jest.spyOn(codec, "toSessionState").mockImplementation(() => {
            if (play.mock.calls.length) throw new Error("capture failed");
            return capture();
        });
        let failure: Error | undefined;
        try {
            recorder.recordAudit(game, session, [{kind: "spin"}], disposition);
        } catch (error) {
            failure = error as Error;
        }
        expect(failure).toMatchObject({code: "audit-capture-unavailable", acceptedDeliveries: 1});
        expect(() => recorder.recordAudit(game, session, [{kind: "spin"}], disposition)).toThrow(failure!);
        expect(() => recorder.recordAudit(game, session, [{kind: "spin", bet: 7.5}], disposition)).toThrow("audit-identity at operation");
        expect(play).toHaveBeenCalledTimes(1);
        recorder.releaseAuditSession(session);
    });
});

describe("F12 seeded step artifact attribution", () => {
    describe.each([false, true])("weighted sequences: %s", weighted => {
        it.each([
            {mode: "base", stakes: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05]},
            {mode: "ante", stakes: Array<number>(8).fill(0.05 * 1.5)},
            {mode: "buy", stakes: [0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0]},
            {mode: "buy-more", stakes: [1.25, 0, 0, 0, 1.25, 0, 0, 0]},
        ])("retains executed $mode stake/mode at entry, continuation, completion and repurchase", ({mode, stakes}) => {
            const game = generatedMechanicsGame(replayModesBlueprint(weighted));
            for (let round = 1; round <= stakes.length; round++) {
                const execution = new ReplayRecorder().execute({game, seed: "review-fixed", round, betModeId: mode});
                const results: ReturnType<SessionRuntime["execute"]>[] = [];
                let next = execution.next();
                while (!next.done) {
                    results.push(next.value.result);
                    next = execution.next();
                }
                const descriptor = next.value;
                const result = results[results.length - 1];
                expect(results.map(result => result.status === "played" ? result.stake : undefined)).toEqual(stakes.slice(0, round));
                expect(result).toMatchObject({status: "played", mode, stake: stakes[round - 1]});
                expect(descriptor.totalBet).toBeCloseTo(stakes.slice(0, round).reduce((sum, stake) => sum + stake, 0), 12);
                expect(descriptor.totalWin).toBe(0);
                expect(descriptor.commands).toEqual(stakes.slice(0, round).map(stake => ({kind: "spin", ...(stake > 0 ? {mode} : {})})));
                expect(descriptor.artifact).toMatchObject({betMode: mode, stake: stakes[round - 1]});
                expect(descriptor.artifact?.featureEvents).toContainEqual(expect.objectContaining({type: "chargedBetMode", data: {id: mode}}));
                expect(Boolean(descriptor.artifact?.sequenceSelections?.length)).toBe(weighted);
            }
        });
    });
});

describe("generated package audit step exports", () => {
    it.each([false, true])("retains executed steps and v1 aggregate evidence without a caller seed (weighted=%s)", weighted => {
        const game = generatedMechanicsGame(replayModesBlueprint(weighted));
        const session = game.createSession();
        const recorder = new ReplayRecorder();
        const descriptor = recorder.recordAudit(game, session, [{kind: "spin", mode: "buy", roundId: "purchase", delivery: "composite"}],
            {status: "calculated", sessionId: "unseeded", durability: "detached"});
        expect(descriptor).toMatchObject({seed: null, unit: "step", totalBet: 0.5, logicalRound: {status: "completed"},
            artifact: {stake: 0, betMode: "buy"}, modePolicy: {betModeId: "buy", selection: "recorded-commands"}});
        expect(descriptor.audit?.deliveries.map(delivery => delivery.result.stake)).toEqual([0.5, 0]);
        const deliveries = descriptor.audit!.deliveries;
        expect(deliveries[deliveries.length - 1].artifact?.stake).toBe(0.5);
        expect(descriptor.artifact?.steps).toHaveLength(1);
        expect(() => validateAuditReplayDescriptor(JSON.parse(JSON.stringify(descriptor)), game)).not.toThrow();
        expect(recorder.replay(game, descriptor.audit!)).toMatchObject({auditStatus: "verified", artifact: descriptor.artifact, modePolicy: descriptor.modePolicy});
        const legacy = recorder.describeAudit(descriptor.audit!, "logical-round");
        expect(legacy).toMatchObject({unit: "logical-round", artifact: {stake: 0.5}});
        expect(legacy.modePolicy).toBeUndefined();
        expect(() => validateAuditReplayDescriptor(JSON.parse(JSON.stringify(legacy)), game)).not.toThrow();
        for (const forged of [{...descriptor, modePolicy: {betModeId: "base", selection: "recorded-commands"}},
            {...descriptor, modePolicy: {betModeId: "buy", selection: "repeat-when-available"}}, {...descriptor, artifact: legacy.artifact}]) {
            expect(() => validateAuditReplayDescriptor(forged, game)).toThrow(/Outer descriptor contradicts/);
        }
        recorder.releaseAuditSession(session);
    });
});
