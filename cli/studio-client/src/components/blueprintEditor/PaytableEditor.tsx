import {Button, Group, NumberInput, Select, Table} from "@mantine/core";
import {useEffect, useState} from "react";
import {asStringList} from "../../domain/asStringList";
import {duplicatePaytablePayout, removePaytablePayout, setPaytablePayout} from "../../domain/blueprintFormOps";
import {parsePayoutInput} from "../../domain/paytableInput";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";
import {symbolArtworkFromBlueprint, SymbolPresentation} from "../common/SymbolPresentation";

type PaytableRow = {symbolId: string; matchCount: number; payout: number};

// A payout field must stay editable while the user types, but a blank/text value may never be
// committed as 0. Keep the draft local and only write a parsed, non-negative number on blur; an
// invalid draft snaps back to the last saved value and stays visibly explained.
function PayoutInput({label, value, onCommit}: {label: string; value: number; onCommit: (value: number) => void}) {
    const [draft, setDraft] = useState<number | string>(value);
    const [error, setError] = useState<string>();

    useEffect(() => {
        setDraft(value);
        setError(undefined);
    }, [value]);

    return (
        <div>
            <NumberInput
                aria-label={label}
                value={draft}
                min={0}
                allowNegative={false}
                onChange={(input) => {
                    setDraft(input);
                    setError(undefined);
                }}
                onBlur={() => {
                    const parsed = parsePayoutInput(draft, value);
                    setDraft(parsed.value);
                    setError(parsed.error);
                    if (parsed.error === undefined) {
                        onCommit(parsed.value);
                    }
                }}
                error={error}
            />
        </div>
    );
}

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
    const symbols = asStringList(blueprint.symbols);
    const symbolOrder = new Map(symbols.map((symbol, index) => [symbol, index]));
    const rows = flattenPaytable(blueprint.paytable).sort((left, right) => {
        const leftOrder = symbolOrder.get(left.symbolId);
        const rightOrder = symbolOrder.get(right.symbolId);
        if (leftOrder !== undefined || rightOrder !== undefined) {
            return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER)
                || left.matchCount - right.matchCount;
        }
        return left.symbolId.localeCompare(right.symbolId) || left.matchCount - right.matchCount;
    });
    const maxMatchCount = typeof blueprint.reels === "number" && blueprint.reels > 0 ? blueprint.reels : 1;
    const artwork = symbolArtworkFromBlueprint(blueprint);

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
                                <Table.Td><SymbolPresentation symbolId={row.symbolId} artwork={artwork} /></Table.Td>
                                <Table.Td>{row.matchCount}</Table.Td>
                                <Table.Td>
                                    <PayoutInput
                                        label={`${row.symbolId} x${row.matchCount} payout`}
                                        value={row.payout}
                                        onCommit={(value) => mutate((b) => setPaytablePayout(b, row.symbolId, row.matchCount, value))}
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
                            const matchCountText = String(newMatchCount).trim();
                            const payoutText = String(newPayout).trim();
                            const matchCount = Number(matchCountText);
                            const payout = Number(payoutText);
                            if (newSymbol === null || newSymbol.length === 0
                                || matchCountText.length === 0 || !Number.isFinite(matchCount) || matchCount < 2
                                || payoutText.length === 0 || !Number.isFinite(payout) || payout < 0) {
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
