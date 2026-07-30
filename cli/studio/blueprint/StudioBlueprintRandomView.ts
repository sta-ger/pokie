import type {RandomGameBlueprintProvenance} from "pokie";

// POST /api/home/blueprints/random's own DTO — a freshly generated GameBlueprint from
// RandomGameBlueprintGenerator (the exact same generator "pokie build random"/"pokie create --random"
// use, see StudioBlueprintService.random()'s own doc comment), never written to disk. "seed"/
// "provenance" are echoed back so the Blueprint Editor's New flow can show what was actually used (and
// let the request be replayed with the same "seed"/"preset" for an exact reproduction) — same
// determinism contract RandomGameBlueprintResult itself documents. Always "ok": generation from a
// valid seed/preset/name combination cannot itself fail domain-wise (a malformed request is instead
// a 400, see validateBlueprintRandomRequest).
export type StudioBlueprintRandomView = {
    status: "ok";
    blueprint: unknown;
    seed: number;
    preset: "default" | "variant";
    provenance: RandomGameBlueprintProvenance;
};
