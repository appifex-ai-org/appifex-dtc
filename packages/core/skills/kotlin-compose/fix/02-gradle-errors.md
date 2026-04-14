# Gradle Build Errors

## Dependency Resolution

### Version conflict
**Error:** `Duplicate class found in modules`
**Fix:** Use Compose BOM to align all Compose versions:
```kotlin
implementation(platform("androidx.compose:compose-bom:2025.01.01"))
implementation("androidx.compose.material3:material3")  // no version needed
```

### Missing dependency
**Error:** `Unresolved reference: collectAsStateWithLifecycle`
**Fix:** Add lifecycle-compose dependency:
```kotlin
implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.0")
```

### Navigation type-safe routes
**Error:** `Cannot find a @Navigator or @Serializable`
**Fix:** Ensure `kotlinx-serialization` plugin is applied:
```kotlin
// build.gradle.kts
plugins {
    id("org.jetbrains.kotlin.plugin.serialization")
}
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.0")
}
```

## Build Configuration

### JVM target mismatch
**Error:** `'compileDebugJavaWithJavac' task uses JDK 17 but 'compileDebugKotlin' uses JDK 11`
**Fix:** Align both in `build.gradle.kts`:
```kotlin
kotlinOptions { jvmTarget = "17" }
compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}
```

### Compose compiler not found
**Error:** `This version of the Compose Compiler requires Kotlin 2.x`
**Fix:** Use the Compose Compiler Gradle plugin (Kotlin 2.0+):
```kotlin
plugins {
    id("org.jetbrains.kotlin.plugin.compose")
}
```
Do NOT set `composeOptions { kotlinCompilerExtensionVersion = ... }` — the plugin handles it.

## Runtime Errors

### App crashes on launch
Check `adb logcat -s "AndroidRuntime"` for the stack trace. Common causes:
- Missing `@Composable` on a function called from `setContent`
- Null pointer from uninitialized ViewModel state
- Missing permission in AndroidManifest.xml

### Tests fail with "No compose hierarchies found"
**Fix:** Ensure the test uses `createComposeRule()` and calls `setContent`:
```kotlin
@get:Rule
val composeTestRule = createComposeRule()

@Test
fun test() {
    composeTestRule.setContent { MyScreen() }
    composeTestRule.onNodeWithTag("tag").assertExists()
}
```
