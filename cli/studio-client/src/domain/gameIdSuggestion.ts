/**
 * A collision fallback for the guided creator when the server cannot name a free managed id (for
 * example because the existing project cannot be opened). It never claims the id is free; it only
 * gives the author a concrete next candidate to try instead of leaving them with "choose another id".
 */
export function nextAvailableLookingGameId(current: string): string {
    const candidate = current.trim();
    if (candidate.length === 0) return "my-game";
    const match = (/^(.*?)(?:-(\d+))?$/).exec(candidate);
    const base = match?.[1]?.trim() || candidate;
    const suffix = match?.[2] === undefined ? 2 : Number(match[2]) + 1;
    return `${base}-${suffix}`;
}
