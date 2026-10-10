# Contributing to prismarine-item

See the [Prismarine contribution guide](https://github.com/PrismarineJS/mineflayer/blob/master/docs/CONTRIBUTING.md) for the shared contribution process. This repository's canonical package README is [README.md](README.md).

`index.js` loads the versioned Item class; `index.d.ts` defines its public API. Registry feature gates select Java component, legacy NBT, and Bedrock forms. Preserve null and empty-slot semantics, component normalization, removals, and older versions when changing serialization. Read [CONTEXT.md](CONTEXT.md) and [SECURITY.md](SECURITY.md) before modifying component or NBT handling.

## Protocol 777 codecs and provenance

`lib/hashedSlot.json` declares the base persistent codec shapes. `lib/hashedSlot.js` selects Java 26.3/protocol 777 families from `lib/hashedSlot/families/` and converts network values before CRC32C hashing. Every current hashable component must have exactly one codec; the three explicit exclusions remain excluded. Unresolved or malformed payloads use the existing zero-hash recovery path. Keep nested component depth limits, signed NBT bounds, and the four-integer nested profile UUID guard.

The integration uses the merged [minecraft-data source](https://github.com/Misty4119/minecraft-data/commit/1d37505b338710f2f347aa00efaa48a054754b19), [node-minecraft-protocol](https://github.com/Misty4119/node-minecraft-protocol/commit/cc1bfca769d36e90f8941138c1f63144e55d3403), and [prismarine-chunk](https://github.com/Misty4119/prismarine-chunk/commit/23149f443d08aa15c4d4ddc868dfd3536c7b6110). This package does not directly depend on the latter two. CI generates minecraft-data using [node-minecraft-data runtime source](https://github.com/PrismarineJS/node-minecraft-data/commit/308134a8020139d49ceb851c97713ae15b745192) and the exact merged data checkout. Update these immutable references when advancing the integration.

An isolated `npm install` may resolve older published registry data. Reproduce 26.3 with the CI checkout/prepare/install steps or Mineflayer's documented sibling vendor runtime; record the actual import path and protocol/data versions. CI runs lint before checking out the generated data runtime, then runs focused tests, TypeScript checks, and the full Mocha suite.

## Checks

Run from the repository root:

```sh
npm install
npm run lint
npx mocha --reporter spec --exit --grep 'component|HashedSlot|HashOps|hashed'
npm run test:types
npm test
git diff --check
```

The package does not declare a Node.js engine requirement; CI currently tests Node 24. `npm test` includes lint through `pretest`, TypeScript checks, and Mocha tests for legacy items, components, hashed slots, and anvil behavior. Update declarations and README API notes when the public contract changes.

Hash conversion equivalence fixtures test codec mapping. Add a Vanilla hash vector only when a server-authoritative interaction independently confirms it; a value produced by the hasher itself is not an independent oracle. Do not commit private server data, identifying packet captures, tokens, or credentials.
