import type { CodegenInput } from './types.js'

// ── Single structured prompt with layered discipline ──

export function buildLayeredPrompt(input: CodegenInput): string {
  const specJson = JSON.stringify(input.spec, null, 2)

  const uiTestsSection = input.uiTestContent?.length
    ? input.uiTestContent.map(t => `**${t.path}:**\n\`\`\`yaml\n${t.content}\n\`\`\``).join('\n\n')
    : ''

  const unitTestsSection = input.unitTestContent?.length
    ? input.unitTestContent.map(t => `**${t.path}:**\n\`\`\`\n${t.content}\n\`\`\``).join('\n\n')
    : ''

  return `You are a senior ${input.spec.platform} developer generating a complete app using a LAYERED ARCHITECTURE approach.

You will generate code in 3 layers, in order. Each layer builds on the previous. Output ALL files for ALL layers in a single response.

---

## STEP 1: Study the Design Image

${input.designImagePath ? `The attached image shows the EXACT screens to build. Study it carefully BEFORE writing any code.

Count the screens. Note every visual element:
- Tab bar items (how many tabs? what icons/labels?)
- Navigation structure (NavigationStack, drill-down, back buttons)
- Stat cards, badges, category labels with colors
- List items with their layout (checkbox, title, subtitle, category badge, priority flag, chevron)
- Form fields (text inputs, pickers, toggles, date/time selectors)
- Detail views (sections, notes, subtasks with progress)
- Settings screen (user profile, grouped settings rows with icons)
- Floating action buttons, search bars, section headers

DO NOT simplify. Reproduce EVERY screen and EVERY element from the design.` : 'No design image provided — follow the spec below.'}

---

## STEP 2: Review the Tests (your contract)

### UI Tests (Maestro) — every assertion must pass
${uiTestsSection || 'No UI tests provided.'}

### Unit Tests — must compile and pass
${unitTestsSection || 'No unit tests provided.'}

**Test rules:**
- For each \`assertVisible: id: "X"\` → your code MUST have \`.accessibilityIdentifier("X")\`
- For each \`tapOn: id: "X"\` → that element MUST be interactive (Button, NavigationLink, etc.)
- For each unit test calling \`SomeView()\` → that view MUST exist with a no-arg initializer

---

## STEP 3: Review the Structured Spec

${specJson}

---

## STEP 4: Generate Code — Layer by Layer

Generate files in this exact order:

### Layer A: Domain Models & Services
Files go in \`Sources/Models/\` and \`Sources/Services/\`.
- Create all data models needed by the screens (Identifiable, Hashable, Codable structs)
- Create service classes for data access (@MainActor classes)
- Do NOT name any type \`Task\` — use TodoItem, AppTask, etc. (shadows Swift.Task)
- All model structs must be Sendable (value types only)

### Layer B: Presentation — Views & Navigation
Files go in \`Sources/Views/\` and \`Sources/ContentView.swift\`.
- Match EVERY screen from the design image exactly
- Include ALL visual elements: stat cards, badges, category labels, icons, forms, toggles
- Use NavigationStack (NEVER NavigationView), TabView with Tab API
- Place \`.accessibilityIdentifier()\` on every component referenced in UI tests
- Views use \`@State private var viewModel = XxxViewModel()\` for data
- DO NOT use custom EnvironmentKey for ViewModels (crashes at runtime)

### Layer C: ViewModels — Connecting Views to Models
Files go in \`Sources/ViewModels/\`.
- Use \`@MainActor @Observable final class\` for all ViewModels
- ViewModels own the data and business logic
- Initialize with sample data matching the design (e.g., sample tasks shown in the mockup)
- Views bind to ViewModel properties

---

## Platform Rules
${input.spec.platform === 'swiftui' ? `- All files under Sources/ directory
- Do NOT create @main App entry point (auto-generated)
- Do NOT create project.yml, Info.plist, or .xcodeproj (managed by build pipeline)
- Use @MainActor @Observable (NOT ObservableObject/@Published)
- Use NavigationStack (NOT NavigationView)
- Use .foregroundStyle() (NOT .foregroundColor())
- Use .clipShape(.rect(cornerRadius:)) (NOT .cornerRadius())` : `- Files under src/ directory
- Use functional components with hooks
- Include testID props on all interactive components`}

${input.skillPrompt ? `## Code Quality Guidelines\n${input.skillPrompt}\n` : ''}
${input.baasAuthScreens ? `
## Auth Screens (DO NOT MODIFY WIRING)
Auth screens already exist at Sources/Auth/ (LoginView.swift, SignupView.swift, ResetPasswordView.swift, NewPasswordView.swift).
These screens have correct auth SDK wiring that MUST NOT be changed.

Your job for auth screens:
- Match their visual styling (colors, fonts, spacing, border radius) to the rest of the app's design
- You may adjust layout, padding, font sizes, and colors
- Do NOT change: any AuthManager method calls, auth state observation, NavigationLink targets, error handling logic, or deep link handling
- Do NOT add new auth-related imports or remove existing ones
` : ''}
${input.baasContext?.schema ? `
## BaaS Data Layer

DataService classes have been pre-generated at Sources/Services/. Each DataService wraps a repository protocol with @Observable loading/error state.

Rules:
- Do NOT generate Sources/AppEntry.swift — it is pre-generated
- Do NOT generate Sources/Repositories/ files — they are pre-generated
- Do NOT generate Sources/Services/ files — they are pre-generated
- In EACH ViewModel that displays or modifies data, add ONE @State private var [entity]Service = [Entity]DataService()
- Call service.loadAll() in .task { } and service.create() / service.delete() for mutations
- Import ONLY from repository protocol types — NEVER import FirebaseFirestore, Supabase, or any BaaS SDK directly
- Available DataServices: ${input.baasContext.schema.entities.map(e => `${e.name}DataService`).join(', ')}
- Inferred entities: ${input.baasContext.schema.entities.map(e => e.name).join(', ')}
` : ''}
${input.modificationPlan && input.modificationPlan.items.length > 0 ? `
## Modification Plan (files you MUST modify)

The following EXISTING files must be changed to integrate the new feature. Output the complete modified file using the same ===FILE: path=== / ===END_FILE=== format.

DO NOT modify any files not listed here unless they import from a modified file.

${input.modificationPlan.items.map(item => {
  const lang = item.filePath.endsWith('.swift') ? 'swift'
    : item.filePath.endsWith('.kt') ? 'kotlin' : ''
  return `### ${item.screenName} (${item.changeType})
**Change:** ${item.changeDescription}
**File path:** ${item.filePath}

\`\`\`${lang}
${item.fileContent}
\`\`\``
}).join('\n\n')}
` : ''}
## Output Format
Output EVERY file using this delimiter format:

===FILE: Sources/Models/TodoItem.swift===
import Foundation
// ... complete file ...
===END_FILE===

===FILE: Sources/Services/TodoService.swift===
// ... complete file ...
===END_FILE===

===FILE: Sources/Views/TaskListView.swift===
import SwiftUI
// ... complete file ...
===END_FILE===

===FILE: Sources/ViewModels/TaskListViewModel.swift===
// ... complete file ...
===END_FILE===

===FILE: Sources/ContentView.swift===
import SwiftUI
// ... complete file ...
===END_FILE===

Generate ALL files for a complete, compilable app. Every screen from the design must be implemented.`
}
