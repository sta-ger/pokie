/** Internal deterministic fault instrumentation. No package barrel/browser export. */
type BoundaryHook = (boundary: string) => Promise<void>;
const hooks = new WeakMap<object, BoundaryHook>();
export function setTransactionBoundaryHook(owner: object, hook: (boundary: string) => Promise<void>): void {
    hooks.set(owner, hook);
}
export async function transactionBoundary(owner: object, boundary: string): Promise<void> {
    await hooks.get(owner)?.(boundary);
}
