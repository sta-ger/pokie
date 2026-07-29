import type {IncomingMessage} from "http";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// The one "confirmed local" signal a request carries that a client can never spoof by sending a header
// or a request body flag: the actual TCP peer address Node accepted the connection from. `pokie studio
// --host 0.0.0.0` (see StudioCommand) lets a *browser* reach Studio from elsewhere on the network --
// deliberately supported, e.g. reviewing on another device -- but a native OS dialog only ever makes
// sense for whoever is sitting at the machine actually running the server, so it must never be offered
// just because that machine happens to have a graphical display (see StudioNativePickerService's own
// "single-user local tool" doc comment, which only reasons about the server's own platform/display, not
// about who's asking). Used by StudioServer to gate GET .../native-browse/availability and POST
// .../native-browse. SSH port-forwarding a remote server's loopback back to a local port is out of
// scope, same as Studio's own "not multi-tenant" limitation (see StudioServer's own doc comment).
export function isLoopbackRequest(req: IncomingMessage): boolean {
    const remoteAddress = req.socket.remoteAddress;
    return remoteAddress !== undefined && LOOPBACK_ADDRESSES.has(remoteAddress);
}
