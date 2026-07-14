import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import type {IdempotencyRepository} from "./idempotency/IdempotencyRepository.js";
import type {PreGeneratedSessionRepository} from "./pregenerated/PreGeneratedSessionRepository.js";
import type {PreGeneratedSpinCommandResult} from "./pregenerated/PreGeneratedSpinCommandResult.js";
import type {SessionRepository} from "./session/SessionRepository.js";
import type {SpinCommandResult} from "./spin/SpinCommandResult.js";
import type {WalletPort} from "./wallet/WalletPort.js";

export type PokieDevServerOptions = {
    host?: string;
    port?: number;
    sessionRepository?: SessionRepository;
    wallet?: WalletPort;
    idempotencyRepository?: IdempotencyRepository<SpinCommandResult>;
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
