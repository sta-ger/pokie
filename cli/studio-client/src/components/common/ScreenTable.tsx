import {Table} from "@mantine/core";

export function ScreenTable({screen}: {screen: string[][]}) {
    return (
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
    );
}
