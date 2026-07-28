import {Table} from "@mantine/core";

// `screen` is reel-major (screen[reelIndex][rowIndex]) -- the same orientation as everywhere else in
// Pokie (SymbolsCombination/RoundArtifact.screen/reelsSymbols, all indexed [reel][row]) -- so it's
// transposed here into rows before rendering. Reel count (columns) is unbounded, so this always scrolls
// within its own container instead of expanding the page -- see the stabilization pass's
// responsive-tables pass.
export function ScreenTable({screen}: {screen: string[][]}) {
    const rowCount = Math.max(0, ...screen.map((reel) => reel.length));
    const rows = Array.from({length: rowCount}, (_, rowIndex) => screen.map((reel) => reel[rowIndex]));

    return (
        <Table.ScrollContainer minWidth={200}>
            <Table withColumnBorders>
                <Table.Tbody>
                    {rows.map((row, rowIndex) => (
                        <Table.Tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                                <Table.Td key={cellIndex} ta="center">
                                    {cell}
                                </Table.Td>
                            ))}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}
