export type PokieClientServerOptions = {
    host?: string;
    port?: number;
    // Where the browser preview should look for a running `pokie serve` API. `pokie client` never
    // starts one itself — see PokieClientServer's own doc comment.
    apiAddress?: {host: string; port: number};
};
