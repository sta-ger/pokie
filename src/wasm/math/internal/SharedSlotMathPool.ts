import {deepFreeze} from "../../../internal/deepFreeze.js";
import {lowerSharedSlotMath, SharedSlotMath, stableSlotMathJson, type SharedSlotMathCalculating, type SharedSlotMathModel} from "../SharedSlotMath.js";

export type OwnedSharedSlotMath = SharedSlotMathCalculating & {dispose(): void};

/** Game-owned scratch memory, independent of session results and executable state. */
export class SharedSlotMathPool {
    private readonly entries = new Map<string, SharedSlotMath>();
    private disposed = false;

    public create(input: SharedSlotMathModel): OwnedSharedSlotMath {
        if (this.disposed) throw new Error("Shared WASM math pool was disposed.");
        lowerSharedSlotMath(input);
        const model = deepFreeze(JSON.parse(JSON.stringify(input)) as SharedSlotMathModel);
        lowerSharedSlotMath(model);
        const key = stableSlotMathJson(model);
        let disposed = false;
        return {
            model,
            evaluate: (screen, bet) => {
                if (disposed || this.disposed) throw new Error("Shared WASM math was disposed.");
                let math = this.entries.get(key);
                if (!math) {
                    // Eviction cannot invalidate another facade: each call reacquires by
                    // its validated immutable model. No session holds the scratch instance.
                    if (this.entries.size === 8) {
                        const oldest = this.entries.keys().next().value!;
                        this.entries.get(oldest)!.dispose();
                        this.entries.delete(oldest);
                    }
                    math = new SharedSlotMath(model);
                }
                this.entries.delete(key);
                this.entries.set(key, math);
                return math.evaluate(screen, bet);
            },
            dispose: () => {
                disposed = true;
            },
        };
    }

    public dispose(): void {
        this.disposed = true;
        for (const math of this.entries.values()) math.dispose();
        this.entries.clear();
    }
}
