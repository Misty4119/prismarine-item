// Component hashes are taken over the codec form (the shape a data pack
// writes), while the wire carries the network form. lib/hashedSlot.json holds
// each component's codec shape; what remains here turns the network form into
// the codec form where the two differ, mostly registry ids into names.
const { createProtoDef, hashValue, typeNames: hashTypeNames } = require('./hashOps')
const shapes = require('./hashedSlot.json')

const unresolved = () => {
  throw new Error('HashOps values are hashed on write and cannot be read back')
}
const scalarChoice = typeOf => [unresolved, function (value, buffer, offset, args, context) {
  const type = typeOf(value)
  if (!type) throw new Error('invalid value for HashOps scalar choice')
  return this.write(value, buffer, offset, type, context)
}, function (value, args, context) {
  const type = typeOf(value)
  if (!type) throw new Error('invalid value for HashOps scalar choice')
  return this.sizeOf(value, type, context)
}]
const scalarTypes = {
  resolvable_int: scalarChoice(value => Number.isInteger(value) ? 'int' : typeof value === 'string' ? 'string' : undefined),
  resolvable_float: scalarChoice(value => typeof value === 'number' ? 'float' : typeof value === 'string' ? 'string' : undefined)
}

function createProto (types = {}, components = {}) {
  const proto = createProtoDef()
  proto.addTypes(shapes.types)
  proto.addTypes(scalarTypes)
  proto.addTypes(types)
  proto.addTypes(components)
  return proto
}

const proto = createProto({}, shapes.components)

const DYE_COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
const ATTRIBUTE_OPERATIONS = { add: 'add_value', multiply_base: 'add_multiplied_base', multiply_total: 'add_multiplied_total' }
const EQUIPMENT_SLOT_GROUPS = { main_hand: 'mainhand', off_hand: 'offhand' }
const SWING_ANIMATION_TYPES = ['none', 'whack', 'stab']
// Components with no codec never hash, on any version.
const NOT_HASHED = new Set(['creative_slot_lock', 'map_post_processing', 'additional_trade_cost'])

const PROTOCOL_777_FAMILIES = ['records', 'combat', 'consumption', 'predicates', 'registries', 'nested_items', 'variants']

function isComponentCodecShape (shape) {
  return (typeof shape === 'string' && shape.length > 0) || (Array.isArray(shape) && shape.length > 0)
}

function addUniqueTypes (target, source, sourceName) {
  for (const [name, type] of Object.entries(source ?? {})) {
    if (Object.prototype.hasOwnProperty.call(target, name)) {
      throw new Error(`duplicate hashed component codec type ${name} from ${sourceName}`)
    }
    target[name] = type
  }
}

function loadFamilies () {
  const types = {}
  const components = {}
  const converters = {}
  const ids = new Set()

  for (const familyName of PROTOCOL_777_FAMILIES) {
    const family = require(`./hashedSlot/families/${familyName}`)
    const familyIds = family.ids
    const familyComponents = family.components ?? {}
    const familyConverters = family.converters ?? {}
    if (!Array.isArray(familyIds) || new Set(familyIds).size !== familyIds.length ||
        Object.keys(familyComponents).sort().join('\0') !== [...familyIds].sort().join('\0')) {
      throw new Error(`hashed component family ${familyName} must declare exactly one shape per unique ID`)
    }
    if (Object.keys(familyConverters).some(id => !familyIds.includes(id)) ||
        Object.values(familyConverters).some(converter => typeof converter !== 'function')) {
      throw new Error(`hashed component family ${familyName} has an invalid converter declaration`)
    }

    addUniqueTypes(types, family.types, familyName)
    for (const id of familyIds) {
      if (ids.has(id) || Object.prototype.hasOwnProperty.call(shapes.components, id)) {
        throw new Error(`duplicate hashed component family ID ${id}`)
      }
      if (!isComponentCodecShape(familyComponents[id])) {
        throw new Error(`hashed component family ${familyName} has no codec type for ${id}`)
      }
      ids.add(id)
      components[id] = familyComponents[id]
      if (familyConverters[id]) converters[id] = familyConverters[id]
    }
  }

  return { types, components, converters, ids }
}

function itemStackHashTypes (componentNames, componentShapes) {
  function componentPatchFields (value, allowRemovals) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const fields = {}
    for (const [patchKey, componentValue] of Object.entries(value)) {
      const removed = patchKey.startsWith('!')
      if (removed && !allowRemovals) return undefined
      const resourceKey = removed ? patchKey.slice(1) : patchKey
      if (!resourceKey.startsWith('minecraft:')) return undefined
      const componentName = resourceKey.slice('minecraft:'.length)
      if (!componentNames.has(componentName)) return undefined

      if (removed) {
        if (!componentValue || typeof componentValue !== 'object' || Array.isArray(componentValue) || Object.keys(componentValue).length !== 0) return undefined
        fields[patchKey] = ['map', {}]
      } else {
        const type = componentShapes[componentName]
        if (!type) return undefined
        fields[patchKey] = type
      }
    }
    return fields
  }

  const predicateComponentValues = [unresolved, function (value, buffer, offset, args, context) {
    const fields = componentValueFields(value, componentNames, componentShapes)
    if (!fields) throw new Error('invalid nested predicate component values')
    return this.write(value, buffer, offset, ['map', fields], context)
  }, function (value, args, context) {
    const fields = componentValueFields(value, componentNames, componentShapes)
    if (!fields) throw new Error('invalid nested predicate component values')
    return this.sizeOf(value, ['map', fields], context)
  }]

  const componentPatch = [unresolved, function (value, buffer, offset, args, context) {
    const fields = componentPatchFields(value, true)
    if (!fields) throw new Error('invalid nested item component patch')
    return this.write(value, buffer, offset, ['map', fields], context)
  }, function (value, args, context) {
    const fields = componentPatchFields(value, true)
    if (!fields) throw new Error('invalid nested item component patch')
    return this.sizeOf(value, ['map', fields], context)
  }]

  const componentValues = [unresolved, function (value, buffer, offset, args, context) {
    const fields = componentPatchFields(value, false)
    if (!fields) throw new Error('invalid nested item component value map')
    return this.write(value, buffer, offset, ['map', fields], context)
  }, function (value, args, context) {
    const fields = componentPatchFields(value, false)
    if (!fields) throw new Error('invalid nested item component value map')
    return this.sizeOf(value, ['map', fields], context)
  }]

  return {
    item_component_patch: componentPatch,
    item_component_values: componentValues,
    predicates_component_values: predicateComponentValues,
    item_stack_template: ['map', {
      id: 'string',
      count: { type: 'int', default: 1 },
      components: { type: 'item_component_patch', default: {} }
    }]
  }
}

function componentValueFields (value, componentNames, componentShapes) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const fields = {}
  for (const key of Object.keys(value)) {
    if (!key.startsWith('minecraft:') || key.startsWith('!')) return undefined
    const name = key.slice('minecraft:'.length)
    const type = componentNames.has(name) && componentShapes[name]
    if (!type) return undefined
    fields[key] = type
  }
  return fields
}

function isProtocol777 (registry) {
  return registry.version?.majorVersion === '26.3' && registry.version?.version === 777
}

function createProtocol777Components (registry) {
  const families = loadFamilies()
  const componentTypeNames = registry.protocol.types.SlotComponentType[1].mappings
  const registryNames = new Set(Object.values(componentTypeNames))
  const componentShapes = { ...shapes.components, ...shapes.protocol777Components }
  delete componentShapes.map_color

  for (const [name, type] of Object.entries(families.components)) {
    if (!registryNames.has(name)) throw new Error(`hashed component family declares unknown protocol-777 ID ${name}`)
    componentShapes[name] = type
  }

  // Newer component codecs use ItemStackTemplate, which supports patched
  // component maps and omits the default count. The legacy item_stack shape
  // cannot represent nested stacks that carry component patches.
  componentShapes.charged_projectiles = ['list', 'item_stack_template']
  componentShapes.bundle_contents = ['list', 'item_stack_template']
  componentShapes.container = ['list', ['map', { slot: 'int', item: 'item_stack_template' }]]

  const classified = [...Object.keys(componentShapes), ...NOT_HASHED]
  if (new Set(classified).size !== classified.length || classified.length !== registryNames.size ||
      classified.some(name => !registryNames.has(name))) {
    throw new Error('protocol-777 hashed component families do not exactly classify the component registry')
  }

  const nestedItemTypes = itemStackHashTypes(registryNames, componentShapes)
  const familyTypeNames = { ...families.types }
  addUniqueTypes(familyTypeNames, nestedItemTypes, 'shared nested item codecs')
  const allTypes = {}
  addUniqueTypes(allTypes, shapes.types, 'base hash types')
  addUniqueTypes(allTypes, scalarTypes, 'shared scalar types')
  addUniqueTypes(allTypes, familyTypeNames, 'protocol-777 families')
  addUniqueTypes(allTypes, componentShapes, 'component shapes')
  const codecTypeNames = new Set([
    ...hashTypeNames,
    ...Object.keys(shapes.types),
    ...Object.keys(scalarTypes),
    ...Object.keys(familyTypeNames),
    ...Object.keys(componentShapes)
  ])
  for (const [name, type] of Object.entries(families.components)) {
    if (typeof type === 'string' && !codecTypeNames.has(type)) {
      throw new Error(`hashed component ${name} references an unknown codec type ${type}`)
    }
  }

  const proto = createProto(familyTypeNames, componentShapes)
  // Keep raw codec descriptors alongside ProtoDef's compiled types. Nested
  // persistent NBT conversion needs the descriptors to distinguish map/list
  // shapes before the writer sees them.
  return { proto, componentShapes, converters: families.converters, componentTypeNames, codecTypes: allTypes }
}

function loader (registry) {
  const key = name => name.includes(':') ? name : `minecraft:${name}`
  const componentTypeNames = registry.protocol.types.SlotComponentType[1].mappings
  const protocol777 = isProtocol777(registry)
  let componentShapes = shapes.components
  let familyConverters = {}
  let runtimeProto = proto
  let codecTypes = {}
  if (protocol777) {
    const loaded = createProtocol777Components(registry)
    componentShapes = loaded.componentShapes
    familyConverters = loaded.converters
    runtimeProto = loaded.proto
    codecTypes = loaded.codecTypes
  }
  let helpers

  // A converter returns undefined when the value can't be put in codec form,
  // which makes the whole component unhashable.
  const all = values => values.includes(undefined) ? undefined : values
  const dyeColor = value => typeof value === 'number' ? DYE_COLORS[value] : value
  const filterable = page => ({ raw: page.content, filtered: page.filteredContent })
  const enchantments = data => Object.fromEntries(data.enchantments.map(e => [key(registry.enchantments[e.id].name), e.level]))
  const registryEntry = (name, id) => registry.loginPacket?.dimensionCodec?.[name]?.entries?.[id]?.key

  function resolvedValue (value, type) {
    if (value?.isConstant === true && (type === 'int' ? Number.isInteger(value.value) : typeof value.value === 'number')) return value.value
    if (value?.isConstant === false && typeof value.value === 'string') return key(value.value)
    return undefined
  }

  function signText (data) {
    return {
      messages: data.messages,
      filtered_messages: data.filteredMessages,
      color: dyeColor(data.color),
      has_glowing_text: data.hasGlowingText
    }
  }

  function uuid (str) {
    if (typeof str !== 'string') return undefined
    const hex = str.replace(/-/g, '')
    if (!/^[0-9a-f]{32}$/i.test(hex)) return undefined
    return [0, 8, 16, 24].map(i => parseInt(hex.slice(i, i + 8), 16) | 0)
  }

  function profile (data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
    let source
    if (data.type === 'partial') source = data.partial
    else if (data.type === 'complete') source = data.complete
    else if (data.type === undefined) source = data // legacy profile wire shape
    else return undefined
    if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined

    const result = {}
    if (source.name !== undefined) result.name = source.name
    if (source.uuid !== undefined && source.uuid !== null) {
      result.id = uuid(source.uuid)
      if (result.id === undefined) return undefined
    }
    if (source.properties !== undefined) result.properties = source.properties

    const skinPatch = data.skinPatch ?? {}
    if (typeof skinPatch !== 'object' || Array.isArray(skinPatch)) return undefined
    for (const [wireName, codecName] of [['body', 'texture'], ['cape', 'cape'], ['elytra', 'elytra']]) {
      if (skinPatch[wireName] === undefined) continue
      if (typeof skinPatch[wireName] !== 'string') return undefined
      result[codecName] = key(skinPatch[wireName])
    }
    if (skinPatch.model !== undefined) {
      if (typeof skinPatch.model === 'boolean') result.model = skinPatch.model ? 'slim' : 'wide'
      else if (skinPatch.model === 'slim' || skinPatch.model === 'wide') result.model = skinPatch.model
      else return undefined
    }
    return result
  }

  function legacyProfile (data) {
    if (data.type !== undefined) return undefined // resolvable profiles retain the pre-777 fallback
    return { name: data.name, id: data.uuid == null ? undefined : uuid(data.uuid), properties: data.properties }
  }

  function itemStack (slot) {
    if (protocol777) return helpers.itemStackTemplate(slot)
    if (!slot || slot.itemCount === 0) return undefined
    if (slot.components.length || slot.removeComponents.length) return undefined
    return { id: key(registry.items[slot.itemId].name), count: slot.itemCount }
  }

  function attributeModifier (m) {
    const attribute = registry.attributesArray[m.typeId]
    if (!attribute) return undefined
    return {
      type: key(attribute.resource),
      id: key(m.name),
      amount: m.value,
      operation: ATTRIBUTE_OPERATIONS[m.operation],
      slot: EQUIPMENT_SLOT_GROUPS[m.slot] ?? m.slot,
      display: m.display && { type: m.display.type, value: m.display.type === 'override' ? m.display.component : undefined }
    }
  }

  function swingAnimation (data) {
    data ??= {}
    if (typeof data !== 'object') return undefined

    const type = typeof data.type === 'number' ? SWING_ANIMATION_TYPES[data.type] : data.type ?? 'whack'
    const duration = data.duration ?? 6
    if (!SWING_ANIMATION_TYPES.includes(type) || !Number.isInteger(duration)) return undefined
    return { type, duration }
  }

  function mobVisibility (data) {
    const targetingEntityTypes = data?.targetingEntityTypes
    let targetingEntityTypesCodec

    if (targetingEntityTypes?.name != null) {
      if (typeof targetingEntityTypes.name !== 'string') return undefined
      const name = targetingEntityTypes.name.startsWith('#') ? targetingEntityTypes.name.slice(1) : targetingEntityTypes.name
      targetingEntityTypesCodec = `#${key(name)}`
    } else if (Array.isArray(targetingEntityTypes?.ids)) {
      const names = all(targetingEntityTypes.ids.map(id => {
        if (!Number.isInteger(id)) return undefined
        const entity = registry.entitiesArray[id]
        return entity && key(entity.name)
      }))
      if (!names) return undefined
      // HolderSetCodec uses ExtraCodecs.compactListCodec: one holder is written
      // as its resource key, while zero or multiple holders use a list.
      targetingEntityTypesCodec = names.length === 1 ? names[0] : names
    } else {
      return undefined
    }

    if (typeof data.visibility !== 'number') return undefined
    return { targeting_entity_types: targetingEntityTypesCodec, visibility: data.visibility }
  }

  const converters = {
    entity_data: data => {
      if (data.data === undefined) return data // 1.21.5-1.21.9 send the id inside the tag
      const entity = registry.entitiesArray[data.type]
      if (!entity) return undefined
      return { type: 'compound', value: { id: { type: 'string', value: key(entity.name) }, ...data.data.value } }
    },
    block_entity_data: data => data.data === undefined ? data : undefined, // 1.21.9+ send a block entity type id, which the registry lacks
    block_transformer: data => {
      const name = registryEntry('minecraft:block_transformer', data)
      return name ? key(name) : undefined
    },
    brewing_fuel: data => {
      const uses = resolvedValue(data.uses, 'int')
      const speedMultiplier = resolvedValue(data.speedMultiplier, 'float')
      if (uses === undefined || speedMultiplier === undefined) return undefined
      return { uses, speed_multiplier: speedMultiplier }
    },
    compostable: data => {
      const layers = resolvedValue(data, 'int')
      return layers === undefined ? undefined : { layers }
    },
    cooking_fuel: data => {
      const burnTime = resolvedValue(data.burnTime, 'int')
      const speedMultiplier = resolvedValue(data.speedMultiplier, 'float')
      if (burnTime === undefined || speedMultiplier === undefined) return undefined
      return { burn_time: burnTime, speed_multiplier: speedMultiplier }
    },
    enchantments,
    stored_enchantments: enchantments,
    base_color: dyeColor,
    'wolf/collar': dyeColor,
    'cat/collar': dyeColor,
    'sheep/color': dyeColor,
    'shulker/color': dyeColor,
    'tropical_fish/base_color': dyeColor,
    'tropical_fish/pattern_color': dyeColor,
    'cushion/color': dyeColor,
    block_state: data => Object.fromEntries(data.properties.map(p => [p.name, p.value])),
    attack_animation: swingAnimation,
    interact_animation: swingAnimation,
    mob_visibility: mobVisibility,
    food: data => ({ nutrition: data.nutrition, saturation: data.saturationModifier, can_always_eat: data.canAlwaysEat }),
    tooltip_display: data => ({ hide_tooltip: data.hideTooltip, hidden_components: data.hiddenComponents.map(id => key(componentTypeNames[id])) }),
    writable_book_content: data => ({ pages: data.pages.map(filterable) }),
    written_book_content: data => ({
      ...data,
      title: { raw: data.rawTitle, filtered: data.filteredTitle },
      pages: data.pages.map(page => filterable(page))
    }),
    provides_pottery_pattern: data => {
      const name = registryEntry('minecraft:decorated_pot_pattern', data)
      return name ? key(name) : undefined
    },
    sign_text_front: signText,
    sign_text_back: signText,
    charged_projectiles: data => all(data.projectiles.map(itemStack)),
    bundle_contents: data => all(data.contents.map(itemStack)),
    container: data => all(data.contents
      .map((slot, i) => slot.itemCount === 0 ? null : { slot: i, item: itemStack(slot) })
      .filter(Boolean)
      .map(entry => entry.item === undefined ? undefined : entry)),
    profile: protocol777 ? profile : legacyProfile,
    attribute_modifiers: data => all((data.attributes ?? data).map(attributeModifier)), // wrapped in a container from 1.21.11
    villager_food: data => ({ nutrition: data })
  }

  function componentValue (type, data, depth = 0) {
    if (!Object.prototype.hasOwnProperty.call(componentShapes, type)) return undefined
    const convert = familyConverters[type] ?? converters[type]
    return convert ? convert(data, helpers, depth) : data
  }

  if (protocol777) {
    const createHelpers = require('./hashedSlot/families/helpers')
    helpers = createHelpers(registry, componentValue, codecTypes, componentShapes)
  }

  // Returns the hash as a signed 32-bit int (the wire type), or undefined
  // when the component's value can't be reproduced in codec form.
  function hashComponent (type, data) {
    if (!Object.prototype.hasOwnProperty.call(componentShapes, type)) return undefined
    try {
      const convert = familyConverters[type] ?? converters[type]
      const codec = convert ? convert(data, helpers, 0) : data
      if (convert && codec === undefined) return undefined
      if (type === 'mob_visibility') {
        // The codec uses a compact list, so its single-element representation
        // hashes as a string instead of a list containing one string.
        const targetingType = typeof codec.targeting_entity_types === 'string' ? 'string' : ['list', 'string']
        return hashValue(runtimeProto, codec, ['map', { targeting_entity_types: targetingType, visibility: 'float' }])
      }
      return hashValue(runtimeProto, codec, componentShapes[type])
    } catch (error) {
      // Malformed network data must stay recoverable at the inventory layer.
      return undefined
    }
  }

  return { hashComponent, hashedTypes: Object.keys(componentShapes), NOT_HASHED }
}

module.exports = loader
loader.proto = proto
loader.hash = (value, type) => hashValue(proto, value, type)
