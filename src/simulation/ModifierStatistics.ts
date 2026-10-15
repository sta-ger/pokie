import {observeVideoSlotFeatures} from "../net/videoslot/observeVideoSlotFeatures.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";

export type ModifierStatistics = {
    steps: number;
    ruleApplications: number;
    stickySteps: number;
    multipliedComponents: number;
};
export function observeModifierStatistics(session: unknown): ModifierStatistics | undefined {
    const observation = observeVideoSlotFeatures(session).modifiers;
    if (!observation) return undefined;
    const result = (session as Partial<VideoSlotSessionHandling>).getWinEvaluationResult?.();
    return {
        steps: 1,
        ruleApplications: observation.rules.filter((rule) => rule.positions.length > 0).length,
        stickySteps: observation.sticky.length > 0 ? 1 : 0,
        multipliedComponents:
            result?.getWinComponents().filter((component) => component.getMultiplierBreakdown().length > 0).length ?? 0,
    };
}
export function mergeModifierStatistics(
    a?: ModifierStatistics,
    b?: ModifierStatistics,
): ModifierStatistics | undefined {
    if (!b) return a && {...a};
    return {
        steps: (a?.steps ?? 0) + b.steps,
        ruleApplications: (a?.ruleApplications ?? 0) + b.ruleApplications,
        stickySteps: (a?.stickySteps ?? 0) + b.stickySteps,
        multipliedComponents: (a?.multipliedComponents ?? 0) + b.multipliedComponents,
    };
}
