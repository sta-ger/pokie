// One file/payload produced by an ExternalFileGenerator, before it's written anywhere. "relativePath" is
// always relative (never an absolute path or a path escaping its own root via "..") — enforced by
// StandardExternalFileValidator and by writeExternalExportFilesToDirectory, both of which treat a
// violation as a hard failure rather than silently normalizing it, since silently rewriting a caller-controlled
// path is exactly how a path-traversal write would go unnoticed.
export type ExternalGeneratedFile = {
    readonly relativePath: string;
    readonly content: string | Buffer;
};
