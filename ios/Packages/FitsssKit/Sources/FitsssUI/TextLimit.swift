import FitsssCore
import SwiftUI

public extension View {
    /// Keeps `text` within `limit` UTF-16 units (how the server's limits
    /// count, see `String.prefix(serverLimit:)`), cutting whatever is typed or
    /// pasted past it. Attach to the field that edits `text`.
    ///
    /// The cut happens on the next main-actor turn, not inside `onChange`:
    /// when fast typing coalesces keystrokes, a value written back during the
    /// same update can equal what the field last rendered, so the field keeps
    /// showing the extra characters while the state holds fewer.
    func textLimit(_ text: Binding<String>, _ limit: Int) -> some View {
        onChange(of: text.wrappedValue) { _, value in
            guard value.serverLength > limit else { return }
            Task { @MainActor in
                let current = text.wrappedValue
                if current.serverLength > limit { text.wrappedValue = current.prefix(serverLimit: limit) }
            }
        }
    }
}
