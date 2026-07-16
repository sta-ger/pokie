import {Button, Group, List, NumberInput} from "@mantine/core";
import {useState} from "react";
import {addBet, duplicateBetAt, moveBetAt, removeBetAt, setBetAt} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedNumberInput} from "../common/BufferedNumberInput";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

function asNumberList(value: unknown): number[] {
    return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

export function BetsList({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const bets = asNumberList(blueprint.availableBets);
    const [newBet, setNewBet] = useState<number | string>("");

    return (
        <PageSection legend="Available bets">
            <List listStyleType="none" spacing={4}>
                {bets.map((bet, index) => (
                    <List.Item key={index}>
                        <Group gap="xs">
                            <BufferedNumberInput
                                aria-label={`Bet ${index + 1}`}
                                value={bet}
                                step="any"
                                onCommit={(value) => mutate((b) => setBetAt(b, index, value))}
                            />
                            <RowActions
                                itemLabel={`bet ${index + 1}`}
                                onDuplicate={() => mutate((b) => duplicateBetAt(b, index))}
                                onRemove={() => mutate((b) => removeBetAt(b, index))}
                                onMoveUp={index > 0 ? () => mutate((b) => moveBetAt(b, index, index - 1)) : undefined}
                                onMoveDown={index < bets.length - 1 ? () => mutate((b) => moveBetAt(b, index, index + 1)) : undefined}
                            />
                        </Group>
                    </List.Item>
                ))}
            </List>
            <QuickActions>
                <NumberInput
                    placeholder="New bet amount"
                    aria-label="New bet amount"
                    step="any"
                    value={newBet}
                    onChange={setNewBet}
                />
                <Button
                    variant="default"
                    onClick={() => {
                        const value = Number(newBet);
                        if (!Number.isFinite(value) || newBet === "") {
                            return;
                        }
                        mutate((b) => addBet(b, value));
                        setNewBet("");
                    }}
                >
                    Add bet
                </Button>
            </QuickActions>
        </PageSection>
    );
}
