# Veritas Plugin Architecture

## Goal

Move Veritas to an open-core architecture where:

- the core investigation platform remains public
- optional capabilities can be packaged as first-party plugins
- sensitive capabilities such as `MAGI` can live in private packages outside the public repo
- the UI renders plugin contributions through explicit slots instead of hardcoded feature branches

This is not a marketplace design. It is an internal first-party plugin system for public and private Veritas modules.

## Design Principles

1. Core owns the investigation platform.
2. Plugins own optional intelligence capabilities.
3. A plugin can contribute backend behavior, UI surfaces, or both.
4. UI contributions must target explicit slots.
5. Sensitive features are kept private by keeping implementation code out of the public repo.
6. Entitlements still matter, but they are not the secrecy boundary for open source.

## What Stays Core

These should remain part of the public core:

- investigations, scans, and jobs
- evidence seeds and evidence persistence
- actors, entities, narratives, timelines, and dossiers
- base ingestion infrastructure
- base analysis orchestration
- world event infrastructure
- plugin manifest types
- plugin registry and loader
- frontend plugin slots and capability plumbing

If removing a feature makes Veritas stop functioning as an investigation platform, it likely belongs in core.

## What Becomes Plugins

A feature should become a plugin when it is:

- optional
- sensitive
- domain-specific
- independently evolvable
- expensive enough to justify modular ownership

Examples:

- Private plugins
  - MAGI Profiles
  - high-risk behavioral or social-engineering analysis
  - private operator workflows
- Public first-party plugins
  - ATLAS Lenses
  - advanced on-chain correlation
  - domain-specific claim packs
  - specialized connector packs
  - specialized visualizations

## Plugin Contract

Each plugin should declare a manifest with:

- `id`
- `name`
- `version`
- `kind`
  - `core`
  - `public-plugin`
  - `private-plugin`
- `status`
  - `installed`
  - `not-installed`
  - `disabled`
- `capabilities`
- backend contribution metadata
- frontend contribution metadata
- extension slots it uses

The manifest is metadata only. It does not itself load code. The runtime loader uses the manifest to decide what to wire.

## UI Slot Model

Plugins do not inject arbitrary UI. They contribute to named slots.

Initial slot set:

- `top-nav`
- `page-route`
- `results-tab`
- `investigation-panel`
- `identity-panel`
- `dossier-panel`
- `investigation-action`
- `monitor-card-action`

Examples:

- `ATLAS`
  - `top-nav`
  - `page-route`
  - `investigation-action`
- `MAGI`
  - `identity-panel`
  - `investigation-action`

This keeps the UI stable and predictable while still making it extensible.

## Backend Slot Model

Plugins should attach through explicit contribution points:

- controllers/routes
- analysis enrichers
- investigation actions
- dossier enrichers
- queue processors
- connector registrations

The core should not special-case plugin features once they are extracted.

## Packaging Model

### Phase 1

Use compile-time package plugins:

- public plugins can live in this monorepo
- private plugins live in separate private repos or private packages
- the app imports installed plugin packages during build/bootstrap

This is simpler and safer than remote runtime code loading.

### Phase 2

If needed later, add plugin discovery from installed packages or a plugin directory. Do not start there.

## Proposed Repo Boundary

### Public core repo

- plugin types
- plugin registry interfaces
- plugin loader
- core UI slot system
- core investigation platform
- public plugins like `ATLAS`

### Private MAGI plugin repo

- MAGI routes
- MAGI services
- MAGI UI panel
- MAGI-specific actions
- any private prompts, heuristics, or policy logic

The public repo may reference the `magi` slot, but it must not include the implementation if the feature is meant to stay private.

## Extraction Order

### Step 1

Introduce:

- typed manifest contract
- shared registry
- backend manifest endpoint
- frontend slot consumption

### Step 2

Convert `ATLAS` into the first public plugin-style module:

- contributes nav item
- contributes route
- contributes investigation actions

### Step 3

Extract `MAGI` from core:

- remove hardwired MAGI UI from identity dossier
- move MAGI controller/service into a private plugin package
- keep only core extension points in public repo

### Step 4

Evaluate additional candidates:

- on-chain correlation
- specialized source packs
- region/domain packs

## Why This Is Better Than Feature Flags

For an open-source repo, feature flags do not protect sensitive code. A self-hoster can turn them back on.

A private plugin boundary works because:

- the public repo contains extension points, not the sensitive implementation
- private functionality only exists where the private package is installed

## Near-Term Deliverables

The first scaffold in core should include:

1. plugin manifest types
2. shared plugin registry
3. backend endpoint exposing installed manifests
4. frontend consumption of plugin nav contributions
5. explicit slot names for future panel/action extraction

That is enough to begin extracting `ATLAS` publicly and `MAGI` privately.
