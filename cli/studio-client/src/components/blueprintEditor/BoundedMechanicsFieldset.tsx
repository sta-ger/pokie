import {Button, NumberInput, Select, Stack, Text} from "@mantine/core";
import type {BoundedMechanics} from "../../../../../src/session/videoslot/authored/BoundedMechanics";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {asStringList} from "../../domain/asStringList";

/** Values belong to the shared recoverable draft; saving/building remains explicit. */
export function BoundedMechanicsFieldset({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const mechanics = (blueprint.mechanics ?? {}) as BoundedMechanics;
    const symbols = asStringList(blueprint.symbols);
    const first = symbols[0] ?? "";
    const set = <K extends keyof BoundedMechanics>(key: K, value: BoundedMechanics[K]): void => mutate(b => {
        const next = {...(b.mechanics as Record<string, unknown> ?? {})};
        if (value === undefined) Reflect.deleteProperty(next, key);
        else next[key] = value;
        b.mechanics = next;
    });
    const defaults: Required<Omit<BoundedMechanics, "weightedBonus">> = {
        cascade: {maxCascades: 20},
        respins: {trigger: {symbolId: first, minimumCount: 1}, grant: 3, retrigger: "none", maxRespins: 30},
        collection: {symbolId: first, contribution: 1, threshold: 10, cap: 10, reset: "zero", payout: 5},
    };
    const numeric = (label: string, value: number, change: (value: number) => void) => <NumberInput key={label} label={label} value={value} onChange={v => change(Number(v))} />;
    const cascade = mechanics.cascade,
        respins = mechanics.respins,
        collection = mechanics.collection;
    return <Stack>
        {(["cascade", "respins", "collection"] as const).map(key => {
            const rule = mechanics[key];
            const raw = rule as unknown;
            const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
            const fields = {cascade: ["maxCascades"], respins: ["grant", "maxRespins"], collection: ["contribution", "threshold", "cap", "payout"]}[key];
            const invalid = !object(raw) || fields.some(field => typeof raw[field] !== "number") ||
                (key === "respins" && (!object(raw.trigger) || typeof raw.trigger.symbolId !== "string" || typeof raw.trigger.minimumCount !== "number" || (raw.retrigger !== "none" && raw.retrigger !== "reset"))) ||
                (key === "collection" && (typeof raw.symbolId !== "string" || (raw.reset !== "zero" && raw.reset !== "subtract-threshold")));
            return <PageSection key={key} legend={`Bounded ${key}`}>
                {rule === undefined ? <Button onClick={() => set(key, defaults[key])}>Add {key}</Button> : <Stack>
                    {invalid ? <Text>Correct mechanics.{key} in JSON and Apply JSON. The current draft is retained.</Text> : <>
                        {key === "cascade" && cascade && numeric("Maximum winning cascades", cascade.maxCascades, maxCascades => set("cascade", {...cascade, maxCascades}))}
                        {key === "respins" && respins && <>
                            <Select label="Respin trigger symbol" data={symbols} value={respins.trigger.symbolId} onChange={v => set("respins", {...respins, trigger: {...respins.trigger, symbolId: v ?? ""}})} />
                            {numeric("Respin trigger count", respins.trigger.minimumCount, minimumCount => set("respins", {...respins, trigger: {...respins.trigger, minimumCount}}))}
                            {numeric("Respin grant", respins.grant, grant => set("respins", {...respins, grant}))}
                            {numeric("Maximum executed respins", respins.maxRespins, maxRespins => set("respins", {...respins, maxRespins}))}
                            <Select label="Respin retrigger" data={["none", "reset"]} value={respins.retrigger} onChange={v => set("respins", {...respins, retrigger: v === "reset" ? "reset" : "none"})} />
                        </>}
                        {key === "collection" && collection && <>
                            <Select label="Collection symbol" data={symbols} value={collection.symbolId} onChange={v => set("collection", {...collection, symbolId: v ?? ""})} />
                            {(["contribution", "threshold", "cap", "payout"] as const).map(field => numeric(`Collection ${field}`, collection[field], value => set("collection", {...collection, [field]: value})))}
                            <Select label="Collection reset" data={["zero", "subtract-threshold"]} value={collection.reset} onChange={v => set("collection", {...collection, reset: v === "subtract-threshold" ? v : "zero"})} />
                            <Text>Currency units; collect once per accepted subround from its final screen. Cap before threshold; at most one award per subround.</Text>
                        </>}
                    </>}
                    <Button onClick={() => set(key, undefined)}>Remove {key}</Button>
                </Stack>}
            </PageSection>;
        })}
    </Stack>;
}
