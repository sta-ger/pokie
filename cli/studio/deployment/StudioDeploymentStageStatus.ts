// One pipeline stage's own outcome, as StudioDeploymentService actually observed it — never inferred
// by a client from which DTO fields happen to be present/absent (see computeDeploymentStages's own doc
// comment for why that inference is unsafe in general). "skipped" means ExternalDeploymentService
// itself never ran that stage because an earlier one already failed; it is never used to paper over a
// stage that *did* run and *did* report a real problem.
export type StudioDeploymentStageStatus = "ok" | "error" | "skipped";
