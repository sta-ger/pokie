import {Table} from "@mantine/core";

// `screen` is reel-major (screen[reelIndex][rowIndex]) -- the same orientation as everywhere else in
// Pokie (SymbolsCombination/RoundArtifact.screen/reelsSymbols, all indexed [reel][row]) -- so it's
// transposed here into rows before rendering. Reel count (columns) is unbounded, so this always scrolls
// within its own container instead of expanding the page -- see the stabilization pass's
// responsive-tables pass.
//
// `highlightedPositions` -- also [reel, row] pairs, same orientation -- is an optional overlay a caller
// (GameScreenView) already resolved from a win's own winningPositions; this never derives which
// positions won on its own, it only paints whichever cells it's told to.
export function ScreenTable({screen, highlightedPositions}: {screen: string[][]; highlightedPositions?: readonly (readonly number[])[]}) {
    const rowCount = Math.max(0, ...screen.map((reel) => reel.length));
    const rows = Array.from({length: rowCount}, (_, rowIndex) => screen.map((reel) => reel[rowIndex]));
    const highlighted = new Set((highlightedPositions ?? []).map(([reel, row]) => `${reel},${row}`));

    return (
        <Table.ScrollContainer minWidth={200}>
            <Table withColumnBorders>
                <Table.Tbody>
                    {rows.map((row, rowIndex) => (
                        <Table.Tr key={rowIndex}>
                            {row.map((cell, cellIndex) => {
                                const isWinning = highlighted.has(`${cellIndex},${rowIndex}`);
                                return (
                                    <Table.Td key={cellIndex} ta="center" bg={isWinning ? "yellow.1" : undefined} data-winning={isWinning ? "true" : undefined}>
                                        {cell}
                                    </Table.Td>
                                );
                            })}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}
