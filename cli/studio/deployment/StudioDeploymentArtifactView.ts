// One generated artifact as sent to the client — always a plain string, even when the underlying
// ExternalGeneratedArtifact.content was a Buffer (decoded as UTF-8; see toStudioDeploymentRunView).
// This is what lets the Deployment tab show an artifact's own textual content before publishing,
// without a second endpoint or the client ever touching the SDK's own generation types.
export type StudioDeploymentArtifactView = {
    readonly relativePath: string;
    readonly content: string;
};
