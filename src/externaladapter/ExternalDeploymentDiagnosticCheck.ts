// One named check within an ExternalDeploymentDiagnosticReport — e.g. "outputDirectoryWritable" or
// "endpointReachable". "message" is only ever populated to explain a failure (ok: false); a passing check needs
// no further explanation.
export type ExternalDeploymentDiagnosticCheck = {
    readonly name: string;
    readonly ok: boolean;
    readonly message?: string;
};
