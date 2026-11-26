#!/usr/bin/env bash
# Resolves a usable Node runtime, provisioning a pinned portable one when the system has no adequate
# Node. This is the only launcher step that needs to work before Node exists, so it deliberately uses
# only bash, curl/wget, tar and a SHA-256 tool from the host.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${POKIE_NODE_VERSION:-22.12.0}"

node_is_adequate() {
    local candidate="$1"
    [ -x "$candidate" ] || command -v "$candidate" >/dev/null 2>&1 || return 1
    "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' >/dev/null 2>&1
}

if command -v node >/dev/null 2>&1 && node_is_adequate node; then
    exec node "$ROOT/scripts/start-studio.mjs" "$@"
fi

case "$(uname -s)" in
    Linux) os="linux" ;;
    Darwin) os="darwin" ;;
    *)
        echo "POKIE Studio: unsupported operating system '$(uname -s)'." >&2
        echo "Install Node.js 22.12 or newer from https://nodejs.org/ and run this launcher again." >&2
        exit 1
        ;;
esac
case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
        echo "POKIE Studio: unsupported architecture '$(uname -m)'." >&2
        echo "Install Node.js 22.12 or newer from https://nodejs.org/ and run this launcher again." >&2
        exit 1
        ;;
esac

CACHE_ROOT="${POKIE_RUNTIME_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/pokie/runtime}"
NODE_DIR="$CACHE_ROOT/node-v$VERSION-$os-$arch"
NODE_BIN="$NODE_DIR/bin/node"
ARCHIVE="node-v$VERSION-$os-$arch.tar.gz"
BASE_URL="https://nodejs.org/dist/v$VERSION"

if ! node_is_adequate "$NODE_BIN"; then
    mkdir -p "$CACHE_ROOT"
    tmp_archive="$(mktemp "$CACHE_ROOT/.poke-node-archive.XXXXXX")"
    tmp_sums="$(mktemp "$CACHE_ROOT/.poke-node-sums.XXXXXX")"
    cleanup() {
        rm -f "$tmp_archive" "$tmp_sums"
    }
    trap cleanup EXIT

    echo "POKIE Studio: a suitable Node.js was not found."
    echo "Downloading pinned Node.js $VERSION for $os-$arch into $CACHE_ROOT ..."

    download() {
        local url="$1"
        local output="$2"
        if command -v curl >/dev/null 2>&1; then
            curl -fL --retry 2 --connect-timeout 15 "$url" -o "$output"
        elif command -v wget >/dev/null 2>&1; then
            wget -q "$url" -O "$output"
        else
            echo "POKIE Studio: neither curl nor wget is available to download Node.js." >&2
            echo "Install curl (or wget), or install Node.js 22.12+ from https://nodejs.org/." >&2
            exit 1
        fi
    }

    download "$BASE_URL/$ARCHIVE" "$tmp_archive"
    download "$BASE_URL/SHASUMS256.txt" "$tmp_sums"

    expected="$(awk -v file="$ARCHIVE" '$2 == file {print $1; exit}' "$tmp_sums")"
    if [ -z "$expected" ]; then
        echo "POKIE Studio: the Node.js checksum list does not contain $ARCHIVE; refusing to install it." >&2
        exit 1
    fi
    if command -v sha256sum >/dev/null 2>&1; then
        actual="$(sha256sum "$tmp_archive" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
        actual="$(shasum -a 256 "$tmp_archive" | awk '{print $1}')"
    elif command -v openssl >/dev/null 2>&1; then
        actual="$(openssl dgst -sha256 "$tmp_archive" | awk '{print $NF}')"
    else
        echo "POKIE Studio: no SHA-256 tool (sha256sum, shasum or openssl) is available; refusing to install Node.js." >&2
        exit 1
    fi
    if [ "$expected" != "$actual" ]; then
        echo "POKIE Studio: the downloaded Node.js archive failed SHA-256 verification; refusing to install it." >&2
        exit 1
    fi

    tar -xzf "$tmp_archive" -C "$CACHE_ROOT"
    chmod +x "$NODE_BIN" 2>/dev/null || true
    rm -f "$tmp_archive" "$tmp_sums"
    trap - EXIT
fi

if ! node_is_adequate "$NODE_BIN"; then
    echo "POKIE Studio: the portable Node.js runtime at $NODE_BIN is not usable." >&2
    echo "Delete $NODE_DIR and run this launcher again, or install Node.js 22.12+ from https://nodejs.org/." >&2
    exit 1
fi

# Make the portable runtime's npm/npx discoverable by start-studio.mjs and by any build step it runs.
export PATH="$(dirname "$NODE_BIN"):$PATH"
exec "$NODE_BIN" "$ROOT/scripts/start-studio.mjs" "$@"
