import {Group, NumberInput, Radio, Text} from "@mantine/core";
import {getWinModelMinimumClusterSize, getWinModelType, setWinModelMinimumClusterSize, setWinModelType, type WinModelType} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";

export function WinModelSelector({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const type = getWinModelType(blueprint);
    const minimumClusterSize = getWinModelMinimumClusterSize(blueprint);

    return (
        <PageSection legend="Win model">
            <Text size="sm" c="dimmed" mb="sm">
                How wins are evaluated. &quot;Lines&quot; (the default) pays fixed paylines from the Paytable below;
                &quot;Ways&quot; and &quot;Clusters&quot; ignore paylines entirely.
            </Text>
            <Radio.Group value={type} onChange={(value) => mutate((b) => setWinModelType(b, value as WinModelType))} mb="md">
                <Group gap="md">
                    <Radio value="lines" label="Lines" />
                    <Radio value="ways" label="Ways" />
                    <Radio value="clusters" label="Clusters" />
                </Group>
            </Radio.Group>

            {type === "clusters" && (
                <NumberInput
                    label="Minimum cluster size"
                    aria-label="Minimum cluster size"
                    min={2}
                    value={minimumClusterSize ?? 5}
                    onChange={(value) => mutate((b) => setWinModelMinimumClusterSize(b, typeof value === "number" ? value : undefined))}
                    maw={240}
                />
            )}
        </PageSection>
    );
}
