# Telegram Web - Media Batch Downloader (Race Condition Fix)

> **It's just a patch.**  
> Original author: [OsoCosmico](https://greasyfork.org/scripts/567432/)  
> Original script: [Telegram Web - Media Batch Downloader](https://update.greasyfork.org/scripts/567432/Telegram%20Web%20-%20Media%20Batch%20Downloader.user.js)

## What this fixes

Telegram Web's async download pipeline intermittently drops custom filenames due to a race condition in their legacy Promise handling. Symptoms: works with DevTools open, fails silently in production.

**Workaround:** Bypass `appDownloadManager.downloadToDisc()` entirely. Download via `GM_download` with locally-generated blob URLs and filenames.

## Changes

- Replaced internal Telegram download with `GM_download` + blob URL
- Added anchor download fallback for blocked extensions (`.mov`, etc.)
- Preserved original filename pattern: `{postId}_{fileName|mediaId}`

## Install

1. Install original script from [Greasyfork](https://greasyfork.org/scripts/567432/)
2. Replace with patched code from this repo

## Credits

All credit to **OsoCosmico** for the original implementation. This is only a bugfix patch.
