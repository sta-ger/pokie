import {WinComponent} from "./WinComponent.js";

export class LegacyWinComponent<T extends string | number | symbol = string> extends WinComponent<T> {
    constructor(winAmount: number, metadata: Record<string, unknown> = {}) {
        super("legacy", "legacy-total", undefined as unknown as T, winAmount, [], [], metadata);
    }
}
