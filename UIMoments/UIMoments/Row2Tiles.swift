import SwiftUI

// Row 2: 07 Stretch Toggle · 08 Merge Drops · 09 Paper Plane · 10 Detent Dial · 11 Domino Row · 12 Pebble Rating

struct Row2Art: View {
    let column: Int
    let t: Double

    var body: some View {
        switch column {
        case 0: StretchToggle(t: t)
        case 1: MergeDrops(t: t)
        case 2: PaperPlane(t: t)
        case 3: DetentDial(t: t)
        case 4: DominoRow(t: t)
        default: PebbleRating(t: t)
        }
    }
}

// MARK: 07 Stretch Toggle (12/9 s)

struct StretchToggle: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let half = 12.0 / 18.0
            let travel = 0.36
            // t = 0 sits in the middle of a transition.
            let shifted = t + travel / 2
            let s = phase(shifted, half)
            let goingOn = cycle(shifted, half) % 2 == 0
            let p = seg(s, 0, travel)
            let e = easeInOut(p)
            let on = goingOn ? e : 1 - e

            let left = 80.0 - 70 + 25
            let right = 80.0 + 70 - 25
            let x = lerp(left, right, goingOn ? e : 1 - e)

            // Stretch while travelling, squash on arrival.
            let arrive = seg(s, travel, travel + 0.28)
            let squash = p >= 1 ? wobble(arrive, damping: 3.5, cycles: 1.2) : 0
            let w = 40 * (1 + 1.0 * sin(Double.pi * p)) * (1 - 0.18 * squash)
            let h = 40 * (1 - 0.1 * sin(Double.pi * p)) * (1 + 0.12 * squash)
            let minX = 80.0 - 70 + 5 + w / 2
            let maxX = 80.0 + 70 - 5 - w / 2
            let cx = min(max(x, minX), maxX)

            ctx.fillRound(box(80, 80, 140, 50), 25, grayMix(0x3A, 0xDE, on))
            let knob = box(cx, 80, w, h)
            ctx.fill(Path(roundedRect: knob, cornerRadius: h / 2), with: .color(grayMix(0xF2, 0x2A, on)))
        }
    }
}

// MARK: 08 Merge Drops (2.0 s) — blur + alpha threshold metaballs

struct MergeDrops: View {
    let t: Double

    // Axis per 2 s cycle (degrees); 6 cycles = 12 s and the list wraps back to 45 + 360.
    private static let axes: [Double] = [45, 90, 180, 225, 270, 360, 405]

    var body: some View {
        Canvas { ctx, _ in
            let p = phase(t, 2.0) / 2.0
            let k = cycle(t, 2.0) % 6
            let turn = easeInOut(seg(p, 0.82, 1.0))
            let angle = lerp(Self.axes[k], Self.axes[k + 1], turn) * Double.pi / 180
            let apart = sin(Double.pi * p)
            let d = 12 + 40 * apart * apart
            let dx = cos(angle)
            let dy = sin(angle)
            let big = CGPoint(x: 80 - dx * d * 0.38, y: 80 - dy * d * 0.38)
            let small = CGPoint(x: 80 + dx * d * 0.62, y: 80 + dy * d * 0.62)

            var c = ctx
            c.addFilter(.alphaThreshold(min: 0.5, color: gray(0xF2)))
            c.addFilter(.blur(radius: 6))
            c.drawLayer { layer in
                layer.fillCircle(big.x, big.y, 24, .white)
                layer.fillCircle(small.x, small.y, 15, .white)
            }
        }
    }
}

// MARK: 09 Paper Plane (2.0 s)

struct PaperPlane: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 2.0)
            // Button shade: dark while the plane sits on it, white "Send" pill from 1.0 s.
            let level: Double
            if u < 1.0 {
                level = 0
            } else if u < 1.8 {
                level = easeInOut(seg(u, 1.0, 1.25))
            } else {
                level = 1 - easeInOut(seg(u, 1.8, 2.0))
            }
            let bg = grayMix(0x2C, 0xED, level)
            let pop = 1 + 0.06 * wobble(seg(u, 1.75, 2.1), damping: 3, cycles: 1)
            ctx.fillRound(box(80, 84, 100 * pop, 36 * pop), 18, bg)

            let sent = u >= 0.3 && u < 1.0
            if sent {
                let a = seg(u, 0.3, 0.42)
                let txt = styled("Sent", 13, .semibold, gray(0x8A).opacity(a))
                ctx.draw(txt, at: CGPoint(x: 80, y: 84))
            } else {
                let dark = level > 0.5
                let color = dark ? gray(0x1E) : gray(0xF2)
                let fade = u < 0.3 ? 1 - seg(u, 0.22, 0.3) : seg(u, 1.0, 1.15)
                ctx.draw(styled("Send", 13, .semibold, color.opacity(fade)), at: CGPoint(x: 86, y: 84))
            }

            // Plane: fly in (1.25-1.75), sit (1.75-2.25), launch out (0.25-0.5).
            var x = 0.0, y = 0.0, s = 1.0, visible = true
            let restX = 62.0
            let restY = 82.0
            if u >= 1.25 && u < 1.75 {
                let e = easeOut(seg(u, 1.25, 1.75))
                x = lerp(6, restX, e); y = lerp(150, restY, e); s = lerp(0.6, 1, e)
            } else if u >= 1.75 || u < 0.25 {
                x = restX; y = restY
            } else if u < 0.5 {
                let e = easeIn(seg(u, 0.25, 0.5))
                x = lerp(restX, 168, e); y = lerp(restY, -8, e); s = lerp(1, 1.3, e)
            } else {
                visible = false
            }
            if visible {
                var c = ctx
                c.translateBy(x: x, y: y)
                c.scaleBy(x: s, y: s)
                c.draw(symbol("paperplane", 22, .regular, .white), at: .zero)
            }
        }
    }
}

// MARK: 10 Detent Dial (12/7 s)

struct DetentDial: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let period = 12.0 / 7.0
            let u = phase(t, period)
            let raw = 5 - 5 * cos(2 * Double.pi * u / period + 0.6435)
            let value = Int(raw.rounded())
            // Pointer snaps onto the detent with a little give.
            let frac = raw - Double(value)
            let pointer = Double(value) + 0.18 * frac
            func angle(_ v: Double) -> Double { (-135 + 27 * v) * Double.pi / 180 }

            for i in 0...10 {
                let a = angle(Double(i))
                let active = i == value
                let r0 = active ? 41.0 : 44.0
                let r1 = active ? 53.0 : 50.0
                let p0 = CGPoint(x: 80 + r0 * sin(a), y: 80 - r0 * cos(a))
                let p1 = CGPoint(x: 80 + r1 * sin(a), y: 80 - r1 * cos(a))
                ctx.line(p0, p1, active ? gray(0xF2) : gray(0x5A), active ? 2.5 : 1.5)
            }
            ctx.fillCircle(80, 80, 35, gray(0x1E))
            ctx.strokeCircle(80, 80, 35, gray(0x44), 1.5)
            let a = angle(pointer)
            let q0 = CGPoint(x: 80 + 24 * sin(a), y: 80 - 24 * cos(a))
            let q1 = CGPoint(x: 80 + 31 * sin(a), y: 80 - 31 * cos(a))
            ctx.line(q0, q1, gray(0xF2), 3)
            ctx.draw(styled("\(value)", 20, .bold, gray(0xF2)), at: CGPoint(x: 80, y: 80))
        }
    }
}

// MARK: 11 Domino Row (12/9 s)

struct DominoRow: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 12.0 / 9.0)
            let fallen = 62.0
            for i in 0..<7 {
                let d = Double(i)
                // Stand back up from the left, then topple to the right in a wave.
                let up = easeOutBack(seg(u, d * 0.05, d * 0.05 + 0.16), 1.2)
                let down = easeIn(seg(u, 0.75 + d * 0.05, 0.75 + d * 0.05 + 0.13))
                let lean = fallen * (1 - up) + fallen * down * up
                let angle = i == 6 ? lean * 1.25 : lean
                let x = 80 + (d - 3) * 16
                var c = ctx
                c.translateBy(x: x + 4, y: 104)
                c.rotate(by: .degrees(angle))
                c.fillRound(CGRect(x: -8, y: -40, width: 8, height: 40), 2.5, gray(0xF2))
            }
            ctx.fillRound(box(80, 105.5, 124, 1.5), 0.75, gray(0x2A))
        }
    }
}

// MARK: 12 Pebble Rating (12/9 s)

struct PebbleRating: View {
    let t: Double

    private static let widths: [Double] = [14, 16, 18, 20, 22]
    private static let counts: [Int] = [2, 3, 4, 5, 1]

    var body: some View {
        Canvas { ctx, _ in
            let period = 12.0 / 9.0
            let u = phase(t, period)
            let stepLen = period / 5
            let step = min(4, Int(u / stepLen))
            let local = u - Double(step) * stepLen
            let n = Self.counts[step]
            var x = 80.0 - 57
            for i in 0..<5 {
                let w = Self.widths[i]
                let selected = i < n
                let justPicked = i == n - 1 && n > 1
                let pop = justPicked ? spring(seg(local, 0, 0.22), damping: 5, bounces: 1.2) : 1
                let s = selected ? 1 + 0.15 * pop : 1
                let lift = selected ? -4 * pop : 0
                let h = w * 0.8
                let r = box(x + w / 2, 80 + lift - h / 2 + 8, w * s, h * s)
                ctx.fill(Path(ellipseIn: r), with: .color(selected ? gray(0xF2) : gray(0x5A)))
                x += w + 6
            }
            ctx.draw(styled("\(n) / 5", 11, .regular, gray(0x8A)), at: CGPoint(x: 80, y: 112))
        }
    }
}
