import {validateAuthoredMechanics} from "../../../../../src/generated/validateAuthoredMechanics";
import {IssueList} from "../common/IssueList";
import {Button, Checkbox, NumberInput, Select, Stack, Text, TextInput} from "@mantine/core";
import type {GameBlueprintHoldAndWin, GameBlueprintJackpot, GameBlueprintMechanics} from "../../../../../src/generated/GameBlueprint";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {asStringList} from "../../domain/asStringList";

/** Shared Home/Project draft controls. Persistence remains the editor's explicit Apply/Save. */
export function ExistingMechanicsFieldset({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const mechanics = (blueprint.mechanics ?? {}) as GameBlueprintMechanics;
    const symbols = asStringList(blueprint.symbols);
    const hold = mechanics.holdAndWin;
    const jackpot = mechanics.jackpot;
    const issues = validateAuthoredMechanics(blueprint);
    const holdEditable = isObject(hold) && typeof hold.minimumCount === "number" && typeof hold.initialRespins === "number" &&
        isObject(hold.payout) && typeof hold.payout.amountsAreBetMultiples === "boolean" && isObject(hold.symbolEffects) &&
        Object.values(hold.symbolEffects).every(effect => isObject(effect) && (effect.kind === "value" ? typeof effect.amount === "number" : effect.kind === "multiplier" && typeof effect.factor === "number"));
    const jackpotEditable = isObject(jackpot) && isObject(jackpot.pool) && typeof jackpot.pool.id === "string" &&
        (jackpot.pool.type === "fixed" ? typeof jackpot.pool.amount === "number" : jackpot.pool.type === "accumulating" && typeof jackpot.pool.seedValue === "number") &&
        isObject(jackpot.trigger) && typeof jackpot.trigger.symbolId === "string" && typeof jackpot.trigger.minimumCount === "number" &&
        isObject(jackpot.contribution) && typeof jackpot.contribution.percentage === "number";

    const set = (key: "holdAndWin" | "jackpot", value: GameBlueprintHoldAndWin | GameBlueprintJackpot | undefined): void => mutate(b => {
        const next = {...(b.mechanics as GameBlueprintMechanics ?? {})};
        if (value === undefined) Reflect.deleteProperty(next, key);
        else Object.assign(next, {[key]: value});
        b.mechanics = next;
    });
    return <Stack>
        <IssueList title="Mechanic validation" issues={issues} />
        <PageSection legend="Hold & Win">
            {hold === undefined && <Button onClick={() => set("holdAndWin", {minimumCount: 1, initialRespins: 3, retriggerPolicy: "reset-on-new-lock", symbolEffects: {[symbols[0] ?? ""]: {kind: "value", amount: 1}}, payout: {type: "sum-with-multiplier", amountsAreBetMultiples: false}})}>Add Hold & Win</Button>}
            {hold !== undefined && !holdEditable && <Stack>
                <Text>The Hold & Win draft is incomplete or malformed. Correct mechanics.holdAndWin in JSON and Apply JSON, or remove the mechanic. Your draft is retained.</Text>
                <Button onClick={() => set("holdAndWin", undefined)}>Remove Hold & Win</Button>
            </Stack>}
            {hold !== undefined && holdEditable && <Stack>
                <NumberInput label="Hold & Win minimum count" value={hold.minimumCount} onChange={v => set("holdAndWin", {...hold, minimumCount: Number(v)})} />
                <NumberInput label="Initial and reset respins" value={hold.initialRespins} onChange={v => set("holdAndWin", {...hold, initialRespins: Number(v)})} />
                <Text>Retrigger policy: reset-on-new-lock. Payout: sum-with-multiplier.</Text>
                <Checkbox label="Values are entry bet multiples" checked={hold.payout.amountsAreBetMultiples} onChange={e => set("holdAndWin", {...hold, payout: {...hold.payout, amountsAreBetMultiples: e.currentTarget.checked}})} />
                {symbols.map(symbol => {
                    const effect = hold.symbolEffects[symbol];
                    return <Stack key={symbol}>
                        <Select label={`${symbol} Hold & Win effect`} data={[{value: "none", label: "Not collectible"}, {value: "value", label: "Value"}, {value: "multiplier", label: "Multiplier"}]} value={effect?.kind ?? "none"} onChange={kind => {
                            const effects = {...hold.symbolEffects};
                            if (kind === "none") Reflect.deleteProperty(effects, symbol);
                            else effects[symbol] = kind === "multiplier" ? {kind, factor: 1} : {kind: "value", amount: 1};
                            set("holdAndWin", {...hold, symbolEffects: effects});
                        }} />
                        {effect && <NumberInput label={`${symbol} effect amount`} value={effect.kind === "value" ? effect.amount : effect.factor} onChange={v => set("holdAndWin", {...hold, symbolEffects: {...hold.symbolEffects, [symbol]: effect.kind === "value" ? {kind: "value", amount: Number(v)} : {kind: "multiplier", factor: Number(v)}}})} />}
                    </Stack>;
                })}
                <Button onClick={() => set("holdAndWin", undefined)}>Remove Hold & Win</Button>
            </Stack>}
        </PageSection>
        <PageSection legend="Jackpot">
            {jackpot === undefined && <Button onClick={() => set("jackpot", {pool: {id: "mini", type: "fixed", amount: 10}, contribution: {type: "percentage", percentage: 0.01}, trigger: {type: "symbol-count", symbolId: symbols[0] ?? "", minimumCount: 1}, award: "single-tier"})}>Add jackpot</Button>}
            {jackpot !== undefined && !jackpotEditable && <Stack>
                <Text>The jackpot draft is incomplete or malformed. Correct mechanics.jackpot in JSON and Apply JSON, or remove the mechanic. Your draft is retained.</Text>
                <Button onClick={() => set("jackpot", undefined)}>Remove jackpot</Button>
            </Stack>}
            {jackpot !== undefined && jackpotEditable && <Stack>
                <TextInput label="Jackpot pool id" value={jackpot.pool.id} onChange={e => set("jackpot", {...jackpot, pool: {...jackpot.pool, id: e.currentTarget.value}})} />
                <Select label="Jackpot pool type" data={["fixed", "accumulating"]} value={jackpot.pool.type} onChange={v => set("jackpot", {...jackpot, pool: v === "accumulating" ? {id: jackpot.pool.id, type: "accumulating", seedValue: 10} : {id: jackpot.pool.id, type: "fixed", amount: 10}})} />
                <NumberInput label="Jackpot amount or seed" value={jackpot.pool.type === "fixed" ? jackpot.pool.amount : jackpot.pool.seedValue} onChange={v => set("jackpot", {...jackpot, pool: jackpot.pool.type === "fixed" ? {...jackpot.pool, amount: Number(v)} : {...jackpot.pool, seedValue: Number(v)}})} />
                <NumberInput label="Jackpot contribution fraction" value={jackpot.contribution.percentage} onChange={v => set("jackpot", {...jackpot, contribution: {type: "percentage", percentage: Number(v)}})} />
                <Select label="Jackpot trigger symbol" data={symbols} value={jackpot.trigger.symbolId} onChange={v => set("jackpot", {...jackpot, trigger: {...jackpot.trigger, symbolId: v ?? ""}})} />
                <NumberInput label="Jackpot minimum count" value={jackpot.trigger.minimumCount} onChange={v => set("jackpot", {...jackpot, trigger: {...jackpot.trigger, minimumCount: Number(v)}})} />
                <Text>Single-tier award. Accumulating pools belong to one session.</Text>
                <Button onClick={() => set("jackpot", undefined)}>Remove jackpot</Button>
            </Stack>}
        </PageSection>
    </Stack>;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
