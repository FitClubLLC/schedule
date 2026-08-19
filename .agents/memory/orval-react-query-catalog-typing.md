---
name: Orval React Query catalog typing
description: Why generated React Query hooks need a post-generation type adjustment in this workspace.
---

When `@tanstack/react-query` is declared through the workspace `catalog:`, Orval cannot infer React Query v5 from the package manifest. It emits v4-style required `UseQueryOptions` inputs, which makes normal caller overrides such as `enabled` incorrectly require a `queryKey`.

**Why:** Configuring Orval as v5 fixes the input types but also changes its emitted hook runtime to accept an optional `QueryClient`. The Client Dashboard preserves its existing generated hook behavior, so this is too broad for a type-only repair.

**How to apply:** Keep the API client generator hook that rewrites only generated caller option annotations to `Partial<UseQueryOptions<...>>` after Orval writes the React client. Regenerate the React client to verify the hook runs, then check the shared libraries and affected consumers. Do not use `query.version: 5` solely to solve this typing issue unless its generated runtime changes are intentionally accepted.