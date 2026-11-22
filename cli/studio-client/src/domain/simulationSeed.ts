// A short, readable seed for Studio-launched simulations. Studio now prefills this field so an
// ordinary run is reproducible by default; the seed also travels with the report and its history row.
// The value itself has no mathematical meaning -- it only needs to be unique enough to avoid
// accidentally replaying an earlier sample, and short enough to read out loud or paste into `pokie sim`.
export function generateSimulationSeed(): string {
    const cryptoApi = typeof globalThis === "undefined" ? undefined : globalThis.crypto;
    const random = cryptoApi !== undefined && typeof cryptoApi.randomUUID === "function"
        ? cryptoApi.randomUUID().replace(/-/g, "").slice(0, 12)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return `studio-${random}`;
}
