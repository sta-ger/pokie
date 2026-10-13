import type {RepositoryCommand} from "../../runtime/RepositoryCommand.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {IdempotencyRepository} from "../idempotency/IdempotencyRepository.js";
import type {PokieSessionState} from "../session/PokieSessionState.js";
import type {VersionedSessionRepository, VersionedSessionState} from "../session/VersionedSessionRepository.js";
import type {SpinCommandResult} from "../spin/SpinCommandResult.js";
import type {SpinOperationLog} from "../spin/SpinOperationLog.js";
import type {TransactionalWalletPort} from "../wallet/TransactionalWalletPort.js";

/** These participants are valid only during the owning callback. Never retain or export them. */
export interface RoundTransaction {
    readonly sessions: VersionedSessionRepository;
    readonly ledger: TransactionalWalletPort;
    readonly results: IdempotencyRepository<SpinCommandResult>;
    readonly operations: SpinOperationLog;
}

/** One explicit durable boundary; unrelated repository/wallet implementations confer no ACID claim.
 * Ownership precedes identity lookup and calculation. Non-played results and exceptions roll back.
 * close() rejects new work and drains accepted callbacks before releasing the connection.
 */
export interface TransactionalRoundStore {
    initialize(sessionId: string, state: PokieSessionState, game: PokieGame): Promise<void>;
    readSession(sessionId: string): Promise<VersionedSessionState | undefined>;
    getBalance(sessionId: string): Promise<number>;
    lookupResult(sessionId: string, requestId: string): Promise<SpinCommandResult | undefined>;
    transact(command: RepositoryCommand, work: (transaction: RoundTransaction, command: RepositoryCommand) => Promise<SpinCommandResult>): Promise<SpinCommandResult>;
    close(): Promise<void>;
}
