import SwiftUI

/// Grayscale palette. Everything on the board is a shade of grey.
@inline(__always) func gray(_ v: Int) -> Color {
    Color(.sRGB, white: Double(v) / 255, opacity: 1)
}

/// Grey between two 0-255 levels.
func grayMix(_ a: Int, _ b: Int, _ p: Double) -> Color {
    Color(.sRGB, white: lerp(Double(a), Double(b), clamp01(p)) / 255, opacity: 1)
}

enum Palette {
    static let background = gray(0x06)
    static let tile = gray(0x0F)
    static let tileBorder = gray(0x26)
    static let number = gray(0x5A)
    static let label = gray(0xE0)
    static let white = gray(0xF2)
}

enum Board {
    static let width: Double = 1080
    static let height: Double = 1350
    static let tileW: Double = 161
    static let tileH: Double = 186
    static let loop: Double = 12

    static func tileOrigin(_ index: Int) -> CGPoint {
        let col = Double(index % 6)
        let row = Double(index / 6)
        return CGPoint(x: 29 + col * 172.4, y: 107 + row * 198.3)
    }
}

struct TileInfo {
    let name: String
    let period: Double
}

enum Catalog {
    static let tiles: [TileInfo] = [
        TileInfo(name: "Bars Fade", period: 1.0),
        TileInfo(name: "Bloom Toggle", period: 12.0 / 7.0),
        TileInfo(name: "Snap Grid", period: 3.0),
        TileInfo(name: "Card Fan", period: 2.0),
        TileInfo(name: "Gooey Tab Bar", period: 2.0),
        TileInfo(name: "Blocks Scale", period: 3.0),
        TileInfo(name: "Stretch Toggle", period: 12.0 / 9.0),
        TileInfo(name: "Merge Drops", period: 2.0),
        TileInfo(name: "Paper Plane", period: 2.0),
        TileInfo(name: "Detent Dial", period: 12.0 / 7.0),
        TileInfo(name: "Domino Row", period: 12.0 / 9.0),
        TileInfo(name: "Pebble Rating", period: 12.0 / 9.0),
        TileInfo(name: "Jelly Pad", period: 2.0),
        TileInfo(name: "Swipe Confirm", period: 12.0 / 9.0),
        TileInfo(name: "Bookmark", period: 2.4),
        TileInfo(name: "Depth Stack", period: 1.5),
        TileInfo(name: "Menu Morph", period: 12.0 / 9.0),
        TileInfo(name: "Elastic String", period: 12.0 / 9.0),
        TileInfo(name: "Ripple Pad", period: 12.0 / 9.0),
        TileInfo(name: "Worm Dots", period: 2.0),
        TileInfo(name: "Download Ring", period: 12.0 / 7.0),
        TileInfo(name: "Leaf Tabs", period: 2.0),
        TileInfo(name: "Bell Toggle", period: 12.0 / 9.0),
        TileInfo(name: "Ink Switch", period: 12.0 / 9.0),
        TileInfo(name: "Rocker Switch", period: 1.0),
        TileInfo(name: "Scrub Wave", period: 12.0 / 7.0),
        TileInfo(name: "Squash Play", period: 1.0),
        TileInfo(name: "Rubber Search", period: 12.0 / 7.0),
        TileInfo(name: "Odometer", period: 3.0),
        TileInfo(name: "Tide Progress", period: 2.4),
        TileInfo(name: "Eclipse Half", period: 1.5),
        TileInfo(name: "Magnet Grid", period: 2.4),
        TileInfo(name: "Checklist", period: 2.0),
        TileInfo(name: "Flip Coin", period: 1.5),
        TileInfo(name: "Radial Menu", period: 12.0 / 7.0),
        TileInfo(name: "Dot Revolve", period: 1.0),
    ]

    static func number(_ index: Int) -> String {
        index + 1 < 10 ? "0\(index + 1)" : "\(index + 1)"
    }
}
