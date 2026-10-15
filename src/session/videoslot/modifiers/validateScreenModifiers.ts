import {ScreenProjection} from "../coordinates/ScreenProjection.js";
import type {ValidationIssue} from "../../../validation/ValidationIssue.js";
import type {ScreenModifierModel} from "./ScreenModifiers.js";

/** Shared by authoring and direct runtime construction. Never ignore malformed coordinates. */
export function validateScreenModifiers(
    value: unknown,
    model: Omit<ScreenModifierModel<string | number | symbol>, "modifiers">,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const error = (path: string, message: string): void => {
        issues.push({
            code: "blueprint-mechanics-modifiers-invalid",
            severity: "error",
            path,
            message: `${path}: ${message}`,
        });
    };
    const object = (v: unknown, path: string, keys: string[]): Record<string, unknown> | undefined => {
        if (!v || typeof v !== "object" || Array.isArray(v)) {
            error(path, "requires an object.");
            return undefined;
        }
        for (const key of Object.keys(v)) if (!keys.includes(key)) error(`${path}.${key}`, "unknown field.");
        return v as Record<string, unknown>;
    };
    const symbol = (v: unknown, path: string): void => {
        if (
            !["string", "number", "symbol"].includes(typeof v) ||
            (typeof v === "number" && !Number.isFinite(v)) ||
            !model.symbols.includes(v as string)
        ) error(path, "unknown symbol.");
    };
    const root = "mechanics.modifiers";
    const data = object(value, root, ["wilds", "rules"]);
    if (!data) return issues;
    const geometry = model.screenGeometry ?? {
        generated: {reels: model.reels, rows: model.rows},
        visible: {rowOffset: 0, rows: model.rows},
        evaluated: {rowOffset: 0, rows: model.rows},
        paylineSpace: "evaluated",
    };
    let projection: ScreenProjection;
    try {
        projection = new ScreenProjection(geometry);
    } catch {
        error(root, "requires valid screen geometry.");
        return issues;
    }
    if (geometry.generated.reels !== model.reels) error(root, "geometry reel count differs from model.");
    if (!Array.isArray(data.wilds)) error(`${root}.wilds`, "requires an array.");
    else {
        const seen = new Set<unknown>();
        Array.from(data.wilds).forEach((raw, index) => {
            const path = `${root}.wilds.${index}`;
            const wild = object(raw, path, ["symbol", "substitutes", "factor"]);
            if (!wild) return;
            symbol(wild.symbol, `${path}.symbol`);
            if (!model.wilds.includes(wild.symbol as string) || seen.has(wild.symbol)) error(`${path}.symbol`, "requires a unique declared wild.");
            seen.add(wild.symbol);
            if (
                wild.factor !== undefined &&
                (typeof wild.factor !== "number" || !Number.isFinite(wild.factor) || wild.factor < 0)
            ) error(`${path}.factor`, "requires a finite nonnegative factor.");
            if (wild.substitutes !== undefined) {
                if (!Array.isArray(wild.substitutes)) error(`${path}.substitutes`, "requires an array (empty forbids substitution).");
                else {
                    Array.from(wild.substitutes).forEach((s, i) => symbol(s, `${path}.substitutes.${i}`));
                    if (new Set(wild.substitutes).size !== wild.substitutes.length) error(`${path}.substitutes`, "duplicate targets.");
                }
            }
        });
    }
    if (!Array.isArray(data.rules)) error(`${root}.rules`, "requires an ordered array.");
    else {
        const ids = new Set<unknown>();
        Array.from(data.rules).forEach((raw, index) => {
            const path = `${root}.rules.${index}`;
            const type = (raw as {type?: unknown} | null)?.type;
            let extras = ["symbol"];
            if (type === "transform") extras = ["from", "to"];
            if (type === "sticky") extras = ["symbol", "lifetime"];
            if (type === "reel") extras = ["symbol", "reels"];
            const rule = object(raw, path, ["id", "type", "space", "positions", ...extras]);
            if (!rule) return;
            if (!["transform", "expand", "sticky", "reel"].includes(String(type))) error(`${path}.type`, "unknown rule type.");
            if (typeof rule.id !== "string" || !rule.id.trim() || ids.has(rule.id)) error(`${path}.id`, "requires a unique nonempty identity.");
            ids.add(rule.id);
            const space = rule.space;
            const validSpace = space === "generated" || space === "visible" || space === "evaluated";
            if (!validSpace) error(`${path}.space`, "requires generated, visible or evaluated.");
            if (!Array.isArray(rule.positions)) error(`${path}.positions`, "requires an explicit trigger/target position array.");
            else {
                const seen = new Set<string>();
                Array.from(rule.positions).forEach((position, i) => {
                    const p = `${path}.positions.${i}`;
                    try {
                        if (!validSpace || !projection.map(position, space, space)) error(p, "outside declared coordinate domain.");
                        const key = JSON.stringify(position);
                        if (seen.has(key)) error(p, "duplicate position.");
                        seen.add(key);
                    } catch {
                        error(p, "requires integer [reel, row].");
                    }
                });
            }
            if (type === "transform") {
                symbol(rule.from, `${path}.from`);
                symbol(rule.to, `${path}.to`);
            } else symbol(rule.symbol, `${path}.symbol`);
            if ((type === "expand" || type === "sticky") && !model.wilds.includes(rule.symbol as string)) error(`${path}.symbol`, "expanding/sticky symbol must be a declared wild.");
            if (type === "sticky" && (!Number.isSafeInteger(rule.lifetime) || Number(rule.lifetime) < 1)) error(`${path}.lifetime`, "requires a positive safe integer, including acquisition step.");
            if (type === "reel" && space !== "evaluated") error(`${path}.space`, "unconditional reel fill uses evaluated coordinates.");
            if (type === "reel" && Array.isArray(rule.positions) && rule.positions.length) error(
                `${path}.positions`,
                "unconditional reel rules require empty positions; use reels to select targets.",
            );
            if (
                type === "reel" &&
                (!Array.isArray(rule.reels) ||
                    new Set(rule.reels).size !== rule.reels.length ||
                    !Array.from(rule.reels).every(
                        (reel) => Number.isSafeInteger(reel) && reel >= 0 && reel < model.reels,
                    ))
            ) error(`${path}.reels`, "requires unique reel indexes within model bounds.");
        });
    }
    return issues;
}
