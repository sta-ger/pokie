import type {StudioProjectRegistryEntry} from "./StudioProjectRegistryEntry.js";

// "missing" once an entry's own `location` can no longer be found on disk -- moved, deleted, or renamed
// outside Studio. Never persisted on the entry itself (see StudioProjectRegistryEntry's own doc comment);
// always computed fresh by StudioProjectRegistrationService.list() at read time.
export type StudioProjectStatus = "ok" | "missing" | "unavailable";

// What StudioProjectRegistrationService.list()/register() actually return -- a stored
// StudioProjectRegistryEntry plus its freshly-computed `status`, the read model a Home "Projects" surface
// would render directly (name, type, origin, location for "show in folder", last-opened, status, and
// capabilities as the project's own capability summary).
export type StudioProjectRegistryView = StudioProjectRegistryEntry & {readonly status: StudioProjectStatus};
