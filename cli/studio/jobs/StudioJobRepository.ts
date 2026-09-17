import type {StudioJobView} from "./StudioJobView.js";

export interface StudioJobRepository {
    list(projectId?: string): readonly StudioJobView[];
    get(id: string): StudioJobView | undefined;
    save(job: StudioJobView): void;
    remove(id: string): void;
}
