export type ContributionTableEntry = {
    readonly label: string;
    readonly rtpContribution: number;
};

/**
 * Orders contribution rows by RTP contribution, highest first, and uses the displayed label as the
 * tie-break. The rounding matters: the server keeps full floating-point precision, so two equal
 * displayed contributions can differ by a tiny epsilon and otherwise look arbitrarily ordered.
 */
export function orderContributionEntries<T extends ContributionTableEntry>(entries: readonly T[]): T[] {
    const contributionAtDisplayPrecision = (value: number): number => Math.round(value * 1e6);
    return [...entries].sort((left, right) => {
        const leftContribution = contributionAtDisplayPrecision(left.rtpContribution);
        const rightContribution = contributionAtDisplayPrecision(right.rtpContribution);
        return leftContribution === rightContribution
            ? left.label.localeCompare(right.label)
            : rightContribution - leftContribution;
    });
}
