// One file/payload produced by an ExternalArtifactGenerator, before it's written anywhere. "relativePath" is
// always relative (never an absolute path or a path escaping its own root via "..") — enforced by
// StandardExternalArtifactValidator and by writeExternalDeploymentArtifactsToDirectory, both of which treat a
// violation as a hard failure rather than silently normalizing it, since silently rewriting a caller-controlled
// path is exactly how a path-traversal write would go unnoticed.
export type ExternalGeneratedArtifact = {
    readonly relativePath: string;
    readonly content: string | Buffer;
};
