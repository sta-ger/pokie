import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import type {IdempotencyRepository} from "./idempotency/IdempotencyRepository.js";
import type {PreGeneratedSessionRepository} from "./pregenerated/PreGeneratedSessionRepository.js";
import type {PreGeneratedSpinCommandResult} from "./pregenerated/PreGeneratedSpinCommandResult.js";
import type {SessionRepository} from "./session/SessionRepository.js";
import type {SpinCommandResult} from "./spin/SpinCommandResult.js";
import type {SpinOperationLog} from "./spin/SpinOperationLog.js";
import type {WalletPort} from "./wallet/WalletPort.js";

export type PokieDevServerOptions = {
    host?: string;
    port?: number;
    sessionRepository?: SessionRepository;
    wallet?: WalletPort;
    idempotencyRepository?: IdempotencyRepository<SpinCommandResult>;
    // Additive, opt-in-only: what SpinCommandHandler checkpoints each requestId-bearing spin attempt's
    // own progress to, for reconciliation/retry recovery after an interrupted attempt (see
    // SpinCommandHandler's own doc comment). Defaults to an in-memory log, the same "lost on a
    // crash/restart" tradeoff idempotencyRepository's own default already has — a deployment that needs
    // this to survive a crash must provide a durable implementation itself.
    spinOperationLog?: SpinOperationLog;
    // Additive, opt-in-only, defaults to false: certifies that this PokieDevServer's own SpinCommandHandler
    // is the *sole* one — in this process or any other — ever operating against sessionRepository/wallet/
    // idempotencyRepository/spinOperationLog, which is what makes it safe for a retried requestId's own
    // interrupted prior attempt to be automatically reversed/resumed rather than reported as needing
    // manual recovery (see SpinCommandHandler's own "Multi-instance safety" doc comment section). Leave
    // this false whenever more than one PokieDevServer process might share the same durable stores (e.g.
    // several instances pointed at the same FileSessionRepository directory for horizontal scaling).
    singleInstanceDeployment?: boolean;
    // Additive, opt-in-only pre-generated round support (see PokieDevServer's own doc comment,
    // "Pre-generated rounds"): when given, `POST /pregenerated-sessions` and
    // `POST /pregenerated-sessions/:id/spin` become active, drawing rounds from this fixed,
    // already-built library instead of running the loaded game's own calculation path. Absent (the
    // default), those routes 404 exactly like any other unknown route — zero behavior change to the
    // existing `/sessions` routes either way.
    preGeneratedOutcomeLibrary?: WeightedOutcomeLibrary;
    preGeneratedSessionRepository?: PreGeneratedSessionRepository;
    preGeneratedIdempotencyRepository?: IdempotencyRepository<PreGeneratedSpinCommandResult>;
};
