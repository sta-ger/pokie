import type {AvailableBetsDescribing} from "../../AvailableBetsDescribing.js";
import type {BuildableFromMap} from "../../BuildableFromMap.js";
import type {ConvertableToMap} from "../../ConvertableToMap.js";
import type {PaytableSymbolsPayoutsDescribing} from "./PaytableSymbolsPayoutsDescribing.js";
import type {PaytableSymbolsPayoutsSetting} from "./PaytableSymbolsPayoutsSetting.js";

export interface PaytableRepresenting<T extends string | number | symbol = string>
    extends ConvertableToMap<number, Record<T, Record<number, number>>>,
        BuildableFromMap<number, Record<T, Record<number, number>>>,
        AvailableBetsDescribing,
        PaytableSymbolsPayoutsDescribing<T>,
        PaytableSymbolsPayoutsSetting<T> {}
