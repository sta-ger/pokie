import type {PreGeneratedSessionRepository} from "./PreGeneratedSessionRepository.js";
import type {VersionedPreGeneratedSessionRepository} from "./VersionedPreGeneratedSessionRepository.js";

// Feature-detected: true for a repository that already implements the optimistic-locking API (e.g.
// InMemoryPreGeneratedSessionRepository), false for a plain legacy PreGeneratedSessionRepository
// (save()/load() only) — see VersionedPreGeneratedSessionRepository's own doc comment for what's
// additive here.
export function isVersionedPreGeneratedSessionRepository(
    repository: PreGeneratedSessionRepository,
): repository is VersionedPreGeneratedSessionRepository {
    const candidate = repository as Partial<VersionedPreGeneratedSessionRepository>;
    return typeof candidate.loadVersioned === "function" && typeof candidate.saveVersioned === "function";
}
