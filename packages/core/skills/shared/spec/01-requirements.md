# Requirements Analysis for Spec Generation

## Core Principle

Requirements are hypotheses about what will solve a problem. Generate specs that address actual user needs, not imagined features.

## Before Generating the Spec

Think through these questions about the app prompt:

1. **Who** is the user? What's their context?
2. **What problem** does this app solve?
3. **What's the minimum** set of screens that solves the core problem?
4. **What's NOT needed** for a first version?

## Anti-Patterns to Avoid

### The Feature Transplant
Don't copy features from existing apps without understanding if they solve THIS user's problem. A todo app doesn't need social sharing, gamification, or AI suggestions unless the prompt asks for them.

### The Infinite Backlog
Don't generate screens for every possible feature. Focus on the core flow:
- What's the **one thing** the user must be able to do?
- What's the shortest path to that?
- What screens support that path?

### Solution-First Thinking
Don't let implementation drive the spec. "Needs a database" is not a requirement. "Tasks must persist across app launches" is.

### Premature Precision
Don't over-specify UI details that don't matter yet. Focus on:
- Screen count and purpose
- Core components per screen
- Navigation flow between screens
- Key interactions (tap, input, swipe)

## Spec Quality Checklist

- [ ] Every screen has a clear purpose (not "Settings" with nothing to configure)
- [ ] Navigation flow is logical (user can reach every screen)
- [ ] Component hierarchy reflects visual hierarchy
- [ ] Every interactive element has a unique testId
- [ ] Design tokens are consistent (not random colors per screen)
- [ ] No orphan screens (unreachable from navigation)
- [ ] Component count per screen is realistic (not 50 components on one screen)

## Screen Count Guidelines

| App Complexity | Screens | Example |
|---------------|---------|---------|
| Simple utility | 1-2 | Calculator, timer, converter |
| Single-purpose | 2-4 | Todo list, notes, weather |
| Multi-feature | 4-6 | Fitness tracker, recipe app |
| Full product | 6-10 | Social app, marketplace |

Err on the side of fewer screens. Each screen should earn its place.
