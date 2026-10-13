import {Group, Radio, Text} from "@mantine/core";
import {getReelGenerationMode, setReelGenerationMode, type ReelGenerationMode} from "../../domain/blueprintFormOps";
import type {BlueprintMutate, ReelGenerationModeDraftsRef, ReelStripGenerationDraftsRef} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {ReelStripGenerationEditor} from "./ReelStripGenerationEditor";
import {ReelStripsEditor} from "./ReelStripsEditor";
import {SymbolWeightsEditor} from "./SymbolWeightsEditor";

export function ReelGenerationModeSelector({
    blueprint,
    mutate,
    drafts,
    modeDrafts,
    revision,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    drafts: ReelStripGenerationDraftsRef;
    modeDrafts: ReelGenerationModeDraftsRef;
    revision: number;
}) {
    const mode = getReelGenerationMode(blueprint);

    return (
        <PageSection legend="Reel generation">
            <Text size="sm" c="dimmed" mb="sm">
                Optional — Default (recommended) uses the engine&apos;s weighted reel generator. Choose one of the other modes only when you need to control the reel contents yourself.
            </Text>
            <Radio.Group value={mode} onChange={(value) => mutate((b) => setReelGenerationMode(b, value as ReelGenerationMode, modeDrafts.current))} mb="md">
                <Group gap="md">
                    <Radio value="reelSequences" label="Whole-sequence variants" />
                    <Radio value="default" label="Default (recommended)" />
                    <Radio value="reelStrips" label="Reel strips" />
                    <Radio value="reelStripGeneration" label="Per-reel (Reel Strip Modeler)" />
                    <Radio value="symbolWeights" label="Symbol weights" />
                </Group>
            </Radio.Group>

            {mode === "reelSequences" && <PageSection legend="Whole-sequence variants">
                <Text>Edit reelSequences in the JSON editor. Each weighted reel has stable variant IDs, complete symbols arrays and relative weights. Changes remain drafts until Save.</Text>
                <pre>{JSON.stringify(blueprint.reelSequences, null, 2)}</pre>
            </PageSection>}
            {mode === "reelStrips" && <ReelStripsEditor blueprint={blueprint} mutate={mutate} />}
            {mode === "reelStripGeneration" && <ReelStripGenerationEditor blueprint={blueprint} mutate={mutate} drafts={drafts} revision={revision} />}
            {mode === "symbolWeights" && <SymbolWeightsEditor blueprint={blueprint} mutate={mutate} />}
        </PageSection>
    );
}
