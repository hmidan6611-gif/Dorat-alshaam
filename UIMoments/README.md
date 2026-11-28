# UI Moments

A native SwiftUI iOS app: a dark board of 36 looping micro-interactions in a 6 × 6 grid,
every tile animating at once, forever. No permissions, no network, no backend.

## Run

1. Open `UIMoments.xcodeproj` in Xcode 15 or newer (iOS 17 deployment target).
2. Pick an iPhone simulator and press Run.

(Or regenerate the project with `xcodegen generate` from `project.yml`.)

## How it works

- **One clock.** `RootView` hosts a single `TimelineView(.animation)`; `t` is seconds since the
  board appeared. Every tile is a pure function of `(t mod period)`. There's no `withAnimation`,
  `.repeatForever` or per-view timers on the tiles. Every period divides 12 s, so the whole board
  repeats exactly every 12 s, and the footer progress line uses the same clock.
- **Fixed canvas.** The board is designed in 1080 × 1350 points and scaled uniformly to the
  screen width, centred vertically on `#060606`.
- **Tap the "UI Moments" title** to restart every tile in sync (t = 0).
- **Tap any tile** to zoom it (matchedGeometryEffect) into a large card. The animation keeps
  running on the shared clock. Swipe left/right for the next/previous tile, and tap to zoom back.

## Files

| File | Contents |
| --- | --- |
| `Motion.swift` | easing curves, hand-written springs, keyframe tracks |
| `Theme.swift` | grayscale palette, board geometry, tile catalogue (names + periods) |
| `Drawing.swift` | `GraphicsContext` helpers (shapes, baseline-aligned text, SF Symbols) |
| `RootView.swift` | the shared clock, the open/close/swipe state |
| `BoardView.swift` | header, 36 tiles, footer, 12 s progress line |
| `Row1Tiles.swift` … `Row6Tiles.swift` | the 36 animations, six per file |
| `OpenTileView.swift` | the full-screen card |
