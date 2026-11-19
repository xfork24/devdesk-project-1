#!/bin/bash
set -eu
cd /work/evidence/.devdesk/be7c68cb-9bf0-40b1-5808-5c26aab1e3f0
export XDG_CONFIG_HOME="$PWD/config" XDG_CACHE_HOME="$PWD/cache" LD_LIBRARY_PATH="$PWD/sysroot/usr/lib/aarch64-linux-gnu:$PWD/sysroot/lib/aarch64-linux-gnu" TMPDIR="$PWD/tmp" FONTCONFIG_FILE="$PWD/fonts.conf"
node browser-check.cjs > browser-stdout.log 2> browser-stderr.log
