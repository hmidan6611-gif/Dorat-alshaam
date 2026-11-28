import SwiftUI

/// Full-screen card for one tile. Zooms out of its board tile with
/// matchedGeometryEffect and keeps reading the shared clock.
struct OpenTileView: View {
    let index: Int
    let t: Double
    let boardScale: Double
    let screen: CGSize
    let hero: Namespace.ID
    let onClose: () -> Void
    let onMove: (Int) -> Void

    @State private var dragX: Double = 0

    private var cardSize: CGSize {
        let w = min(screen.width - 32, 520)
        let h = min(screen.height - 180, w * 1.45)
        return CGSize(width: w, height: h)
    }

    var body: some View {
        ZStack {
            Palette.background
                .transition(.opacity)
                .onTapGesture { onClose() }

            card
                .frame(width: cardSize.width, height: cardSize.height)
                .matchedGeometryEffect(id: index, in: hero)
                .offset(x: dragX)
                .contentShape(Rectangle())
                .onTapGesture { onClose() }
                .gesture(swipe)
        }
        .frame(width: screen.width, height: screen.height)
    }

    private var card: some View {
        GeometryReader { geo in
            // Content is laid out for the final card and scaled with the live
            // matched-geometry frame, so it grows smoothly out of the tile.
            let target = cardSize
            let k = min(geo.size.width / target.width, geo.size.height / target.height)
            OpenCardContent(index: index, t: t, size: target, artScale: artScale(target))
                .frame(width: target.width, height: target.height)
                .scaleEffect(k)
                .frame(width: geo.size.width, height: geo.size.height)
        }
        .background(TileBackground(cornerRadius: 22, lineWidth: 1.5))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    /// The animation is drawn 3x larger than on the board (clamped to fit the card).
    private func artScale(_ size: CGSize) -> Double {
        let fit = min(size.width * 0.9, size.height - 150) / 160
        return min(max(3 * boardScale, 1), fit)
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 18)
            .onChanged { v in dragX = v.translation.width * 0.6 }
            .onEnded { v in
                let dx = v.translation.width
                if dx < -60 {
                    onMove(1)
                } else if dx > 60 {
                    onMove(-1)
                }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { dragX = 0 }
            }
    }
}

struct OpenCardContent: View {
    let index: Int
    let t: Double
    let size: CGSize
    let artScale: Double

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 6) {
                Text(Catalog.number(index))
                    .font(.system(size: 15, weight: .regular, design: .monospaced))
                    .foregroundColor(Palette.number)
                Text(Catalog.tiles[index].name)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(gray(0xF2))
            }
            .padding(.leading, 22)
            .padding(.top, 22)

            TileArt(index: index, t: t)
                .frame(width: 160, height: 160)
                .scaleEffect(artScale)
                .frame(width: size.width, height: size.height)
                .offset(y: 24)

            HStack {
                Text("Tap to close")
                Spacer()
                Text(periodText)
            }
            .font(.system(size: 13))
            .foregroundColor(gray(0x8F))
            .padding(.horizontal, 22)
            .padding(.bottom, 20)
            .frame(width: size.width, height: size.height, alignment: .bottom)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
    }

    private var periodText: String {
        let p = Catalog.tiles[index].period
        return String(format: "%.2f s loop · ‹ swipe ›", p)
    }
}
