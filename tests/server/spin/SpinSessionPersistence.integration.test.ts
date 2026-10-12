import {VideoSlotSessionSerializer} from "../../../src/net/videoslot/VideoSlotSessionSerializer.js";
import {loadPokieGame} from "../../../src/gamepackage/loadPokieGame.js";
import {captureInitialPokieSessionState} from "../../../src/server/session/captureInitialPokieSessionState.js";
import {FileSessionRepository} from "../../../src/server/session/FileSessionRepository.js";
import {SpinCommandHandler} from "../../../src/server/spin/SpinCommandHandler.js";
import type {SpinCommandResult} from "../../../src/server/spin/SpinCommandResult.js";
import {InMemoryWallet} from "../../../src/server/wallet/InMemoryWallet.js";
import fs from "fs";
import os from "os";
import path from "path";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

describe("SpinCommandHandler persistence (package-loaded games + file repository)", () => {
    const fixtureRoot = path.join(__dirname, "..", "..", "cli", "fixtures", "playable-game");
    const freeGamesFixtureRoot = path.join(__dirname, "..", "..", "cli", "fixtures", "playable-game-with-free-games");
    let directory: string;

    beforeAll(() => {
        // loadPokieGame uses the installed runtime in these CommonJS fixture packages.
        // Exercise this candidate's compiled codec even when another test left dist behind.
        const repositoryRoot = path.resolve(__dirname, "..", "..", "..");
        ensureCompiledTestOutput({
            repositoryRoot,
            outputPaths: [path.join(repositoryRoot, "dist", "cjs", "index.js")],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
            forceRebuild: true,
        });
    }, 300000);

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-spin-continuation-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    async function initialize(
        game: Awaited<ReturnType<typeof loadPokieGame>>,
        repository: FileSessionRepository,
        wallet: InMemoryWallet,
        sessionId: string,
    ): Promise<SpinCommandHandler> {
        const context = {seed: "save-restore-continuation"};
        const session = game.createSession(context);
        session.setCreditsAmount(1_000);
        await repository.save(sessionId, captureInitialPokieSessionState(context, session, undefined, true, game));
        await wallet.setBalance(sessionId, 1_000);
        const handler = new SpinCommandHandler(game, repository, wallet);
        handler.primeSession(sessionId, session, (await repository.loadVersioned(sessionId))?.version);
        return handler;
    }

    it("reconstructs the constructor continuation before the first spin without exposing RNG in player payloads", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const serializer = new VideoSlotSessionSerializer();
        const session = game.createSession({seed: "save-restore-continuation"});
        const initial = captureInitialPokieSessionState({seed: "save-restore-continuation"}, session, serializer, true, game);
        expect(initial.featureState).toMatchObject({rngState: expect.any(Number)});
        expect(JSON.stringify(initial.initialPayload)).not.toContain("rngState");
        const repository = new FileSessionRepository(directory);
        await repository.save("initial", initial);
        const wallet = new InMemoryWallet();
        await wallet.setBalance("initial", 1000);
        const reconstructed = new SpinCommandHandler(game, new FileSessionRepository(directory), wallet);
        const result = await reconstructed.handle("initial");
        session.setBet(1);
        session.play();
        expect(result).toMatchObject({status: "played", state: {screen: (session as unknown as {getSymbolsCombination(): {toMatrix(): string[][]}}).getSymbolsCombination().toMatrix(), win: session.getWinAmount(), featureState: (session as unknown as {toSessionState(): unknown}).toSessionState()}});
    });

    it("has the same deterministic next round after save, destruction, restore, and continuation", async () => {
        const game = await loadPokieGame(fixtureRoot);

        const continuousRepository = new FileSessionRepository(path.join(directory, "continuous"));
        const continuousWallet = new InMemoryWallet();
        const continuous = await initialize(game, continuousRepository, continuousWallet, "continuous");
        await continuous.handle("continuous");
        const uninterruptedNext = await continuous.handle("continuous");

        const restoredDirectory = path.join(directory, "restored");
        const initialRepository = new FileSessionRepository(restoredDirectory);
        const restoredWallet = new InMemoryWallet();
        const beforeRestart = await initialize(game, initialRepository, restoredWallet, "restored");
        await beforeRestart.handle("restored");

        // A fresh repository and handler model process destruction: no live session and no in-memory
        // RNG survives, only the state atomically written by the first handler does.
        const afterRestart = new SpinCommandHandler(game, new FileSessionRepository(restoredDirectory), restoredWallet);
        const restoredNext = await afterRestart.handle("restored");

        expect({...restoredNext, sessionId: "continuous"}).toEqual(uninterruptedNext);
        await expect(new FileSessionRepository(restoredDirectory).load("restored")).resolves.toEqual(
            await continuousRepository.load("continuous"),
        );
    });

    it("keeps an unseeded default session live-only and rejects cache loss without mutation", async () => {
        const game = await loadPokieGame(fixtureRoot);
        const session = game.createSession();
        const initial = captureInitialPokieSessionState(undefined, session, undefined, true, game);
        expect(initial.executionState).toBe("live-only");
        const repository = new FileSessionRepository(directory);
        const wallet = new InMemoryWallet();
        await repository.save("unseeded", initial);
        await wallet.setBalance("unseeded", session.getCreditsAmount());
        const live = new SpinCommandHandler(game, repository, wallet);
        live.primeSession("unseeded", session, (await repository.loadVersioned("unseeded"))?.version);
        expect((await live.handle("unseeded")).status).toBe("played");

        const before = await repository.loadVersioned("unseeded");
        const balance = await wallet.getBalance("unseeded");
        const restored = new SpinCommandHandler(game, new FileSessionRepository(directory), wallet);
        expect(await restored.handle("unseeded")).toMatchObject({status: "restoration-unsupported", sessionId: "unseeded"});
        expect(await repository.loadVersioned("unseeded")).toEqual(before);
        expect(await wallet.getBalance("unseeded")).toBe(balance);
    });

    it("preserves a live free-games continuation and its nested base RNG across destruction and restore", async () => {
        const game = await loadPokieGame(freeGamesFixtureRoot);
        const continuousRepository = new FileSessionRepository(path.join(directory, "free-continuous"));
        const continuousWallet = new InMemoryWallet();
        const continuous = await initialize(game, continuousRepository, continuousWallet, "free-continuous");

        // This real fixture deterministically awards ten free rounds on its eighth paid round.
        for (let round = 0; round < 8; round++) await continuous.handle("free-continuous");
        const uninterruptedNext = await continuous.handle("free-continuous");

        const restoredDirectory = path.join(directory, "free-restored");
        const restoredRepository = new FileSessionRepository(restoredDirectory);
        const restoredWallet = new InMemoryWallet();
        const beforeRestart = await initialize(game, restoredRepository, restoredWallet, "free-restored");
        for (let round = 0; round < 8; round++) await beforeRestart.handle("free-restored");

        const persisted = await restoredRepository.load("free-restored");
        expect(persisted?.executionState).toBe("durably-restorable");
        expect(persisted?.featureState).toMatchObject({freeGamesNum: 0, freeGamesSum: 10, base: {rngState: expect.any(Number)}});

        const restoredGame = await loadPokieGame(freeGamesFixtureRoot);
        const afterRestart = new SpinCommandHandler(restoredGame, new FileSessionRepository(restoredDirectory), restoredWallet);
        const restoredNext = await afterRestart.handle("free-restored");

        expect({...restoredNext, sessionId: "free-continuous"}).toEqual(uninterruptedNext);
        await expect(new FileSessionRepository(restoredDirectory).load("free-restored")).resolves.toEqual(
            await continuousRepository.load("free-continuous"),
        );
    });

    it("reconstructs durable executable state when two handlers alternate committed versions", async () => {
        const game = await loadPokieGame(freeGamesFixtureRoot);
        const continuousRepository = new FileSessionRepository(path.join(directory, "alternating-continuous"));
        const continuousWallet = new InMemoryWallet();
        const continuous = await initialize(game, continuousRepository, continuousWallet, "continuous");
        const alternatingRepository = new FileSessionRepository(path.join(directory, "alternating"));
        const alternatingWallet = new InMemoryWallet();
        const handlerA = await initialize(game, alternatingRepository, alternatingWallet, "alternating");
        const handlerB = new SpinCommandHandler(game, alternatingRepository, alternatingWallet);

        const spinAtCommittedVersion = async (handler: SpinCommandHandler, repository: FileSessionRepository, sessionId: string) => {
            const record = await repository.loadVersioned(sessionId);
            if (record === undefined) throw new Error("Expected durable session record.");
            return handler.handle(sessionId, undefined, record.version);
        };

        // Enter the fixture's deterministic ten-round free feature with handler A holding a
        // live cache. B then has to rebuild at A's version, and A has to discard its stale cache
        // at B's next version rather than replaying an old freeGamesNum/RNG state.
        for (let round = 0; round < 8; round++) {
            await spinAtCommittedVersion(continuous, continuousRepository, "continuous");
            await spinAtCommittedVersion(handlerA, alternatingRepository, "alternating");
        }
        const alternatingResults: SpinCommandResult[] = [];
        const continuousResults: SpinCommandResult[] = [];
        // Continue through feature completion and the following paid round to cover both mode
        // transitions, bank settlement and RNG continuity, rebuilding at each committed revision.
        for (let round = 0; round < 11; round++) {
            const handler = round % 2 === 0 ? handlerB : handlerA;
            continuousResults.push(await spinAtCommittedVersion(continuous, continuousRepository, "continuous"));
            alternatingResults.push(await spinAtCommittedVersion(handler, alternatingRepository, "alternating"));
        }

        expect(alternatingResults.map((result) => ({...result, sessionId: "continuous"}))).toEqual(continuousResults);
        expect(alternatingResults.slice(0, 10).map((result) => result.status === "played" ? (result.state.featureState as {freeGamesNum?: unknown})?.freeGamesNum : undefined)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const paidRound = alternatingResults[10];
        expect(paidRound.status).toBe("played");
        if (paidRound.status !== "played") throw new Error("Expected a settled paid round after feature completion.");
        expect(paidRound.state.featureState).toMatchObject({freeGamesNum: 0, freeGamesBank: 0});
        const previousCredits = paidRound.previousState?.credits;
        if (previousCredits === undefined) throw new Error("Expected persisted credits before the paid round.");
        expect(paidRound.credits).toBe(previousCredits - paidRound.state.bet + paidRound.win);
        expect(await alternatingRepository.load("alternating")).toEqual(await continuousRepository.load("continuous"));
    });
});
