import {Table} from "@mantine/core";

// A plain, unhighlighted reel-major screen preview -- `screen` is reel-major (screen[reelIndex][rowIndex]),
// the same orientation as everywhere else in Pokie (SymbolsCombination/RoundArtifact.screen/reelsSymbols,
// all indexed [reel][row]), so it's transposed here into rows before rendering. Reel count (columns) is
// unbounded, so this always scrolls within its own container instead of expanding the page -- see the
// stabilization pass's responsive-tables pass.
//
// Every round-inspection surface (Play, Replay, sampled rounds, Outcome Library) that needs a screen with
// its own wins highlighted renders through GameScreenView/CanonicalPlayerView instead -- that component
// mounts cli/client/player's own canonical DOM grid/highlight functions directly (see its own doc
// comment), not this table. ScreenTable itself is only ever a bare preview grid today (Blueprint Editor's
// own reel-strip generation window), with no win/payline data of its own to show.
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
