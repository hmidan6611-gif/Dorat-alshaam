import SwiftUI

// Row 5: 25 Rocker Switch · 26 Scrub Wave · 27 Squash Play · 28 Rubber Search · 29 Odometer · 30 Tide Progress

struct Row5Art: View {
    let column: Int
    let t: Double

    var body: some View {
        switch column {
        case 0: RockerSwitch(t: t)
        case 1: ScrubWave(t: t)
        case 2: SquashPlay(t: t)
        case 3: RubberSearch(t: t)
        case 4: Odometer(t: t)
        default: TideProgress(t: t)
        }
    }
}

// MARK: 25 Rocker Switch (1.0 s)

struct RockerSwitch: View {
    let t: Double

    /// -1 = "I" pressed in, +1 = "O" pressed in. Rocks with a spring twice a second.
    private var tilt: Double {
        let u = phase(t, 1.0)
        if u < 0.5 {
            return -1 + 2 * spring(seg(u, 0, 0.22), damping: 6, bounces: 1.1)
        }
        return 1 - 2 * spring(seg(u, 0.5, 0.72), damping: 6, bounces: 1.1)
    }

    var body: some View {
        let tau = tilt
        let leftRaised = clamp01((1 + tau) / 2)
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(gray(0x1A))
                .frame(width: 98, height: 58)
            HStack(spacing: 2) {
                RockerHalf(label: "I", raised: leftRaised)
                RockerHalf(label: "O", raised: 1 - leftRaised)
            }
            .frame(width: 90, height: 50)
            .rotation3DEffect(.degrees(tau * 14), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
        }
        .frame(width: 160, height: 160)
    }
}

struct RockerHalf: View {
    let label: String
    let raised: Double

    var body: some View {
        let top = grayMix(0x3A, 0xCF, raised)
        let bottom = grayMix(0x30, 0xA8, raised)
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(LinearGradient(colors: [top, bottom], startPoint: .top, endPoint: .bottom))
            RoundedRectangle(cornerRadius: 1, style: .continuous)
                .fill(Color.white.opacity(0.6 * raised))
                .frame(height: 1.5)
                .padding(.horizontal, 6)
                .padding(.top, 2)
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(raised > 0.5 ? gray(0x2A) : gray(0x8A))
                .frame(maxHeight: .infinity)
        }
        .scaleEffect(x: 1, y: 1 - 0.06 * (1 - raised))
    }
}

// MARK: 26 Scrub Wave (12/7 s)

struct ScrubWave: View {
    let t: Double

    private static let heights: [Double] = (0..<40).map { i in
        let d = Double(i)
        return 4 + 15 * abs(sin(d * 1.3) * cos(d * 0.47)) + 5 * abs(sin(d * 0.31))
    }

    var body: some View {
        Canvas { ctx, _ in
            let period = 12.0 / 7.0
            let p = phase(t, period) / period
            ctx.fillCircle(22, 80, 13, gray(0xF2))
            ctx.fillRound(box(18.5, 80, 3, 10), 1, gray(0x1E))
            ctx.fillRound(box(25.5, 80, 3, 10), 1, gray(0x1E))

            let sweep = lerp(30, 178, p)
            for i in 0..<40 {
                let x = 43 + Double(i) * 2.72
                let d = (x - sweep) / 13
                let env = exp(-d * d)
                let h = min(40, Self.heights[i] * (0.5 + 0.9 * env))
                let color = x < sweep ? gray(0xF2) : gray(0xB0)
                ctx.fillRound(box(x, 80, 1.6, h), 0.8, color)
            }
        }
    }
}

// MARK: 27 Squash Play (1.0 s)

struct SquashPlay: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 1.0)
            let c4 = cos(4 * Double.pi * u)
            let sq = pow((1 - c4) / 2, 1.6)          // 1 = squashed (0.25 s, 0.75 s)
            let sy = 1.05 - 0.38 * sq
            let sx = 1 + 0.3 * sq
            let w = 64 * sx
            let h = 60 * sy
            let base = 114.0
            let lift = 6 * (1 - 0.75 * sq)

            let edge = CGRect(x: 80 - w / 2, y: base - h, width: w, height: h)
            ctx.fillRound(edge, 16, gray(0x9A))
            let face = CGRect(x: 80 - w / 2, y: base - h - lift, width: w, height: h)
            ctx.fillRound(face, 16, gray(0xF0))

            let showPause = smooth((cos(2 * Double.pi * u) + 1) / 2)
            let centre = CGPoint(x: 80, y: base - h / 2 - lift)
            var c = ctx
            c.translateBy(x: centre.x, y: centre.y)
            c.scaleBy(x: sx, y: sy)
            if showPause > 0.01 {
                c.draw(symbol("pause.fill", 20, .bold, gray(0x1E).opacity(showPause)), at: .zero)
            }
            if showPause < 0.99 {
                c.draw(symbol("play.fill", 20, .bold, gray(0x1E).opacity(1 - showPause)), at: CGPoint(x: 2, y: 0))
            }
        }
    }
}

// MARK: 28 Rubber Search (12/7 s)

struct RubberSearch: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let period = 12.0 / 7.0
            let u = phase(t, period)
            var k = 1.0
            if u >= 1.0 && u < 1.25 {
                k = 1 - easeIn(seg(u, 1.0, 1.25))
            } else if u >= 1.25 && u < 1.5 {
                k = 0
            } else if u >= 1.5 {
                k = easeOutBack(seg(u, 1.5, period), 1.8)
            }
            let morphing = u >= 1.0 && u < 1.25 || u >= 1.5
            let bulge = morphing ? sin(Double.pi * clamp01(k)) : 0
            let w = 28 + 82 * k
            let h = 28 * (1 + 0.2 * bulge)
            let pill = box(80, 80, w * (1 - 0.06 * bulge), h)
            let solid = clamp01(1 - k)
            ctx.fill(Path(roundedRect: pill, cornerRadius: h / 2), with: .color(grayMix(0x3A, 0xF2, solid)))

            let iconX = 80 - pill.width / 2 + 14
            let iconColor = grayMix(0x9A, 0x1E, solid)
            ctx.draw(symbol("magnifyingglass", 12, solid > 0.5 ? .bold : .medium, iconColor),
                     at: CGPoint(x: iconX, y: 80))
            let textAlpha = clamp01((k - 0.7) / 0.3)
            if textAlpha > 0 {
                let txt = styled("Search", 12, .regular, gray(0x9A).opacity(textAlpha))
                ctx.draw(txt, at: CGPoint(x: iconX + 11, y: 80), anchor: .leading)
            }
        }
    }
}

// MARK: 29 Odometer (3.0 s)

struct Odometer: View {
    let t: Double

    private static let values: [Int] = [30, 42, 53, 42, 30, 19, 8, 19, 30]

    private func digit(_ ctx: GraphicsContext, _ d: Int, x: Double, y: Double) {
        let txt = Text("\(d)")
            .font(.system(size: 19, weight: .bold).monospacedDigit())
            .foregroundColor(gray(0xF2))
        ctx.draw(txt, at: CGPoint(x: x, y: y))
    }

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 3.0)
            let stepLen = 0.375
            let step = min(7, Int(u / stepLen))
            let local = u - Double(step) * stepLen
            let from = Self.values[step]
            let to = Self.values[step + 1]
            let up = to > from
            // Roll during the last 0.25 s of the step so each value lands on its keyframe.
            let p = easeOutBack(seg(local, stepLen - 0.25, stepLen), 1.2)
            let active = local > stepLen - 0.25

            ctx.fillRound(box(80, 80, 130, 40), 20, gray(0x1E))
            let plusFlash = up && active ? sin(Double.pi * seg(local, stepLen - 0.25, stepLen)) : 0
            let minusFlash = !up && active ? sin(Double.pi * seg(local, stepLen - 0.25, stepLen)) : 0
            ctx.fillCircle(35, 80, 14, grayMix(0x3A, 0x6E, minusFlash))
            ctx.fillCircle(125, 80, 14, grayMix(0x3A, 0x6E, plusFlash))
            ctx.draw(symbol("minus", 12, .semibold, gray(0xF2)), at: CGPoint(x: 35, y: 80))
            ctx.draw(symbol("plus", 12, .semibold, gray(0xF2)), at: CGPoint(x: 125, y: 80))

            var c = ctx
            c.clip(to: Path(box(80, 80, 40, 26)))
            let columns: [(Int, Int, Double)] = [(from / 10, to / 10, 74), (from % 10, to % 10, 86)]
            let travel = 24.0
            for col in columns {
                if col.0 == col.1 || !active {
                    digit(c, active ? col.1 : col.0, x: col.2, y: 80)
                } else {
                    let dir = up ? -1.0 : 1.0
                    digit(c, col.0, x: col.2, y: 80 + dir * travel * p)
                    digit(c, col.1, x: col.2, y: 80 - dir * travel * (1 - p))
                }
            }
        }
    }
}

// MARK: 30 Tide Progress (2.4 s)

struct TideProgress: View {
    let t: Double

    /// Fill level in percent: rises to 85 at 1.0 s, falls to 14 at 2.25 s.
    private func level(_ u: Double) -> Double {
        if u < 1.0 { return lerp(14, 85, smooth(seg(u, -0.15, 1.0))) }
        if u < 2.25 { return lerp(85, 14, smooth(seg(u, 1.0, 2.25))) }
        return lerp(14, 85, smooth(seg(u - 2.4, -0.15, 1.0)))
    }

    private func wave(top: Double, amp: Double, length: Double, shift: Double) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 36, y: 130))
        var x = 36.0
        while x <= 124 {
            let y = top + amp * sin(2 * Double.pi * x / length + shift)
            p.addLine(to: CGPoint(x: x, y: y))
            x += 4
        }
        p.addLine(to: CGPoint(x: 124, y: 130))
        p.closeSubpath()
        return p
    }

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 2.4)
            let pct = level(u)
            let top = 80 + 42 - 84 * pct / 100
            let scroll = 2 * Double.pi * 2 * u / 2.4
            let circle = Path(ellipseIn: box(80, 80, 84, 84))
            ctx.fill(circle, with: .color(gray(0x22)))

            var c = ctx
            c.clip(to: circle)
            let back = wave(top: top - 2, amp: 3, length: 36, shift: -scroll + 1)
            let front = wave(top: top, amp: 3, length: 42, shift: scroll)
            c.fill(back, with: .color(gray(0x5A)))
            c.fill(front, with: .color(gray(0xF2)))

            let label = "\(Int(pct.rounded()))%"
            let font = Font.system(size: 15, weight: .bold).monospacedDigit()
            ctx.draw(Text(label).font(font).foregroundColor(gray(0xF2)), at: CGPoint(x: 80, y: 80))
            var dark = c
            dark.clip(to: front)
            dark.draw(Text(label).font(font).foregroundColor(gray(0x1A)), at: CGPoint(x: 80, y: 80))
        }
    }
}
