# prismarine-item repository context

## Purpose

prismarine-item represents Minecraft items across Java and Bedrock protocol representations. The loader in index.js accepts a Minecraft version or registry and returns the corresponding Item class. The current package is 1.18.0 and declares no Node.js engine requirement.

## Public model

An Item carries type, count, metadata, NBT, stackId, derived names and durability, enchantments, custom name/lore/model, placement and destruction restrictions, and optional component arrays/maps on modern Java versions. Static methods convert between the in-memory object and network forms:

- toNotch/fromNotch handle legacy, component, server-authoritative, and Bedrock representations selected by registry features.
- toHashedNotch represents 1.21.5+ hashed slots and uses lib/hashedSlot.js plus lib/hashedSlot.json.
- equal compares selected item identity, stack size, and NBT according to its flags.
- anvil applies the current combining and rename rules.

Null and empty slots are meaningful wire values. Preserve them exactly.

## Source map

- index.js contains the loader, Item class, feature-gated serialization, component normalization, and getters/setters.
- lib/anvil.js implements anvil combination and cost rules.
- lib/hashOps.js and lib/hashedSlot.js implement component hash calculation and network mapping; lib/hashedSlot.json describes the protocol types.
- index.d.ts is the TypeScript contract.
- test/ contains legacy, component, hashed-slot, anvil, and type tests.

## Compatibility flow

prismarine-registry supplies edition, version, and supportFeature. minecraft-data supplies item definitions, names, durability, enchantments, and component metadata. node-minecraft-protocol carries the network structures. Mineflayer consumes Item objects in inventory and window plugins.

Modern Java item components (1.20.5 and later) replace or supplement legacy NBT. New component types must be normalized in both directions and handled by hashing rules where applicable. Java 26.2 and 26.3 must retain their version-specific registry and component behavior; never assume a later version's component layout is identical without checking minecraft-data and protocol schemas.

## Pitfalls

- Using a null Item where the packet expects an empty present=false or itemCount=0 form, or vice versa.
- Dropping removedComponents or stackId when round-tripping.
- Mutating component arrays without updating componentMap.
- Treating CRC32C hashes as authentication or equality proof.
- Updating JavaScript without updating TypeScript declarations.
- Serializing a component with a guessed shape rather than the protocol-defined shape.


## Published versus local source

The current component and 26.2/26.3 work is after the published 1.18.0 release. A standalone npm install is not a reproducible source-tree validation. Use the sibling checkout topology and record dependency commits, registry data, and protocol version when reporting results.
