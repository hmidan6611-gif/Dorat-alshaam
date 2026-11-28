import SwiftUI

@main
struct UIMomentsApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .statusBarHidden(false)
        }
    }
}
