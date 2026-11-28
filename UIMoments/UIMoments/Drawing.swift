import SwiftUI

/// Centre of every tile's 160 x 160 art box.
let artCenter = CGPoint(x: 80, y: 80)

/// Rect of size w x h centred on (cx, cy).
@inline(__always) func box(_ cx: Double, _ cy: Double, _ w: Double, _ h: Double) -> CGRect {
    CGRect(x: cx - w / 2, y: cy - h / 2, width: w, height: h)
}

func styled(_ s: String, _ size: Double, _ weight: Font.Weight = .regular,
            _ color: Color, mono: Bool = false) -> Text {
    Text(s)
        .font(.system(size: size, weight: weight, design: mono ? .monospaced : .default))
        .foregroundColor(color)
}

func symbol(_ name: String, _ size: Double, _ weight: Font.Weight = .regular, _ color: Color) -> Text {
    Text(Image(systemName: name))
        .font(.system(size: size, weight: weight))
        .foregroundColor(color)
}

extension GraphicsContext {
    func fillRound(_ r: CGRect, _ radius: Double, _ color: Color) {
        fill(Path(roundedRect: r, cornerRadius: radius, style: .continuous), with: .color(color))
    }

    func strokeRound(_ r: CGRect, _ radius: Double, _ color: Color, _ width: Double) {
        stroke(Path(roundedRect: r, cornerRadius: radius, style: .continuous),
               with: .color(color), lineWidth: width)
    }

    func fillCircle(_ cx: Double, _ cy: Double, _ radius: Double, _ color: Color) {
        fill(Path(ellipseIn: box(cx, cy, radius * 2, radius * 2)), with: .color(color))
    }

    func strokeCircle(_ cx: Double, _ cy: Double, _ radius: Double, _ color: Color, _ width: Double) {
        stroke(Path(ellipseIn: box(cx, cy, radius * 2, radius * 2)), with: .color(color), lineWidth: width)
    }

    func line(_ a: CGPoint, _ b: CGPoint, _ color: Color, _ width: Double) {
        var p = Path()
        p.move(to: a)
        p.addLine(to: b)
        stroke(p, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round))
    }

    /// Draws text with its left edge at x and its first baseline at y.
    func text(_ t: Text, x: Double, baseline y: Double) {
        let r = resolve(t)
        let big = CGSize(width: 2000, height: 400)
        let b = r.firstBaseline(in: big)
        draw(r, at: CGPoint(x: x, y: y - b), anchor: .topLeading)
    }

    /// Draws text right-aligned to x with its first baseline at y.
    func textRight(_ t: Text, x: Double, baseline y: Double) {
        let r = resolve(t)
        let big = CGSize(width: 2000, height: 400)
        let b = r.firstBaseline(in: big)
        let w = r.measure(in: big).width
        draw(r, at: CGPoint(x: x - w, y: y - b), anchor: .topLeading)
    }
}
