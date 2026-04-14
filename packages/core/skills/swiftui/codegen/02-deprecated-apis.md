# Deprecated → Modern API Replacements (iOS 17+)

NEVER use the deprecated column. Always use the modern replacement.

| Deprecated | Modern | Notes |
|-----------|--------|-------|
| `foregroundColor()` | `foregroundStyle()` | Accepts `ShapeStyle`, not just `Color` |
| `cornerRadius()` | `clipShape(.rect(cornerRadius:))` | More flexible clipping |
| `NavigationView` | `NavigationStack` / `NavigationSplitView` | |
| `ObservableObject` / `@Published` | `@Observable` | Automatic tracking |
| `@StateObject` | `@State` (with `@Observable`) | |
| `@ObservedObject` | Pass directly or `@Bindable` | |
| `@EnvironmentObject` | `@Environment(MyType.self)` | |
| `onChange(of:) { newValue in }` | `onChange(of:) { old, new in }` | |
| `GeometryReader` (for sizing) | `containerRelativeFrame()` | GeometryReader OK for complex layouts |
| `AnyView` | `@ViewBuilder` or generics | Preserves structural identity |
| `NavigationLink(destination:)` | `navigationDestination(for:)` | Data-driven navigation |
| `PreviewProvider` | `#Preview` macro | Simpler syntax |
| `animation(_:)` (no value) | `.animation(.bouncy, value: score)` | Must bind to value |
| `.navigationBarLeading` | `.topBarLeading` | |
| `.navigationBarTrailing` | `.topBarTrailing` | |
