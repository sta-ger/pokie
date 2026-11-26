/** "1 spin" / "2 spins" without scattering plural branches through JSX. */
export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
}
