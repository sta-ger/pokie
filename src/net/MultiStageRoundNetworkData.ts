// The generic envelope any MultiStageRoundSessionSerializer-based payload adds on top of its base
// serializer's own fields: an ordered sequence of per-stage data for one round. `TStage` is
// deliberately opaque here — a concrete mechanic (e.g. cascades) defines its own stage DTO shape.
export type MultiStageRoundNetworkData<TStage = unknown> = {
    stages: TStage[];
};
