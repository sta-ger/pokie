// A canonical, deeply-readonly JSON value — the shape anything hashed or projected to JSON as "the standard
// POKIE canonical form" is guaranteed to reduce to (see toCanonicalJson). Deliberately excludes anything JSON
// itself can't represent losslessly (symbol, bigint, function, undefined, non-finite numbers) — toCanonicalJson
// is what actually enforces that at runtime; this type is the compile-time side of the same contract.
export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = {readonly [key: string]: JsonValue};

export type JsonArray = readonly JsonValue[];

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
