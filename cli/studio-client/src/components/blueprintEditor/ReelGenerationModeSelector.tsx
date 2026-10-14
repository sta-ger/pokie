import {useState} from "react";
import {useConfirm} from "../../hooks/useConfirm";
import {WholeSequencesEditor} from "./WholeSequencesEditor";
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
            <Text size="sm" c="dimmed" mb="sm">
                Optional — Default (recommended) uses the engine&apos;s weighted reel generator. Choose one of the other modes only when you need to control the reel contents yourself.
            </Text>
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
                    <Radio value="reelSequences" label="Whole-sequence variants" />
                    <Radio value="default" label="Default (recommended)" />
                    <Radio value="reelStrips" label="Reel strips" />
                    <Radio value="reelStripGeneration" label="Per-reel (Reel Strip Modeler)" />
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
