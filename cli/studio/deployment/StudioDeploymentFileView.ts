// One generated file as sent to the client — always a plain string, even when the underlying
// ExternalGeneratedFile.content was a Buffer (decoded as UTF-8; see toStudioDeploymentRunView).
// This is what lets the Deployment tab show a file's own textual content before publishing,
// without a second endpoint or the client ever touching the SDK's own generation types.
export type StudioDeploymentFileView = {
    readonly relativePath: string;
    readonly content: string;
};
