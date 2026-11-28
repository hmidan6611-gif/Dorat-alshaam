import SwiftUI

/// Owns the ONE shared clock. Every tile, the progress line and the open card
/// read `t` (seconds since the board first appeared) from this TimelineView.
struct RootView: View {
    @State private var start = Date()
    @State private var selected: Int? = nil
    @Namespace private var hero

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation) { timeline in
                let t = max(0, timeline.date.timeIntervalSince(start))
                content(t: t, size: geo.size)
            }
        }
        .background(Palette.background)
        .ignoresSafeArea()
    }

    @ViewBuilder
    private func content(t: Double, size: CGSize) -> some View {
        let scale = size.width / Board.width
        ZStack {
            Palette.background
            BoardView(t: t, scale: scale, selected: selected, hero: hero,
                      onTitle: restart, onTile: open)
                .frame(width: size.width, height: Board.height * scale)
                .position(x: size.width / 2, y: size.height / 2)

            if let index = selected {
                OpenTileView(index: index, t: t, boardScale: scale, screen: size,
                             hero: hero, onClose: close, onMove: move)
                    .zIndex(10)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private func restart() {
        start = Date()
    }

    private func open(_ index: Int) {
        withAnimation(.spring(response: 0.45, dampingFraction: 0.86)) {
            selected = index
        }
    }

    private func close() {
        withAnimation(.spring(response: 0.42, dampingFraction: 0.9)) {
            selected = nil
        }
    }

    /// Swipe on the open card: step to previous / next tile without zooming.
    private func move(_ delta: Int) {
        guard let index = selected else { return }
        var tx = Transaction()
        tx.disablesAnimations = true
        withTransaction(tx) {
            selected = (index + delta + 36) % 36
        }
    }
}
