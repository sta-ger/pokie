import {Table} from "@mantine/core";

// Reel count (columns) is unbounded, so this always scrolls within its own container instead of
// expanding the page -- see the stabilization pass's responsive-tables pass.
export function ScreenTable({screen}: {screen: string[][]}) {
    return (
        <Table.ScrollContainer minWidth={200}>
            <Table withColumnBorders>
                <Table.Tbody>
                    {screen.map((row, rowIndex) => (
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
