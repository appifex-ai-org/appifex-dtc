# Common Kotlin/Compose Errors

## Methodology

1. Read ALL errors — they cascade, fix the root cause first
2. Group errors by file
3. Fix import errors first (they cause most other errors)
4. Rebuild after each fix batch

## Error Patterns

### Unresolved reference
**Error:** `Unresolved reference: Column`
**Fix:** Add missing import: `import androidx.compose.foundation.layout.Column`

Common missing imports:
- `Column`, `Row`, `Box`, `Spacer` → `androidx.compose.foundation.layout.*`
- `Text`, `Button`, `Card` → `androidx.compose.material3.*`
- `Icon`, `Icons` → `androidx.compose.material.icons.*`
- `Modifier` → `androidx.compose.ui.Modifier`
- `remember`, `mutableStateOf` → `androidx.compose.runtime.*`
- `NavHost`, `composable` → `androidx.navigation.compose.*`
- `testTag` → `androidx.compose.ui.platform.testTag`
- `collectAsStateWithLifecycle` → `androidx.lifecycle.compose.collectAsStateWithLifecycle`

### Type mismatch
**Error:** `Type mismatch: inferred type is Unit but Composable was expected`
**Fix:** The last expression in a `@Composable` lambda must be a composable call, not `Unit`. Remove stray `println()` or `return` statements.

### @Composable invocations can only happen from the context of a @Composable function
**Fix:** Move the composable call inside a `@Composable` function. Never call composables from `onClick`, `LaunchedEffect` block's non-composable parts, or regular functions.

### Val cannot be reassigned
**Error:** `Val cannot be reassigned`
**Fix:** Use `var` with `mutableStateOf` for local state:
```kotlin
var text by remember { mutableStateOf("") }
```

### None of the following candidates is applicable
**Error on TextField/OutlinedTextField**
**Fix:** OutlinedTextField requires named parameters:
```kotlin
OutlinedTextField(value = text, onValueChange = { text = it })
```

### Cannot access class 'X': it is internal
**Fix:** Make the class or function `public` (or remove `internal` modifier).

### Suspend function can only be called from a coroutine
**Fix:** Use `LaunchedEffect` or `viewModelScope.launch`:
```kotlin
// In Composable:
LaunchedEffect(Unit) { viewModel.loadData() }

// In ViewModel:
fun loadData() { viewModelScope.launch { /* suspend calls */ } }
```

## Gradle Build Errors

### Could not resolve dependency
**Fix:** Check `build.gradle.kts` dependencies. Ensure Compose BOM is used:
```kotlin
implementation(platform("androidx.compose:compose-bom:2025.01.01"))
```

### Execution failed for task ':app:compileDebugKotlin'
**Fix:** Read the full error output — usually a Kotlin compiler error. Check for:
- Missing `@Composable` annotation
- Wrong function signature
- Missing imports
