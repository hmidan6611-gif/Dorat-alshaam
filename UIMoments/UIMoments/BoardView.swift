import SwiftUI

/// The 1080 x 1350 board, laid out in real points (design * scale) so the
/// tiles' matched-geometry frames are true screen frames.
struct BoardView: View {
    let t: Double
    let scale: Double
    let selected: Int?
    let hero: Namespace.ID
    let onTitle: () -> Void
    let onTile: (Int) -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            BoardChrome(t: t, onTitle: onTitle)
                .frame(width: Board.width, height: Board.height)
                .scaleEffect(scale, anchor: .topLeading)
                .frame(width: Board.width * scale, height: Board.height * scale, alignment: .topLeading)

            ForEach(0..<36, id: \.self) { index in
                tileSlot(index)
            }
        }
        .frame(width: Board.width * scale, height: Board.height * scale, alignment: .topLeading)
    }

    @ViewBuilder
    private func tileSlot(_ index: Int) -> some View {
        let o = Board.tileOrigin(index)
        let w = Board.tileW * scale
        let h = Board.tileH * scale
        let cx = (o.x + Board.tileW / 2) * scale
        let cy = (o.y + Board.tileH / 2) * scale
        if selected == index {
            Color.clear
                .frame(width: w, height: h)
                .position(x: cx, y: cy)
        } else {
            TileView(index: index, t: t)
                .frame(width: Board.tileW, height: Board.tileH)
                .scaleEffect(scale, anchor: .topLeading)
                .frame(width: w, height: h, alignment: .topLeading)
                .background(TileBackground(cornerRadius: 10 * scale, lineWidth: 1.5 * scale))
                .matchedGeometryEffect(id: index, in: hero)
                .contentShape(Rectangle())
                .onTapGesture { onTile(index) }
                .position(x: cx, y: cy)
        }
    }
}

struct TileBackground: View {
    let cornerRadius: Double
    let lineWidth: Double

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Palette.tile)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(Palette.tileBorder, lineWidth: lineWidth)
            )
    }
}

/// One tile's content in design units (161 x 186): number, art, label.
struct TileView: View {
    let index: Int
    let t: Double

    var body: some View {
        ZStack(alignment: .topLeading) {
            TileArt(index: index, t: t)
                .frame(width: 160, height: 160)
                .offset(x: 0.5, y: 0)
            TileText(index: index)
        }
        .frame(width: Board.tileW, height: Board.tileH, alignment: .topLeading)
        .clipped()
    }
}

/// Static tile text; it does not depend on the clock so SwiftUI never redraws it.
struct TileText: View, Equatable {
    let index: Int

    var body: some View {
        ZStack(alignment: .topLeading) {
            // SF ascender is ~0.95 em: offset the top so the baseline lands on y+18.
            Text(Catalog.number(index))
                .font(.system(size: 13, weight: .regular, design: .monospaced))
                .foregroundColor(Palette.number)
                .offset(x: 12, y: 18 - 13 * 0.95)
            Text(Catalog.tiles[index].name)
                .font(.system(size: 18, weight: .regular))
                .foregroundColor(Palette.label)
                .lineLimit(1)
                .frame(width: Board.tileW)
                .offset(x: 0, y: 170 - 18 * 0.95)
        }
    }
}

/// Header, footer and the 12-second progress line, in design units.
struct BoardChrome: View {
    let t: Double
    let onTitle: () -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
                drawHeader(ctx)
                drawFooter(ctx)
            }
            // Tap target over "UI Moments": restarts the whole board in sync.
            Color.clear
                .frame(width: 240, height: 64)
                .contentShape(Rectangle())
                .offset(x: 25, y: 26)
                .onTapGesture { onTitle() }
        }
    }

    private func drawHeader(_ ctx: GraphicsContext) {
        let title = Text("UI Moments")
            .font(.system(size: 46, weight: .bold))
            .tracking(-1.2)
            .foregroundColor(gray(0xFF))
        ctx.text(title, x: 33, baseline: 72)

        let sub = Text("36 Animations · 6 × 6")
            .font(.system(size: 29, weight: .regular))
            .tracking(1.5)
            .foregroundColor(gray(0xE6))
        ctx.text(sub, x: 283, baseline: 72)

        let micro = Text("MICRO INTERACTIONS  ")
            .font(.system(size: 14, weight: .medium))
            .tracking(2.5)
            .foregroundColor(gray(0x6E))
        let num = Text("04")
            .font(.system(size: 14, weight: .medium))
            .tracking(2.5)
            .foregroundColor(gray(0xD0))
        ctx.textRight(micro + num, x: 1047 + 2.5, baseline: 72)
    }

    private func drawFooter(_ ctx: GraphicsContext) {
        let left = styled("Tap any tile to open it", 13, .regular, gray(0x8F))
        ctx.text(left, x: 33, baseline: 1318)
        let right = styled("12 s loop · 36 / 36", 13, .regular, gray(0x8F))
        ctx.textRight(right, x: 1047, baseline: 1318)

        let p = phase(t, Board.loop) / Board.loop
        let track = CGRect(x: 29, y: 1335, width: 1022, height: 2)
        ctx.fill(Path(track), with: .color(gray(0x1E)))
        let fill = CGRect(x: 29, y: 1335, width: 1022 * p, height: 2)
        ctx.fill(Path(fill), with: .color(gray(0x84)))
    }
}

/// Dispatches a tile index to its animation, one row (file) at a time.
struct TileArt: View {
    let index: Int
    let t: Double

    var body: some View {
        switch index / 6 {
        case 0: Row1Art(column: index % 6, t: t)
        case 1: Row2Art(column: index % 6, t: t)
        case 2: Row3Art(column: index % 6, t: t)
        case 3: Row4Art(column: index % 6, t: t)
        case 4: Row5Art(column: index % 6, t: t)
        default: Row6Art(column: index % 6, t: t)
        }
    }
}
