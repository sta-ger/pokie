import type {SessionRepository} from "./SessionRepository.js";
import type {VersionedSessionRepository} from "./VersionedSessionRepository.js";

// Feature-detected: true for a repository that already implements the optimistic-locking API (e.g.
// InMemorySessionRepository, FileSessionRepository), false for a plain legacy SessionRepository
// (save()/load() only) — see VersionedSessionRepository's own doc comment for what's additive here.
export function isVersionedSessionRepository(repository: SessionRepository): repository is VersionedSessionRepository {
    const candidate = repository as Partial<VersionedSessionRepository>;
    return typeof candidate.loadVersioned === "function" && typeof candidate.saveVersioned === "function";
}
