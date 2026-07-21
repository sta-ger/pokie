import type {JackpotPoolRepresenting} from "./JackpotPoolRepresenting.js";
import type {JackpotAwardResult} from "./JackpotAwardResult.js";
import type {JackpotTriggerContext} from "./JackpotTriggerContext.js";

// Resolves *which* configured pool/tier a round JackpotTriggering already confirmed wins a jackpot actually
// pays out, and banks it by calling that pool's own award(). Only ever consulted once JackpotTriggering has
// already said yes — never responsible for the yes/no decision itself (see JackpotTriggering), only for tier
// selection among whatever pools are configured. "pools" is always non-empty when this is called (see
// JackpotRoundHandler, which never triggers at all when no pools are configured).
export interface JackpotAwarding<T extends string | number | symbol = string> {
    resolveAward(pools: readonly JackpotPoolRepresenting[], context: JackpotTriggerContext<T>): JackpotAwardResult<T>;
}
