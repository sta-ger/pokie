import {Group, Radio, Text} from "@mantine/core";
import {getReelGenerationMode, setReelGenerationMode, type ReelGenerationMode} from "../../domain/blueprintFormOps";
import type {BlueprintMutate, ReelStripGenerationDraftsRef} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {ReelStripGenerationEditor} from "./ReelStripGenerationEditor";
import {ReelStripsEditor} from "./ReelStripsEditor";
import {SymbolWeightsEditor} from "./SymbolWeightsEditor";

export function ReelGenerationModeSelector({
    blueprint,
    mutate,
    drafts,
    revision,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    drafts: ReelStripGenerationDraftsRef;
    revision: number;
}) {
    const mode = getReelGenerationMode(blueprint);

    return (
        <PageSection legend="Reel generation">
            <Text size="sm" c="dimmed" mb="sm">
                Optional — omit all three to use the engine&apos;s default weighted reel generator.
            </Text>
            <Radio.Group value={mode} onChange={(value) => mutate((b) => setReelGenerationMode(b, value as ReelGenerationMode))} mb="md">
                <Group gap="md">
                    <Radio value="default" label="Default" />
                    <Radio value="reelStrips" label="Reel strips" />
                    <Radio value="reelStripGeneration" label="Per-reel (Reel Strip Modeler)" />
                    <Radio value="symbolWeights" label="Symbol weights" />
                </Group>
            </Radio.Group>

            {mode === "reelStrips" && <ReelStripsEditor blueprint={blueprint} mutate={mutate} />}
            {mode === "reelStripGeneration" && <ReelStripGenerationEditor blueprint={blueprint} mutate={mutate} drafts={drafts} revision={revision} />}
            {mode === "symbolWeights" && <SymbolWeightsEditor blueprint={blueprint} mutate={mutate} />}
        </PageSection>
    );
}
