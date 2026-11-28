import SwiftUI

// Row 6: 31 Eclipse Half · 32 Magnet Grid · 33 Checklist · 34 Flip Coin · 35 Radial Menu · 36 Dot Revolve

struct Row6Art: View {
    let column: Int
    let t: Double

    var body: some View {
        switch column {
        case 0: EclipseHalf(t: t)
        case 1: MagnetGrid(t: t)
        case 2: Checklist(t: t)
        case 3: FlipCoin(t: t)
        case 4: RadialMenu(t: t)
        default: DotRevolve(t: t)
        }
    }
}

// MARK: 31 Eclipse Half (1.5 s)

struct EclipseHalf: View {
    let t: Double

    /// Half-circle crescent: thick in the middle, tapering to points.
    private static let crescent: Path = {
        var p = Path()
        let n = 28
        for i in 0...n {
            let a = -Double.pi / 2 + Double.pi * Double(i) / Double(n)
            let pt = CGPoint(x: 30 * cos(a), y: 30 * sin(a))
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        for i in 0...n {
            let a = Double.pi / 2 - Double.pi * Double(i) / Double(n)
            p.addLine(to: CGPoint(x: 17 * cos(a), y: 30 * sin(a)))
        }
        p.closeSubpath()
        return p
    }()

    var body: some View {
        Canvas { ctx, _ in
            let p = phase(t, 1.5) / 1.5
            var c = ctx
            c.translateBy(x: 80, y: 80)
            c.rotate(by: .degrees(360 * easeInOut(p)))
            c.fill(Self.crescent, with: .color(gray(0xF2)))
        }
    }
}

// MARK: 32 Magnet Grid (2.4 s)

struct MagnetGrid: View {
    let t: Double

    // Invisible magnet: top-right -> bottom-centre -> centre -> left -> top-right.
    private static let mx = Track([(0, 128), (0.6, 80), (1.2, 80), (1.8, 30), (2.4, 128)])
    private static let my = Track([(0, 46), (0.6, 114), (1.2, 80), (1.8, 80), (2.4, 46)])

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 2.4)
            let mx: Double = Self.mx.value(u)
            let my: Double = Self.my.value(u)
            for row in 0..<5 {
                for col in 0..<7 {
                    let px = 80 + Double(col - 3) * 18
                    let py = 80 + Double(row - 2) * 18
                    let dx: Double = mx - px
                    let dy: Double = my - py
                    let w: Double = exp(-(dx * dx + dy * dy) / 650)
                    let size = 4 + 10 * w
                    let x = px + dx * 0.28 * w
                    let y = py + dy * 0.28 * w
                    let corner = lerp(size / 2, 3, clamp01(w * 1.6))
                    ctx.fillRound(box(x, y, size, size), corner, grayMix(0x4A, 0xF2, w * 1.4))
                }
            }
        }
    }
}

// MARK: 33 Checklist (2.0 s)

struct Checklist: View {
    let t: Double

    private static let items = ["Gather requirements", "Sketch wireframes", "Write the handoff"]
    // Checked state at the start of each 1/3 s step; the next step's state animates in.
    private static let states: [[Double]] = [
        [1, 1, 0], [1, 1, 1], [0, 1, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0],
    ]

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 2.0)
            let stepLen = 2.0 / 6.0
            let step = min(5, Int(u / stepLen))
            let local = u - Double(step) * stepLen
            let p = easeOut(seg(local, stepLen - 0.2, stepLen))
            let a = Self.states[step]
            let b = Self.states[(step + 1) % 6]
            for i in 0..<3 {
                let v = lerp(a[i], b[i], p)
                let y = 80 + Double(i - 1) * 28
                ctx.fillRound(box(80, y, 130, 22), 6, gray(0x22))

                let check = box(27, y, 12, 12)
                if v > 0.01 {
                    let s = 12 * (0.6 + 0.4 * v)
                    ctx.fillRound(box(27, y, s, s), 3, gray(0xF2).opacity(v))
                }
                ctx.strokeRound(check, 3, gray(0x6A).opacity(1 - v), 1.2)
                if v > 0.3 {
                    ctx.draw(symbol("checkmark", 7, .heavy, gray(0x1A).opacity(v)), at: CGPoint(x: 27, y: y))
                }

                let txt = styled(Self.items[i], 10, .regular, grayMix(0xCF, 0x6A, v))
                let resolved = ctx.resolve(txt)
                let tw = resolved.measure(in: CGSize(width: 200, height: 30)).width
                ctx.draw(resolved, at: CGPoint(x: 39, y: y), anchor: .leading)
                if v > 0.01 {
                    ctx.line(CGPoint(x: 39, y: y + 0.5), CGPoint(x: 39 + tw * v, y: y + 0.5), gray(0x8A), 1)
                }
            }
        }
    }
}

// MARK: 34 Flip Coin (1.5 s) — rotation3DEffect

struct FlipCoin: View {
    let t: Double

    var body: some View {
        let u = phase(t, 1.5)
        let air = seg(u, 0, 1.0)
        let hop = 34 * 4 * air * (1 - air)
        let flips = Double(cycle(t, 1.5) % 2)
        let angle = 180 * air + 180 * flips
        let back = cos(angle * Double.pi / 180) < 0
        let land = sin(Double.pi * seg(u, 1.0, 1.28))
        ZStack {
            Ellipse()
                .fill(Color.black.opacity(0.85))
                .frame(width: 46 * (1 - hop / 70), height: 8)
                .blur(radius: 2.5)
                .offset(y: 34)
            CoinFace(mirrored: back)
                .frame(width: 50, height: 50)
                .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
                .scaleEffect(x: 1 + 0.06 * land, y: 1 - 0.08 * land, anchor: .bottom)
                .offset(y: 4 - hop)
        }
        .frame(width: 160, height: 160)
    }
}

struct CoinFace: View {
    let mirrored: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [gray(0xFA), gray(0xD8), gray(0x8E)],
                                     center: UnitPoint(x: 0.36, y: 0.3), startRadius: 1, endRadius: 34))
            Circle()
                .strokeBorder(gray(0xAA), lineWidth: 1.5)
                .padding(4)
            Image(systemName: "moon.fill")
                .font(.system(size: 17, weight: .regular))
                .foregroundColor(gray(0xA0))
        }
        .scaleEffect(x: mirrored ? -1 : 1, y: 1)
    }
}

// MARK: 35 Radial Menu (12/7 s)

struct RadialMenu: View {
    let t: Double

    private static let angles: [Double] = [160, 125, 90, 55, 20]
    private static let glyphs = ["heart", "bookmark", "square.and.arrow.up", "trash", "bubble.left"]

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 12.0 / 7.0)
            let cx = 80.0
            let cy = 112.0
            for i in 0..<5 {
                let d = Double(i)
                let open = spring(seg(u, d * 0.04, 0.45 + d * 0.04), damping: 5.5, bounces: 1.2)
                let close = easeIn(seg(u, 1.0 + (4 - d) * 0.03, 1.3 + (4 - d) * 0.03))
                let o = open * (1 - close)
                if o < 0.02 { continue }
                let a = Self.angles[i] * Double.pi / 180
                let x = cx + 54 * o * cos(a)
                let y = cy - 54 * o * sin(a)
                let s = min(1.15, o)
                ctx.fillCircle(x, y, 13 * s, gray(0x5A))
                var c = ctx
                c.translateBy(x: x, y: y)
                c.scaleBy(x: s, y: s)
                c.draw(symbol(Self.glyphs[i], 11, .medium, gray(0xF2)), at: .zero)
            }
            let m = spring(seg(u, 0, 0.4), damping: 5.5, bounces: 1.1) * (1 - easeInOut(seg(u, 1.0, 1.32)))
            ctx.fillCircle(cx, cy, 18, gray(0xF2))
            var c = ctx
            c.translateBy(x: cx, y: cy)
            c.rotate(by: .degrees(45 * m))
            c.draw(symbol("plus", 16, .bold, gray(0x1A)), at: .zero)
        }
    }
}

// MARK: 36 Dot Revolve (1.0 s)

struct DotRevolve: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let a = 2 * Double.pi * phase(t, 1.0)
            ctx.strokeCircle(80, 80, 35, gray(0x3A), 8)
            ctx.fillCircle(80 + 35 * sin(a), 80 - 35 * cos(a), 4, gray(0xF2))
        }
    }
}
