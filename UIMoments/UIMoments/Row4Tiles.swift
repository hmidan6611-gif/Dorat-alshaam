import SwiftUI

// Row 4: 19 Ripple Pad · 20 Worm Dots · 21 Download Ring · 22 Leaf Tabs · 23 Bell Toggle · 24 Ink Switch

struct Row4Art: View {
    let column: Int
    let t: Double

    var body: some View {
        switch column {
        case 0: RipplePad(t: t)
        case 1: WormDots(t: t)
        case 2: DownloadRing(t: t)
        case 3: LeafTabs(t: t)
        case 4: BellToggle(t: t)
        default: InkSwitch(t: t)
        }
    }
}

// MARK: 19 Ripple Pad (12/9 s) — a new ring every 1/3 s

struct RipplePad: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let pad = box(80, 80, 130, 80)
            let shape = Path(roundedRect: pad, cornerRadius: 8, style: .continuous)
            ctx.fill(shape, with: .color(gray(0x1F)))
            var c = ctx
            c.clip(to: shape)
            let life = 4.0 / 3.0
            for k in 0..<4 {
                let age = phase(t + Double(k) / 3, life) / life
                let r = 4 + 72 * age
                let alpha = (1 - age) * min(1, age * 6)
                c.strokeCircle(80, 80, r, gray(0x7A).opacity(alpha), 1)
            }
            ctx.fillCircle(80, 80, 3, gray(0x9A))
        }
    }
}

// MARK: 20 Worm Dots (2.0 s)

struct WormDots: View {
    let t: Double

    private static let track = Track([
        (0.0, 0), (0.25, 1), (0.5, 2), (0.75, 3), (1.0, 4),
        (1.25, 3), (1.5, 2), (1.75, 1), (2.0, 0),
    ])

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 2.0)
            ctx.fillRound(box(80, 80, 124, 24), 12, gray(0x1A))
            for i in 0..<5 {
                ctx.fillCircle(80 + Double(i - 2) * 20, 80, 4, gray(0x5A))
            }
            let s = Self.track.segment(u)
            let lead = lerp(s.from, s.to, easeOut(seg(s.p, 0, 0.75)))
            let trail = lerp(s.from, s.to, easeIn(seg(s.p, 0.25, 1)))
            let a = 80 + (min(lead, trail) - 2) * 20
            let b = 80 + (max(lead, trail) - 2) * 20
            let worm = CGRect(x: a - 4, y: 76, width: b - a + 8, height: 8)
            ctx.fill(Path(roundedRect: worm, cornerRadius: 4), with: .color(gray(0xF2)))
        }
    }
}

// MARK: 21 Download Ring (12/7 s)

struct DownloadRing: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let period = 12.0 / 7.0
            let u = phase(t, period)
            // Pill-ness: 1 = Download pill, 0 = small circle.
            let expand = easeOutBack(seg(u, 0.75, 1.0), 1.3)
            let collapse = easeInOut(seg(u, 1.35, 1.6))
            let k = u < 0.75 ? 0 : expand * (1 - collapse)
            let white = easeInOut(seg(u, 0.4, 0.5)) * (1 - easeInOut(seg(u, 0.75, 0.95)))

            let w = lerp(30, 100, k)
            let h = lerp(30, 32, k)
            let squish = u >= 0.4 && u < 0.6 ? 1 + 0.1 * sin(Double.pi * seg(u, 0.4, 0.6)) : 1
            let r = box(80, 80, w * squish, h * squish)
            ctx.fill(Path(roundedRect: r, cornerRadius: h * squish / 2), with: .color(grayMix(0x2A, 0xF2, white)))

            // Spinner runs from the end of the collapse (1.6 s) until the ring completes (0.4 s).
            let spin = phase(u - 1.6, period)
            let spinning = spin < 0.8 && white < 0.99 && k < 0.05
            if spinning {
                let progress = easeInOut(seg(spin, 0.0, 0.5))
                let start = -90 + spin * 540
                ctx.strokeCircle(80, 80, 10, gray(0x4A), 2.5)
                var arc = Path()
                arc.addArc(center: CGPoint(x: 80, y: 80), radius: 10,
                           startAngle: .degrees(start),
                           endAngle: .degrees(start + 30 + 330 * progress), clockwise: false)
                ctx.stroke(arc, with: .color(gray(0xF2)), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
            }
            if white > 0.01 {
                let pop = 0.5 + 0.5 * spring(seg(u, 0.42, 0.7), damping: 5, bounces: 1.2)
                var c = ctx
                c.translateBy(x: 80, y: 80)
                c.scaleBy(x: pop, y: pop)
                c.draw(symbol("checkmark", 13, .bold, gray(0x1E).opacity(white)), at: .zero)
            }
            let label = clamp01((k - 0.65) / 0.35)
            if label > 0 {
                let txt = symbol("arrow.down.to.line", 11, .semibold, gray(0xF2))
                    + Text("  Download").font(.system(size: 12, weight: .semibold)).foregroundColor(gray(0xF2))
                var c = ctx
                c.opacity = label
                c.draw(txt, at: CGPoint(x: 80, y: 80))
            }
        }
    }
}

// MARK: 22 Leaf Tabs (2.0 s)

struct LeafTabs: View {
    let t: Double

    // Shifted half a step so t = 0 shows Y already settled: M, Y, D, W.
    private static let order: [Int] = [2, 3, 0, 1]
    private static let shapes: [[Double]] = [
        [0.18, 0.38, 0.70, 1.00, 0.95, 0.66, 0.38, 0.18],       // D: bell
        [1.00, 0.88, 0.75, 0.62, 0.50, 0.38, 0.26, 0.15],       // W: falling staircase
        [1.00, 0.72, 0.45, 0.22, 0.28, 0.52, 0.78, 0.95],       // M: valley
        [0.15, 0.26, 0.38, 0.50, 0.62, 0.75, 0.88, 1.00],       // Y: rising staircase
    ]
    private static let letters = ["D", "W", "M", "Y"]

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t + 0.5, 2.0)
            let step = min(3, Int(u / 0.5))
            let local = u - Double(step) * 0.5
            let cur = Self.order[step]
            let prev = Self.order[(step + 3) % 4]
            let slide = easeInOut(seg(local, 0, 0.22))
            let hx = lerp(Double(prev), Double(cur), slide)

            ctx.fillRound(box(80, 46, 140, 18), 9, gray(0x1E))
            ctx.fillRound(box(80 + (hx - 1.5) * 35, 46, 33, 14), 7, gray(0x5A))
            for i in 0..<4 {
                let on = i == cur
                ctx.draw(styled(Self.letters[i], 9, .semibold, on ? gray(0xF2) : gray(0x9A)),
                         at: CGPoint(x: 80 + (Double(i) - 1.5) * 35, y: 46))
            }

            let from = Self.shapes[prev]
            let to = Self.shapes[cur]
            for i in 0..<8 {
                let sp = spring(seg(local, Double(i) * 0.018, Double(i) * 0.018 + 0.42), damping: 5, bounces: 1.3)
                let v = lerp(from[i], to[i], sp)
                let h = max(3, 54 * v)
                let x = 80 + (Double(i) - 3.5) * 15
                let r = CGRect(x: x - 5, y: 128 - h, width: 10, height: h)
                ctx.fillRound(r, 2.5, v > 0.6 ? gray(0xF2) : gray(0x7A))
            }
        }
    }
}

// MARK: 23 Bell Toggle (12/9 s)

struct BellToggle: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 12.0 / 9.0)
            let q = seg(u, 0, 0.9)
            let swing = 25 * wobble(q, damping: 3.4, cycles: 3.2)
            let attack: Double = min(1, u / 0.12)
            let decay: Double = u < 0.9 ? exp(-3 * q) : 0
            let glow: Double = 0.4 * sin(Double.pi * seg(u, 0, 0.25)) + 0.6 * decay * attack
            ctx.fillRound(box(80, 72, 50, 50), 12, grayMix(0x33, 0x5A, clamp01(glow)))

            var c = ctx
            c.translateBy(x: 80, y: 61)
            c.rotate(by: .degrees(swing))
            c.draw(symbol("bell", 22, .regular, gray(0xF2)), at: CGPoint(x: 0, y: 11))

            let pop = 1 + 0.15 * sin(Double.pi * seg(u, 0, 0.2))
            ctx.fillCircle(102, 50, 8 * pop, gray(0xF2))
            ctx.draw(styled("3", 10, .bold, gray(0x1A)), at: CGPoint(x: 102, y: 50))
            ctx.draw(styled("Notifications on", 10, .regular, gray(0x9A)), at: CGPoint(x: 80, y: 116))
        }
    }
}

// MARK: 24 Ink Switch (12/9 s)

struct InkSwitch: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 12.0 / 9.0)
            let turnOn = easeInOut(seg(u, 0.08, 0.45))
            let turnOff = easeInOut(seg(u, 0.75, 1.12))
            let on = turnOn * (1 - turnOff)
            let track = box(80, 80, 74, 40)
            let shape = Path(roundedRect: track, cornerRadius: 20)
            ctx.fill(shape, with: .color(gray(0x2A)))

            let x = lerp(63, 97, on)
            // Ink floods from the knob while turning on, drains back while turning off.
            let inkR = u < 0.75 ? 82 * easeIn(seg(u, 0.1, 0.5)) : 82 * (1 - easeOut(seg(u, 0.75, 1.12)))
            if inkR > 0.5 {
                var c = ctx
                c.clip(to: shape)
                c.fillCircle(x, 80, inkR, gray(0xF6))
            }
            let disc = 15 * on
            if disc > 0.3 { ctx.fillCircle(x, 80, disc, gray(0x0A)) }
            ctx.fillCircle(x, 80, lerp(5, 4, on), gray(0xF6))
        }
    }
}
