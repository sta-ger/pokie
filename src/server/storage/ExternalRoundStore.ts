import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {RepositoryCommand} from "../../runtime/RepositoryCommand.js";
import type {PokieSessionState} from "../session/PokieSessionState.js";
import type {VersionedSessionState} from "../session/VersionedSessionRepository.js";
import type {SpinCommandResult} from "../spin/SpinCommandResult.js";

export interface ExternalRoundPreparation extends VersionedSessionState {
    readonly balance: number;
    /** The same captured envelope that the store binds to this request identity. */
    readonly command: RepositoryCommand;
}

export interface ExternalRoundCandidate {
    readonly result: SpinCommandResult;
    readonly settlement?: {readonly debit: number; readonly payout: {readonly kind: "debit" | "credit"; readonly amount: number}};
}

/** Durable local intent plus independent provider reconciliation; explicitly NOT distributed ACID.
 * The store owns session claims, command envelopes and retained results. prepare calculates against
 * a private local ledger and has no remote settlement authority. Session advancement is published
 * only after both original provider identities are confirmed. close drains bounded accepted work.
 */
export interface ExternalRoundStore {
    readonly externalSettlement: true;
    readonly capabilities: {readonly durableIntent: true; readonly durableResults: true; readonly sessionFencing: true};
    initialize(sessionId: string, state: PokieSessionState, game: PokieGame): Promise<void>;
    readSession(sessionId: string): Promise<VersionedSessionState | undefined>;
    getBalance(sessionId: string): Promise<number>;
    lookupResult(sessionId: string, requestId: string): Promise<SpinCommandResult | undefined>;
    execute(command: RepositoryCommand, game: PokieGame,
        prepare: (snapshot: ExternalRoundPreparation) => Promise<ExternalRoundCandidate>, signal?: AbortSignal): Promise<SpinCommandResult>;
    pendingCommands(): Promise<readonly RepositoryCommand[]>;
    close(): Promise<void>;
}

export function isExternalRoundStore(value: unknown): value is ExternalRoundStore {
    const store = value as Partial<ExternalRoundStore> | null;
    return typeof store === "object" && store !== null && store.externalSettlement === true &&
        store.capabilities?.durableIntent === true && store.capabilities.durableResults === true && store.capabilities.sessionFencing === true &&
        [store.initialize, store.readSession, store.getBalance, store.lookupResult, store.execute, store.pendingCommands, store.close].every(method => typeof method === "function");
}
