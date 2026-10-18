import {ProjectOptimizationService, ProjectTargetResolver} from "@fromstan/pokie";

export async function optimizeAndPublish(source: string, policy: unknown, destination: string, signal?: AbortSignal) {
    const service = new ProjectOptimizationService();
    const project = await new ProjectTargetResolver().resolve(source);
    if (!project) throw new Error("Source is not a recognized POKIE project.");
    const result = await service.optimize(project, policy, {signal});
    if (result.candidate) {
        try {
            // The caller chooses to publish only a successful exact result.
            if (result.status === "success") await service.publish(result.candidate, policy, destination, {signal});
        } finally {
            await service.discard(result.candidate);
        }
    }
    return result.status;
}
