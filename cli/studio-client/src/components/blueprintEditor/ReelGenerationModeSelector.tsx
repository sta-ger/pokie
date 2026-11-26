import {useState} from "react";
import {useConfirm} from "../../hooks/useConfirm";
import {WholeSequencesEditor} from "./WholeSequencesEditor";
import {Group, Radio, Stack, Text} from "@mantine/core";
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
    onDirtyChange,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    drafts: ReelStripGenerationDraftsRef;
    modeDrafts: ReelGenerationModeDraftsRef;
    revision: number;
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const confirm = useConfirm();
    const [sequenceDirty, setSequenceDirty] = useState(false);
    const mode = getReelGenerationMode(blueprint);

    return (
        <PageSection legend="Reel generation">
            <Text size="sm" c="dimmed" mb="xs">
                Choose how the reel strips are defined. Default is recommended unless you need to control the reel
                contents yourself. Switching source keeps the values you entered for the previous source in this
                editor session so you can switch back; only the selected source is saved.
            </Text>
            <Stack gap={2} mb="sm">
                <Text size="xs"><strong>Default (recommended)</strong> — the engine builds the strips from symbol weights.</Text>
                <Text size="xs"><strong>Manual reel strips</strong> — you provide the exact stop order for each reel.</Text>
                <Text size="xs"><strong>Per-reel modeler</strong> — build each strip step by step in a visual editor.</Text>
                <Text size="xs"><strong>Symbol weights</strong> — set how often each symbol appears; the engine builds the strips.</Text>
                <Text size="xs"><strong>Whole-sequence variants (advanced)</strong> — choose from alternative complete reel sequences with weights.</Text>
            </Stack>
            <Radio.Group value={mode} onChange={(value) => {
                const change = (): void => {
                    setSequenceDirty(false);
                    Reflect.deleteProperty(modeDrafts.current, "wholeSequenceDraft");
                    onDirtyChange?.(false);
                    mutate((b) => setReelGenerationMode(b, value as ReelGenerationMode, modeDrafts.current));
                };
                if (sequenceDirty || modeDrafts.current.wholeSequenceDraft?.dirty) confirm("Switch reel source and discard unapplied whole-sequence edits?", change);
                else change();
            }} mb="md">
                <Group gap="md">
                    <Radio value="reelSequences" label="Whole-sequence variants (advanced)" />
                    <Radio value="default" label="Default (recommended)" />
                    <Radio value="reelStrips" label="Manual reel strips" />
                    <Radio value="reelStripGeneration" label="Per-reel modeler" />
                    <Radio value="symbolWeights" label="Symbol weights" />
                </Group>
            </Radio.Group>

            {mode === "reelSequences" && <WholeSequencesEditor blueprint={blueprint} mutate={mutate} revision={revision} modeDrafts={modeDrafts} onDirtyChange={dirty => {
                setSequenceDirty(dirty);
                onDirtyChange?.(dirty);
            }} />}
            {mode === "reelStrips" && <ReelStripsEditor blueprint={blueprint} mutate={mutate} />}
            {mode === "reelStripGeneration" && <ReelStripGenerationEditor blueprint={blueprint} mutate={mutate} drafts={drafts} revision={revision} />}
            {mode === "symbolWeights" && <SymbolWeightsEditor blueprint={blueprint} mutate={mutate} />}
        </PageSection>
    );
}
