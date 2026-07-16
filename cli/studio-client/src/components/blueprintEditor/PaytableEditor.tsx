import {Button, Group, NumberInput, Select, Table} from "@mantine/core";
import {useState} from "react";
import {asStringList} from "../../domain/asStringList";
import {duplicatePaytablePayout, removePaytablePayout, setPaytablePayout} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

type PaytableRow = {symbolId: string; matchCount: number; payout: number};

function flattenPaytable(value: unknown): PaytableRow[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [];
    }
    const rows: PaytableRow[] = [];
    for (const [symbolId, payouts] of Object.entries(value as Record<string, unknown>)) {
        if (typeof payouts !== "object" || payouts === null || Array.isArray(payouts)) {
            continue;
        }
        for (const [times, multiplier] of Object.entries(payouts as Record<string, unknown>)) {
            if (typeof multiplier === "number") {
                rows.push({symbolId, matchCount: Number(times), payout: multiplier});
            }
        }
    }
    return rows;
}

export function PaytableEditor({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const rows = flattenPaytable(blueprint.paytable);
    const symbols = asStringList(blueprint.symbols);
    const maxMatchCount = typeof blueprint.reels === "number" && blueprint.reels > 0 ? blueprint.reels : 1;

    const [newSymbol, setNewSymbol] = useState<string | null>(null);
    const [newMatchCount, setNewMatchCount] = useState<number | string>("");
    const [newPayout, setNewPayout] = useState<number | string>("");

    return (
        <PageSection legend="Paytable">
            <Table.ScrollContainer minWidth={480}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Symbol</Table.Th>
                            <Table.Th>Match count</Table.Th>
                            <Table.Th>Payout (x bet)</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map((row) => (
                            <Table.Tr key={`${row.symbolId}-${row.matchCount}`}>
                                <Table.Td>{row.symbolId}</Table.Td>
                                <Table.Td>{row.matchCount}</Table.Td>
                                <Table.Td>
                                    <NumberInput
                                        aria-label={`${row.symbolId} x${row.matchCount} payout`}
                                        defaultValue={row.payout}
                                        onBlur={(event) => {
                                            const value = Number(event.currentTarget.value);
                                            if (Number.isFinite(value)) {
                                                mutate((b) => setPaytablePayout(b, row.symbolId, row.matchCount, value));
                                            }
                                        }}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <RowActions
                                        itemLabel={`${row.symbolId} x${row.matchCount} payout`}
                                        onDuplicate={() => mutate((b) => duplicatePaytablePayout(b, row.symbolId, row.matchCount, maxMatchCount))}
                                        onRemove={() => mutate((b) => removePaytablePayout(b, row.symbolId, row.matchCount))}
                                    />
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            <QuickActions>
                <Select aria-label="Symbol" placeholder="Symbol" data={symbols} value={newSymbol} onChange={setNewSymbol} />
                <NumberInput aria-label="Match count" placeholder="Match count" min={2} step={1} value={newMatchCount} onChange={setNewMatchCount} />
                <NumberInput aria-label="Payout" placeholder="Payout" value={newPayout} onChange={setNewPayout} />
                <Group>
                    <Button
                        variant="default"
                        onClick={() => {
                            const matchCount = Number(newMatchCount);
                            const payout = Number(newPayout);
                            if (newSymbol === null || newSymbol.length === 0 || !Number.isFinite(matchCount) || !Number.isFinite(payout)) {
                                return;
                            }
                            mutate((b) => setPaytablePayout(b, newSymbol, matchCount, payout));
                        }}
                    >
                        Add payout
                    </Button>
                </Group>
            </QuickActions>
        </PageSection>
    );
}
