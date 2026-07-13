// A JSON-serializable description of one ReelStripConstraint, for GameBlueprint.reelStripGeneration
// (constraint class instances themselves aren't valid JSON). "type" picks which constraint class
// createReelStripConstraintFromSpec builds; every other field maps directly onto that class's own
// constructor parameters — see the individual constraint classes under src/reels/constraints for
// what each one actually checks. Optional fields left unset fall back to that constraint's own
// constructor defaults (e.g. wrapAround = true).
export type ReelStripConstraintSpec =
    | {type: "minimumCircularDistance"; minimumDistance: number; symbolIds?: string[]; wrapAround?: boolean}
    | {type: "maximumCircularDistance"; maximumDistance: number; symbolIds?: string[]; wrapAround?: boolean}
    | {type: "maximumConsecutiveOccurrences"; maximumConsecutive: number; symbolIds?: string[]; wrapAround?: boolean}
    | {type: "forbiddenAdjacency"; pairs: [string, string][]; wrapAround?: boolean; directed?: boolean}
    | {type: "requiredAdjacency"; pairs: [string, string][]; directed?: boolean; wrapAround?: boolean}
    | {type: "forbiddenSequence"; sequence: string[]; maximumOccurrences?: number; reversed?: boolean; wrapAround?: boolean}
    | {
          type: "requiredSequence";
          sequence: string[];
          minimumOccurrences?: number;
          maximumOccurrences?: number;
          reversed?: boolean;
          wrapAround?: boolean;
      };
