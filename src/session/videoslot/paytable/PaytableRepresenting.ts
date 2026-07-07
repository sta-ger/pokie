import {
    AvailableBetsDescribing,
    BuildableFromMap,
    ConvertableToMap,
    PaytableSymbolsPayoutsDescribing,
    PaytableSymbolsPayoutsSetting,
} from "pokie";

export interface PaytableRepresenting<T extends string | number | symbol = string>
    extends ConvertableToMap<number, Record<T, Record<number, number>>>,
        BuildableFromMap<number, Record<T, Record<number, number>>>,
        AvailableBetsDescribing,
        PaytableSymbolsPayoutsDescribing<T>,
        PaytableSymbolsPayoutsSetting<T> {}
