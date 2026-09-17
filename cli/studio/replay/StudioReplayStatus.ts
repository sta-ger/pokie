/** Mirrors the durable Studio job lifecycle while retaining replay's DTO. */
export type StudioReplayStatus = "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "recovery-required";
