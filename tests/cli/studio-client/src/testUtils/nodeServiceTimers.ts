import {setImmediate, clearImmediate} from "node:timers";

// Install after React imports have selected the browser scheduler. Only these
// rendered workflows also host Node services which yield through Node timers.
export function installNodeServiceTimers(): () => void {
    const installed = new Map<string, PropertyDescriptor | undefined>();
    for (const [name, timer] of Object.entries({setImmediate, clearImmediate})) {
        if (typeof Reflect.get(globalThis, name) === "undefined") {
            installed.set(name, Reflect.getOwnPropertyDescriptor(globalThis, name));
            Reflect.defineProperty(globalThis, name, {value: timer, configurable: true, writable: true});
        }
    }
    return () => {
        for (const [name, descriptor] of installed) {
            if (descriptor) Reflect.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    };
}
