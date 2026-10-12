// Kept as ESM in both compiled trees so the loader can locate its own installation
// without a working-directory lookup or a registry dependency.
export function runtimeLocation() {
    return import.meta.url;
}
