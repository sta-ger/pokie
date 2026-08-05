export type PackageJsonLike = {
    [key: string]: unknown;
    name?: string;
    version?: string;
    main?: string;
    exports?: unknown;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
    pokie?: {entry?: string};
};
