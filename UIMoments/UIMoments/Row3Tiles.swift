import SwiftUI

// Row 3: 13 Jelly Pad · 14 Swipe Confirm · 15 Bookmark · 16 Depth Stack · 17 Menu Morph · 18 Elastic String

struct Row3Art: View {
    let column: Int
    let t: Double

    var body: some View {
        switch column {
        case 0: JellyPad(t: t)
        case 1: SwipeConfirm(t: t)
        case 2: BookmarkButton(t: t)
        case 3: DepthStack(t: t)
        case 4: MenuMorph(t: t)
        default: ElasticString(t: t)
        }
    }
}

// MARK: 13 Jelly Pad (2.0 s)

struct JellyPad: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            // Landings (squash) at 0.75 s and 1.75 s; one hop per second in between.
            let shifted = t + 0.25
            let s = phase(shifted, 1.0)
            let leftHop = cycle(shifted, 1.0) % 2 == 0
            let ground = 112.0

            let land = seg(s, 0, 0.3)
            let recover = spring(land, damping: 5.5, bounces: 1.3)
            var sx = 1 + 0.5 * (1 - recover)
            var sy = 1 - 0.5 * (1 - recover)
            let air = seg(s, 0.3, 1.0)
            let height = 38 * 4 * air * (1 - air)
            if s >= 0.3 {
                let stretch = 0.08 * sin(Double.pi * air)
                sx = 1 - stretch
                sy = 1 + stretch
            }
            let tilt = (leftHop ? -1.0 : 1.0) * 14 * sin(Double.pi * air)

            // Shadow
            let shadowW = 54 * sx * (1 - height / 90)
            var sh = ctx
            sh.addFilter(.blur(radius: 3))
            sh.fill(Path(ellipseIn: box(80, ground + 4, shadowW, 8)), with: .color(Color.black.opacity(0.85)))

            var c = ctx
            c.translateBy(x: 80, y: ground - height)
            c.rotate(by: .degrees(tilt))
            let w = 48 * sx
            let h = 48 * sy
            let rect = CGRect(x: -w / 2, y: -h, width: w, height: h)
            let path = Path(roundedRect: rect, cornerRadius: 14 * min(sx, sy) + 2, style: .continuous)
            let grad = Gradient(colors: [gray(0xFF), gray(0xE8), gray(0xBE)])
            c.fill(path, with: .linearGradient(grad, startPoint: CGPoint(x: 0, y: -h), endPoint: CGPoint(x: 0, y: 0)))
            let shine = CGRect(x: -w / 2 + 8, y: -h + 5, width: w - 16, height: h * 0.22)
            c.fill(Path(roundedRect: shine, cornerRadius: h * 0.11), with: .color(Color.white.opacity(0.55)))
        }
    }
}

// MARK: 14 Swipe Confirm (12/9 s)

struct SwipeConfirm: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 12.0 / 9.0)
            let left = 80.0 - 75 + 14
            let right = 80.0 + 75 - 14
            let slide = easeInOut(seg(u, 0.12, 0.72))
            let back = easeOutBack(seg(u, 1.08, 1.26), 1.1)
            let p = slide * (1 - back)
            let x = lerp(left, right, p)

            ctx.fillRound(box(80, 80, 150, 28), 14, gray(0x2A))
            let chev = styled("›››", 16, .semibold, gray(0x4E).opacity(1 - p))
            ctx.draw(chev, at: CGPoint(x: 92, y: 79))
            let fill = CGRect(x: 5, y: 66, width: x - 5 + 14, height: 28)
            ctx.fill(Path(roundedRect: fill, cornerRadius: 14), with: .color(gray(0x8A)))

            ctx.fillCircle(x, 80, 12, gray(0xF2))
            let done = seg(u, 0.72, 0.84) * (1 - seg(u, 1.06, 1.12))
            let pop = 0.6 + 0.4 * spring(seg(u, 0.72, 0.95), damping: 5, bounces: 1.2)
            if done < 1 {
                ctx.draw(symbol("arrow.right", 11, .bold, gray(0x1E).opacity(1 - done)), at: CGPoint(x: x, y: 80))
            }
            if done > 0 {
                var c = ctx
                c.translateBy(x: x, y: 80)
                c.scaleBy(x: pop, y: pop)
                c.draw(symbol("checkmark", 11, .bold, gray(0x1E).opacity(done)), at: .zero)
            }
        }
    }
}

// MARK: 15 Bookmark (2.4 s)

struct BookmarkButton: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 2.4)
            let filled = u >= 0.3 && u < 1.5
            let popIn = seg(u, 0.3, 0.75)
            let popOut = seg(u, 1.5, 1.85)
            var scale = 1.0
            if filled {
                let a = min(1, popIn * 2.5)
                scale = 1 + 0.15 * sin(Double.pi * a) - 0.03 * sin(Double.pi * seg(popIn, 0.4, 0.8))
            } else if u >= 1.5 {
                scale = 1 - 0.08 * sin(Double.pi * popOut)
            }
            let lighten = easeInOut(seg(u, 0.3, 0.45)) * (1 - easeInOut(seg(u, 1.5, 1.7)))
            ctx.fillRound(box(80, 80, 50 * scale, 50 * scale), 12 * scale, grayMix(0x2F, 0x3A, lighten))
            var c = ctx
            c.translateBy(x: 80, y: 80)
            c.scaleBy(x: scale, y: scale)
            c.draw(symbol(filled ? "bookmark.fill" : "bookmark", 20, .regular, gray(0xF2)), at: .zero)
        }
    }
}

// MARK: 16 Depth Stack (1.5 s)

struct DepthStack: View {
    let t: Double

    /// Pose for a depth 0 (front) ... 2 (back).
    private func pose(_ d: Double) -> (dx: Double, dy: Double, s: Double, shade: Double) {
        let dx = d <= 1 ? lerp(0, 14, d) : lerp(14, -14, d - 1)
        let dy = lerp(12, -12, d / 2)
        let s = lerp(1.0, 0.74, d / 2)
        let shade = lerp(0xDA, 0x5A, d / 2)
        return (dx, dy, s, shade)
    }

    private func drawCard(_ ctx: GraphicsContext, depth d: Double, sideways: Double) {
        let p = pose(d)
        var c = ctx
        c.translateBy(x: 80 + p.dx + sideways, y: 80 + p.dy)
        c.scaleBy(x: p.s, y: p.s)
        let shade = Int(p.shade)
        c.fillRound(box(0, 0, 60, 44), 6, gray(shade))
        c.strokeRound(box(0, 0, 60, 44), 6, gray(0x0F).opacity(0.35), 1)
        c.fillRound(CGRect(x: -25, y: -17, width: 22, height: 20), 3, gray(max(0x22, shade - 0x50)))
        c.fillRound(CGRect(x: 1, y: -15, width: 23, height: 3.5), 1.75, gray(max(0x22, shade - 0x38)))
        c.fillRound(CGRect(x: 1, y: -8, width: 16, height: 3.5), 1.75, gray(max(0x22, shade - 0x30)))
        c.fillRound(CGRect(x: -25, y: 8, width: 40, height: 3.5), 1.75, gray(max(0x22, shade - 0x30)))
    }

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 1.5)
            let p = easeInOut(seg(u, 0.0, 0.7))
            // Front card goes to the back (swinging out right), the others move forward.
            let frontD = 2 * p
            let midD = 1 - p
            let backD = 2 - p
            let swing = 38 * sin(Double.pi * p)
            let frontOnTop = p < 0.5
            drawCard(ctx, depth: backD, sideways: 0)
            if !frontOnTop { drawCard(ctx, depth: frontD, sideways: swing) }
            drawCard(ctx, depth: midD, sideways: 0)
            if frontOnTop { drawCard(ctx, depth: frontD, sideways: swing) }
        }
    }
}

// MARK: 17 Menu Morph (12/9 s)

struct MenuMorph: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 12.0 / 9.0)
            let half = 12.0 / 18.0
            let toX = easeInOut(seg(u, 0, 0.3))
            let toBurger = easeInOut(seg(u, half, half + 0.3))
            let m = toX * (1 - toBurger)
            let local = u < half ? u : u - half
            let rot = 10 * wobble(seg(local, 0, 0.62), damping: 3.6, cycles: 1.6)

            var c = ctx
            c.translateBy(x: 80, y: 80)
            c.rotate(by: .degrees(rot))
            c.fillRound(box(0, 0, 56, 56), 14, grayMix(0x33, 0x6A, m))

            let gap = 7.0 * (1 - m)
            let angle = 45.0 * m
            for sign in [-1.0, 1.0] {
                var l = c
                l.translateBy(x: 0, y: sign * gap)
                l.rotate(by: .degrees(-sign * angle))
                l.fillRound(box(0, 0, 24, 3), 1.5, gray(0xF2))
            }
            let midW = 24 * (1 - m)
            if midW > 0.5 {
                c.fillRound(box(0, 0, midW, 3), 1.5, gray(0xF2).opacity(1 - m))
            }
        }
    }
}

// MARK: 18 Elastic String (12/9 s)

struct ElasticString: View {
    let t: Double

    var body: some View {
        Canvas { ctx, _ in
            let u = phase(t, 12.0 / 9.0)
            // Plucked: fundamental + second harmonic, both damped.
            let a1 = 24 * exp(-3.2 * u) * cos(2 * Double.pi * 2.6 * u)
            let a2 = 9 * exp(-4.5 * u) * sin(2 * Double.pi * 4.1 * u)
            let x0 = 10.0
            let x1 = 150.0
            var path = Path()
            let n = 36
            for i in 0...n {
                let s = Double(i) / Double(n)
                let y = 80 - a1 * sin(Double.pi * s) - a2 * sin(2 * Double.pi * s)
                let pt = CGPoint(x: lerp(x0, x1, s), y: y)
                if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
            }
            ctx.stroke(path, with: .color(gray(0xF2)), style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
            ctx.fillCircle(x0, 80, 3, gray(0xF2))
            ctx.fillCircle(x1, 80, 3, gray(0xF2))
        }
    }
}
