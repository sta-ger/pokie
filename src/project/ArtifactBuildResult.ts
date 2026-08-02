// What a future ArtifactBuilder.build() resolves to on success: where the produced artifact now lives.
// Deliberately contract-only here, same as ProjectMaterializationResult was in P3-POLISH-02 -- no
// implementation wires a concrete builder to this shape yet (see ArtifactBuilder's own doc comment); this type
// only fixes what a future implementation must report.
export type ArtifactBuildResult = {
    readonly outputPath: string;
};
