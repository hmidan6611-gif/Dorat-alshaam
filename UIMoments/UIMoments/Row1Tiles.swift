import SwiftUI

// Row 1: 01 Bars Fade · 02 Bloom Toggle · 03 Snap Grid · 04 Card Fan · 05 Gooey Tab Bar · 06 Blocks Scale

struct Row1Art: View {
    let column: Int
    let t: Double

    var body: some View {
        switch column {
        case 0: BarsFade(t: t)
        case 1: BloomToggle(t: t)
        case 2: SnapGrid(t: t)
        case 3: CardFan(t: t)
        case 4: GooeyTabBar(t: t)
        default: BlocksScale(t: t)
        }
    }
}

// MARK: 01 Bars Fade (1.0 s)

struct BarsFade: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let p = phase(t, 1.0)
            for i in 0..<3 {
                let local = p - Double(i) / 3
                let b = 0.5 + 0.5 * cos(2 * Double.pi * local)
                let cx = 80 + Double(i - 1) * 28
                ctx.fillRound(box(cx, 80, 20, 48), 3, grayMix(0x4A, 0xF2, b * b))
            }
        }
    }
}

// MARK: 02 Bloom Toggle (12/7 s)

struct BloomToggle: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let period = 12.0 / 7.0
            let p = phase(t, period) / period
            // Bud -> overshooting bloom (~0.65 s) -> back to a tiny bud (~1.4 s).
            let grow = easeOutBack(seg(p, 0.0, 0.38), 2.2)
            let shrink = easeInOut(seg(p, 0.45, 0.82))
            let open = max(0, grow * (1 - shrink))
            let size = 0.14 + 0.86 * open
            let white = clamp01(open * 1.25)
            let spin = Angle.degrees(30 * easeInOut(p))

            var c = ctx
            c.translateBy(x: 80, y: 80)
            c.rotate(by: spin)
            let petalW = 15 * size
            let petalH = 30 * size
            let dist = 17 * size
            let color = grayMix(0x3A, 0xF2, white)
            for k in 0..<6 {
                var pc = c
                pc.rotate(by: .degrees(Double(k) * 60))
                let r = CGRect(x: -petalW / 2, y: -dist - petalH / 2, width: petalW, height: petalH)
                pc.fill(Path(roundedRect: r, cornerRadius: petalW / 2), with: .color(color))
            }
            c.fillCircle(0, 0, 3 + 7 * size, gray(0x1A))
        }
    }
}

// MARK: 03 Snap Grid (3.0 s)

struct SnapGrid: View {
    let t: Double

    // Arrival times and slots (col, row). Each hop takes ~0.25 s, then holds.
    private static let arrivals: [Double] = [0.0, 0.25, 1.0, 1.5, 2.0, 2.75]
    private static let slots: [(Double, Double)] = [(0, 0), (2, 0), (1, 1), (2, 2), (0, 2), (0, 0)]

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 3.0)
            ctx.fillRound(box(80, 80, 120, 120), 12, gray(0x1C))
            for row in 0..<3 {
                for col in 0..<3 {
                    let r = box(80 + Double(col - 1) * 36, 80 + Double(row - 1) * 36, 28, 28)
                    ctx.strokeRound(r, 7, gray(0x2C), 1.5)
                }
            }
            var x = Self.slots[0].0
            var y = Self.slots[0].1
            var stretch = 0.0
            for i in 1..<Self.arrivals.count {
                let end = Self.arrivals[i]
                let start = max(0, end - 0.25)
                if u >= start {
                    let raw = seg(u, start, end + 0.12)
                    let e = easeOutBack(raw, 2.4)
                    x = lerp(Self.slots[i - 1].0, Self.slots[i].0, e)
                    y = lerp(Self.slots[i - 1].1, Self.slots[i].1, e)
                    stretch = sin(Double.pi * seg(u, start, end))
                }
            }
            let cx = 80 + (x - 1) * 36
            let cy = 80 + (y - 1) * 36
            let s = 26 * (1 + 0.12 * stretch)
            ctx.fillRound(box(cx, cy, s, s), 6, gray(0xF2))
        }
    }
}

// MARK: 04 Card Fan (2.0 s)

struct CardFan: View {
    let t: Double

    private static let angles: [Double] = [-35, -20, -5, 10, 25]
    private static let shades: [Int] = [0x3E, 0x58, 0x78, 0xA0, 0xD6]

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 2.0)
            let fanOut = easeOutBack(seg(u, 0.0, 0.55), 1.4)
            let collapse = easeInOut(seg(u, 1.0, 1.5))
            let f = fanOut * (1 - collapse)
            for i in 0..<5 {
                var c = ctx
                c.translateBy(x: 80, y: 122)
                c.rotate(by: .degrees(Self.angles[i] * f))
                let card = CGRect(x: -18, y: -68, width: 36, height: 48)
                c.fillRound(card, 5, gray(Self.shades[i]))
                if i == 4 {
                    c.fillRound(CGRect(x: -13, y: -63, width: 26, height: 22), 3, gray(0x6A))
                    c.fillRound(CGRect(x: -13, y: -36, width: 20, height: 3), 1.5, gray(0x8A))
                    c.fillRound(CGRect(x: -13, y: -30, width: 13, height: 3), 1.5, gray(0x9E))
                } else {
                    c.strokeRound(card, 5, gray(0x0F).opacity(0.5), 1)
                }
            }
        }
    }
}

// MARK: 05 Gooey Tab Bar (2.0 s)

struct GooeyTabBar: View {
    let t: Double

    // Active tab index over time: person -> heart -> search -> house (hold) -> back.
    private static let track = Track([
        (0.0, 3), (0.25, 3), (0.5, 2), (0.75, 1), (1.0, 0),
        (1.25, 0), (1.5, 1), (1.75, 2), (2.0, 3),
    ])
    private static let icons = ["house", "magnifyingglass", "heart", "person"]

    private func tabX(_ i: Double) -> Double { 80 + (i - 1.5) * 37.5 }

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 2.0)
            ctx.fillRound(box(80, 80, 150, 30), 15, gray(0x1A))

            let s = Self.track.segment(u)
            let lead = lerp(s.from, s.to, easeOut(s.p))
            let trail = lerp(s.from, s.to, easeIn(s.p))
            let a = tabX(min(lead, trail))
            let b = tabX(max(lead, trail))
            let moving = s.from != s.to
            let neck = moving ? sin(Double.pi * s.p) : 0
            let h = 24 - 6 * neck
            // Gooey stretch: a capsule spanning trail..lead, snapping round on arrival.
            let blob = CGRect(x: a - 13, y: 80 - h / 2, width: b - a + 26, height: h)
            ctx.fill(Path(roundedRect: blob, cornerRadius: h / 2), with: .color(gray(0xF2)))

            let centre = (a + b) / 2
            for i in 0..<4 {
                let x = tabX(Double(i))
                let inside = abs(x - centre) < (b - a) / 2 + 9
                let color = inside ? gray(0x1A) : gray(0x9A)
                ctx.draw(symbol(Self.icons[i], 13, .regular, color), at: CGPoint(x: x, y: 80))
            }
        }
    }
}

// MARK: 06 Blocks Scale (3.0 s)

struct BlocksScale: View {
    let t: Double

    private static let order: [(Double, Double)] = [(-1, -1), (1, -1), (1, 1), (-1, 1)]

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 3.0)
            var w = [0.0, 0.0, 0.0, 0.0]
            for k in 0..<4 {
                let local = phase(u - Double(k) * 0.75, 3.0)
                w[k] = local < 0.75 ? sin(Double.pi * local / 0.75) : 0
            }
            let total = w[0] + w[1] + w[2] + w[3]
            for k in 0..<4 {
                let others = total - w[k]
                let s = 22 * (1 + 0.18 * w[k] - 0.06 * others)
                let cx = 80 + Self.order[k].0 * 14
                let cy = 80 + Self.order[k].1 * 14
                ctx.fillRound(box(cx, cy, s, s), 4, gray(0xDC))
            }
        }
    }
}
