# Agent instructions for prismarine-item

## Read first

Read [CONTEXT.md](CONTEXT.md) before changing item serialization, components, hashing, or version behavior. Read [SECURITY.md](SECURITY.md) before handling untrusted NBT, component payloads, packet captures, or account data. Use [README.md](README.md), index.js, index.d.ts, and the focused tests as the public contract.

## Source of truth

- index.js is the versioned Item loader and implementation.
- lib/anvil.js, lib/hashOps.js, lib/hashedSlot.js, and lib/hashedSlot.json contain anvil logic and hashed-slot/component encoding.
- index.d.ts is part of the published API and must change with JavaScript behavior.
- test/ includes legacy item, component, hashed-slot, anvil, and TypeScript coverage.
- prismarine-registry feature support determines which wire representation a version uses.

## Change rules

- Preserve null/empty-slot semantics for every supported edition and version.
- Use registry feature gates for component, legacy NBT, block-id, stack-id, and hashed-slot serialization. Do not infer protocol capability solely from an item ID.
- Keep normalization between component arrays, component maps, and network forms deterministic and wire-compatible.
- CRC32C component hashes in HashedSlot are integrity hints used by the protocol, not a cryptographic security boundary. Preserve unknown-component behavior and the documented zero-hash fallback.
- Update index.d.ts, README API notes, and tests whenever public fields, overloads, or serialization shapes change.
- Never place account credentials, session tokens, private packet captures, or real server data in fixtures.

## Commands and completion

From the repository root:

    npm install
    npm run lint
    npm run test:types
    npm test

npm test runs type checks, lint through pretest, and Mocha. Use focused tests while iterating, then run git diff --check and inspect both JS and declaration changes. This package does not declare a Node.js engine requirement; do not invent one.


## Reproducing this fork's release work

The Java 26.2/26.3 component work is newer than the current published package. An isolated npm install can resolve older registry data and will not reproduce the sibling checkout used for cross-repository validation. Use the adjacent repositories and exact commits documented by Mineflayer when validating components or hashed slots.
