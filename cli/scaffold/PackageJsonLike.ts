export type PackageJsonLike = {
    [key: string]: unknown;
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    pokie?: {entry?: string};
};
