/** Mirrors the durable Studio job lifecycle while retaining simulation's DTO. */
export type StudioSimulationStatus = "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "recovery-required";
