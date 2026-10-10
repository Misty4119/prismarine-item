# Hashed component family modules

Each family exports a descriptor consumed by `lib/hashedSlot.js`:

```js
module.exports = {
  ids: ['component_name'],
  types: {}, // optional named ProtoDef types used by the component shapes
  components: { component_name: 'type_name' },
  converters: { component_name: (networkValue, helpers) => codecValue }
}
```

Component shapes describe the official persistent `Codec` form used by
`HashOps`; converters map the protocol network value into that form. Return
`undefined` when the network value is malformed or contains a registry ID the
active registry cannot resolve. Do not guess a hash or turn unknown data into
an empty/default value. Family modules are loaded only for Java 26.3 / protocol
777, so they do not change older-version behavior.

Shared helpers are created for the active registry and expose
`key(name)`, `registryEntry(registryName, id)`,
`holder(value, registryName, idField, dataField, convertData)`,
`holderSet(value, registryName)`, `enumValue(value, values)`, and
`all(values)`. Recursive item-component families also use `componentName(id)`,
`componentValue(name, networkValue)`, and
`itemStackTemplate(value, convertComponent?)`. The item-stack helper maps
protocol component IDs to names, recursively converts added component values,
preserves removals using the `!minecraft:name` persistent patch keys, rejects
unsupported values and limits nested templates to 32 levels. Keep component
IDs disjoint between families. The central loader validates duplicate and
unclassified IDs.
