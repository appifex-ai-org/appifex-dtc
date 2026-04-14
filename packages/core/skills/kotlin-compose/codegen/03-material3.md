# Material Design 3 Theming

## Theme Setup

Every app needs `ui/theme/Theme.kt`:

```kotlin
@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> darkColorScheme(/* custom colors */)
        else -> lightColorScheme(/* custom colors */)
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        content = content
    )
}
```

## Color System

Define in `ui/theme/Color.kt`:
```kotlin
// Use the exact colors from the design mockup
val PrimaryColor = Color(0xFF6750A4)
val SecondaryColor = Color(0xFF625B71)
val TertiaryColor = Color(0xFF7D5260)

val LightColorScheme = lightColorScheme(
    primary = PrimaryColor,
    secondary = SecondaryColor,
    tertiary = TertiaryColor,
)
```

Access via: `MaterialTheme.colorScheme.primary`

## Typography

Define in `ui/theme/Type.kt`:
```kotlin
val AppTypography = Typography(
    displayLarge = TextStyle(fontSize = 57.sp, lineHeight = 64.sp),
    headlineMedium = TextStyle(fontSize = 28.sp, lineHeight = 36.sp),
    titleLarge = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
)
```

Access via: `MaterialTheme.typography.titleLarge`

## Component Conventions

- Use `Card` / `ElevatedCard` / `OutlinedCard` for content containers
- Use `FilledTonalButton` for secondary actions, `OutlinedButton` for tertiary
- Use `FloatingActionButton` for the primary screen action
- Use `TopAppBar` with `scrollBehavior` for collapsing headers
- Use `ModalBottomSheet` for bottom sheets (not Dialog)
- Icons: `Icons.Default.*` or `Icons.Outlined.*` from Material Symbols
