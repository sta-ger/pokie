import type {IdempotencyRepository} from "./idempotency/IdempotencyRepository.js";
import type {SessionRepository} from "./session/SessionRepository.js";
import type {SpinCommandResult} from "./spin/SpinCommandResult.js";
import type {WalletPort} from "./wallet/WalletPort.js";

export type PokieDevServerOptions = {
    host?: string;
    port?: number;
    sessionRepository?: SessionRepository;
    wallet?: WalletPort;
    idempotencyRepository?: IdempotencyRepository<SpinCommandResult>;
};
