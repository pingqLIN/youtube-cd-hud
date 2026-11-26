# README artwork and preservation

[繁體中文](ASSETS.zh-tw.md)

`cue-fox-banner-v1.png` is an AI-generated SDR concept banner, using the existing `youtube-cd-hud-cue-fox-sync-banner-v1.png` as its visual reference. It is not an interface screenshot. The English wordmark is Cue Fox; the Traditional Chinese name is 曲狐. The repository slug and installed product identifiers remain unchanged.

Playback images `youtube-cd-hud-preview-01.png` through `youtube-cd-hud-preview-06.png` are historical screenshots already present in the repository. All six are displayed near the start of the README in a three-column, two-row gallery; the editor screenshot remains in its separate section. These images are not evidence of a new live acceptance run.

## HDR originals

The two original JPEG files contain MPF metadata and an ISO 21496 identifier. Keep these files byte-for-byte: do not open and re-export them, strip metadata, optimize them, crop them, or replace them with generated PNG files. Use a separate SDR derivative for new layouts and link directly to the original JPEG. Browser previews and CDN transformations may display SDR; this change does not certify the display pipeline.

| Original | SHA-256 |
| --- | --- |
| `youtube-cd-hud-cue-fox-interface-hdr.jpg` | `0034ad41c7c93c267f324d52a132703009dad3f06dad143143d971dd7904a39e` |
| `youtube-cd-hud-cue-fox-sync-hdr.jpg` | `c829e6e6e8dd5a0d2f670ce5d44d777444fcd6276cbcad92c5077c41ac618cb3` |

When updating artwork, retain the originals, create a separately named derivative, and compare these hashes before and after. Do not infer HDR from a filename or a bright-looking SDR preview. The current README uses the new SDR banner plus links to both unchanged HDR originals.
