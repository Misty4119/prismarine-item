'use strict'

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const resourceKeyPattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const nbtTypes = new Set(['byte', 'short', 'int', 'long', 'float', 'double', 'string', 'byteArray', 'intArray', 'longArray', 'list', 'compound'])
const TRANSIENT_COMPONENTS = new Set(['creative_slot_lock', 'map_post_processing', 'additional_trade_cost'])
const CHOICE_RECORD_TYPES = {
  records_damage_type: 'records_damage_type_data',
  records_sound_event: 'records_sound_event_data',
  combat_sound_event: 'combat_sound_event_data',
  consumption_sound_event: 'consumption_sound_event_data',
  trim_material_holder: 'trim_material_data',
  trim_pattern_holder: 'trim_pattern_data',
  instrument_holder: 'instrument_data',
  sound_event_holder: 'sound_event_data',
  jukebox_song_holder: 'jukebox_song_data',
  banner_pattern_holder: 'banner_pattern_data',
  painting_variant_holder: 'painting_variant_data'
}
const LONG_MIN = -(1n << 63n)
const LONG_MAX = (1n << 63n) - 1n

function isLongValue (value) {
  if (typeof value === 'bigint') return value >= LONG_MIN && value <= LONG_MAX
  return Array.isArray(value) && value.length === 2 && value.every(word => Number.isInteger(word) && word >= -2147483648 && word <= 2147483647)
}

function isArrayLike (value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView))
}

function isNbtTag (tag) {
  if (!isRecord(tag) || !nbtTypes.has(tag.type) || !Object.hasOwn(tag, 'value')) return false
  return isNbtPayload(tag.type, tag.value)
}

function isNbtPayload (type, value) {
  if (type === 'compound') return isRecord(value) && Object.values(value).every(isNbtTag)
  if (type === 'list') {
    if (!isRecord(value) || !Array.isArray(value.value)) return false
    if (value.type === 'end') return value.value.length === 0
    return nbtTypes.has(value.type) && value.value.every(entry => isNbtPayload(value.type, entry))
  }
  if (type === 'string') return typeof value === 'string'
  if (type === 'long') return isLongValue(value)
  if (type === 'byteArray') return isArrayLike(value) && [...value].every(byte => Number.isInteger(byte) && byte >= -128 && byte <= 255)
  if (type === 'intArray') return (Array.isArray(value) || value instanceof Int32Array) && [...value].every(value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647)
  if (type === 'longArray') return (Array.isArray(value) || value instanceof BigInt64Array) && [...value].every(isLongValue)
  if (typeof value !== 'number') return false
  if (type === 'byte') return Number.isInteger(value) && value >= -128 && value <= 127
  if (type === 'short') return Number.isInteger(value) && value >= -32768 && value <= 32767
  if (type === 'int') return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
  return Number.isFinite(value)
}

function validKey (value, helpers) {
  const key = helpers.key(value)
  return key && resourceKeyPattern.test(key) ? key : undefined
}

function convertProperties (properties) {
  if (!Array.isArray(properties)) return undefined
  const result = {}
  for (const property of properties) {
    if (!isRecord(property) || typeof property.name !== 'string' || property.name.length === 0 ||
        Object.hasOwn(result, property.name)) return undefined
    if (property.isExactMatch === true && typeof property.value?.exactValue === 'string') {
      result[property.name] = property.value.exactValue
    } else if (property.isExactMatch === false && isRecord(property.value)) {
      const { minValue, maxValue } = property.value
      if (minValue != null && typeof minValue !== 'string') return undefined
      if (maxValue != null && typeof maxValue !== 'string') return undefined
      result[property.name] = {
        ...(minValue == null ? {} : { min: minValue }),
        ...(maxValue == null ? {} : { max: maxValue })
      }
    } else {
      return undefined
    }
  }
  return result
}

function recordFromTag (tag, fields) {
  if (!isNbtTag(tag) || tag.type !== 'compound') return undefined
  return recordFromPayload(tag.value, fields)
}

function recordFromPayload (payload, fields) {
  if (!isRecord(payload)) return undefined
  const result = {}
  for (const [key, entry] of Object.entries(payload)) {
    const convert = fields[key]
    if (!convert) return undefined
    const value = convert(entry)
    if (value === undefined) return undefined
    result[key] = value
  }
  return result
}

function listFromTag (tag) {
  if (tag?.type !== 'list' || !isNbtTag(tag)) return undefined
  const { type, value } = tag.value
  if (type === 'end') return []
  return value.map(entry => ({ type, value: entry }))
}

function integerBound (tag) {
  if (tag?.type === 'int' && Number.isInteger(tag.value)) return tag.value
  const range = recordFromTag(tag, {
    min: value => value?.type === 'int' ? value.value : undefined,
    max: value => value?.type === 'int' ? value.value : undefined
  })
  if (range === undefined) return undefined
  if (Number.isInteger(range.min) && range.min === range.max) return range.min
  return range
}

function omitAnyBound (value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
}

function recordWithDefaultBounds (tag, fields, defaultedBounds) {
  const result = recordFromTag(tag, fields)
  if (result === undefined) return undefined
  for (const field of defaultedBounds) {
    if (omitAnyBound(result[field])) delete result[field]
  }
  return result
}

function holderSetValue (tag) {
  if (tag?.type === 'string') {
    const value = tag.value.startsWith('#') ? tag.value.slice(1) : tag.value
    return resourceKeyPattern.test(value) ? tag.value : undefined
  }
  if (tag?.type !== 'list' || !isNbtTag(tag) || tag.value.type !== 'string') return undefined
  const values = tag.value.value.map(value => {
    const key = typeof value === 'string' && value.startsWith('#') ? value.slice(1) : value
    return typeof value === 'string' && resourceKeyPattern.test(key) ? value : undefined
  })
  if (values.includes(undefined)) return undefined
  return values.length === 1 ? values[0] : values
}

function booleanValue (tag) {
  if (!isNbtTag(tag) || !['byte', 'short', 'int', 'long', 'float', 'double'].includes(tag.type)) return undefined
  if (tag.type === 'long' && Array.isArray(tag.value)) return tag.value[0] !== 0 || tag.value[1] !== 0
  return tag.value !== 0 && tag.value !== 0n
}

function stringValue (tag) {
  return tag?.type === 'string' && typeof tag.value === 'string' ? tag.value : undefined
}

function numberBound (tag, numberType) {
  if (tag?.type === numberType && Number.isFinite(tag.value)) return tag.value
  const range = recordFromTag(tag, {
    min: value => value?.type === numberType && Number.isFinite(value.value) ? value.value : undefined,
    max: value => value?.type === numberType && Number.isFinite(value.value) ? value.value : undefined
  })
  if (range === undefined) return undefined
  if (range.min !== undefined && range.min === range.max) return range.min
  return range
}

function collectionPredicate (tag, convertElement, bound = integerBound) {
  return recordWithDefaultBounds(tag, {
    contains: value => {
      const entries = listFromTag(value)
      if (!entries) return undefined
      const converted = entries.map(convertElement)
      return converted.includes(undefined) ? undefined : converted
    },
    count: value => {
      const entries = listFromTag(value)
      if (!entries) return undefined
      const converted = entries.map(entry => recordWithDefaultBounds(entry, {
        test: convertElement,
        count: bound
      }, ['count']))
      return converted.includes(undefined) ? undefined : converted
    },
    size: bound
  }, ['size'])
}

function mobEffectsPredicate (tag) {
  if (!isNbtTag(tag) || tag.type !== 'compound') return undefined
  const result = {}
  for (const [key, predicate] of Object.entries(tag.value)) {
    if (!resourceKeyPattern.test(key)) return undefined
    const converted = recordWithDefaultBounds(predicate, {
      amplifier: integerBound,
      duration: integerBound,
      ambient: value => value?.type === 'byte' ? booleanValue(value) : undefined,
      visible: value => value?.type === 'byte' ? booleanValue(value) : undefined
    }, ['amplifier', 'duration'])
    if (converted === undefined) return undefined
    result[key] = converted
  }
  return result
}

function itemPredicate (tag, helpers, depth = 0) {
  if (depth > 32 || !isNbtTag(tag) || tag.type !== 'compound') return undefined
  const result = {}
  if (tag.value.items !== undefined) {
    result.items = holderSetValue(tag.value.items)
    if (result.items === undefined) return undefined
  }
  if (tag.value.count !== undefined) {
    const count = integerBound(tag.value.count)
    if (count === undefined) return undefined
    if (!omitAnyBound(count)) result.count = count
  }
  if (tag.value.components !== undefined) {
    const components = componentValueMap(tag.value.components, helpers, depth + 1)
    if (components === undefined) return undefined
    if (Object.keys(components).length > 0) result.components = components
  }
  if (tag.value.predicates !== undefined) {
    const predicates = predicateValueMap(tag.value.predicates, helpers, depth + 1)
    if (predicates === undefined) return undefined
    if (Object.keys(predicates).length > 0) result.predicates = predicates
  }
  if (Object.keys(tag.value).some(key => !['items', 'count', 'components', 'predicates'].includes(key))) return undefined
  return result
}

function componentValueMap (tag, helpers, depth) {
  return componentMap(tag, helpers, depth, false)
}

function componentMap (tag, helpers, depth, allowRemovals) {
  if (!isNbtTag(tag) || tag.type !== 'compound' || depth > 32) return undefined
  const result = {}
  for (const [key, value] of Object.entries(tag.value)) {
    const removed = key.startsWith('!minecraft:')
    if (removed && !allowRemovals) return undefined
    const componentKey = removed ? key.slice(1) : key
    if (!componentKey.startsWith('minecraft:') || !helpers.componentShape) return undefined
    const name = componentKey.slice('minecraft:'.length)
    const shape = helpers.componentShape(name)
    if (shape === undefined) return undefined
    if (removed) {
      if (value.type !== 'compound' || Object.keys(value.value).length !== 0) return undefined
      result[key] = {}
      continue
    }
    if (name === 'profile' && value.type === 'compound' && value.value.id !== undefined && !isProfileUuidTag(value.value.id)) return undefined
    const converted = persistentNbtValue(value, shape, helpers, depth + 1)
    if (converted === undefined) return undefined
    result[key] = converted
  }
  return result
}

function isProfileUuidTag (tag) {
  return isNbtTag(tag) && tag.type === 'intArray' && Array.isArray(tag.value) && tag.value.length === 4 &&
    tag.value.every(value => Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff)
}

function predicateValueMap (tag, helpers, depth) {
  if (!isNbtTag(tag) || tag.type !== 'compound' || depth > 32) return undefined
  const result = {}
  for (const [key, value] of Object.entries(tag.value)) {
    if (!key.startsWith('minecraft:')) return undefined
    const name = key.slice('minecraft:'.length)
    const valueType = predicateValueTypes[name]
    const emptyCompound = value.type === 'compound' && Object.keys(value.value).length === 0
    const knownComponent = helpers.componentId?.(name) !== undefined
    let converted
    if (valueType === 'predicates_any_value') converted = knownComponent && emptyCompound ? {} : undefined
    else if (valueType) converted = componentPredicateValue(name, value, helpers, depth + 1)
    else if (knownComponent && emptyCompound) converted = {}
    if (converted === undefined) return undefined
    result[key] = converted
  }
  return result
}

function persistentNbtValue (tag, type, helpers, depth = 0) {
  if (depth > 32 || !isNbtTag(tag)) return undefined
  if (typeof type === 'string') {
    if (type === 'nbt') return tag
    if (type === 'text') return tag
    if (type === 'string') return stringValue(tag)
    if (type === 'boolean') return booleanValue(tag)
    if (type === 'byte' || type === 'short' || type === 'int' || type === 'float' || type === 'double') return tag.type === type && Number.isFinite(tag.value) ? tag.value : undefined
    if (type === 'resolvable_int') {
      if (tag.type === 'int' && Number.isInteger(tag.value)) return tag.value
      return tag.type === 'string' ? validKey(tag.value, helpers) : undefined
    }
    if (type === 'resolvable_float') {
      if (tag.type === 'float' && Number.isFinite(tag.value)) return tag.value
      return tag.type === 'string' ? validKey(tag.value, helpers) : undefined
    }
    if (type === 'long') return tag.type === 'long' && isNbtPayload('long', tag.value) ? tag.value : undefined
    if (type === 'byte_array') return tag.type === 'byteArray' ? tag.value : undefined
    if (type === 'int_array') return tag.type === 'intArray' ? tag.value : undefined
    if (type === 'long_array') return tag.type === 'longArray' ? tag.value : undefined

    const dynamic = persistentDynamicValue(tag, type, helpers, depth + 1)
    if (dynamic !== null) return dynamic

    const resolved = helpers.codecType?.(type)
    if (resolved === undefined) return undefined
    if (Array.isArray(resolved) && typeof resolved[0] === 'function') {
      if (type.endsWith('holder_set')) return holderSetValue(tag)
      if (type === 'predicates_holder_set') return holderSetValue(tag)
      return undefined
    }
    return persistentNbtValue(tag, resolved, helpers, depth + 1)
  }
  if (!Array.isArray(type) || typeof type[0] !== 'string') return undefined
  const [kind, args] = type
  if (kind === 'map') {
    if (tag.type !== 'compound' || !isRecord(args)) return undefined
    const result = {}
    for (const [key, spec] of Object.entries(args)) {
      const field = isRecord(spec) && !Array.isArray(spec) ? spec : { type: spec }
      const entry = tag.value[key]
      if (entry === undefined) {
        if (field.optional || Object.hasOwn(field, 'default')) continue
        return undefined
      }
      const value = persistentNbtValue(entry, field.type, helpers, depth + 1)
      if (value === undefined) return undefined
      if (Object.hasOwn(field, 'default') && JSON.stringify(value) === JSON.stringify(field.default)) continue
      result[key] = value
    }
    if (Object.keys(tag.value).some(key => !Object.hasOwn(args, key))) return undefined
    return result
  }
  if (kind === 'dict') {
    if (tag.type !== 'compound') return undefined
    const result = {}
    for (const [key, entry] of Object.entries(tag.value)) {
      const value = persistentNbtValue(entry, args, helpers, depth + 1)
      if (value === undefined) return undefined
      result[key] = value
    }
    return result
  }
  if (kind === 'list') {
    const values = listFromTag(tag)
    if (!values) return undefined
    const result = values.map(value => persistentNbtValue(value, args, helpers, depth + 1))
    return result.includes(undefined) ? undefined : result
  }
  return undefined
}

function persistentDynamicValue (tag, type, helpers, depth) {
  if (type.endsWith('_holder_set')) return holderSetValue(tag)
  if (type === 'predicates_int_bound') return integerBound(tag)
  if (type === 'predicates_double_bound') return numberBound(tag, 'double')
  if (type === 'predicates_property') {
    if (tag.type === 'string') return stringValue(tag)
    return recordFromTag(tag, { min: stringValue, max: stringValue })
  }
  if (type === 'predicates_compact_list') {
    if (tag.type === 'compound') return persistentNbtValue(tag, 'predicates_block', helpers, depth + 1)
    const entries = listFromTag(tag)
    if (!entries) return undefined
    const converted = entries.map(entry => persistentNbtValue(entry, 'predicates_block', helpers, depth + 1))
    return converted.includes(undefined) ? undefined : converted
  }
  if (type === 'predicates_value_map') return predicateValueMap(tag, helpers, depth + 1)
  if (type === 'item_component_patch') return componentMap(tag, helpers, depth + 1, true)
  if (type === 'item_component_values' || type === 'predicates_component_values') return componentValueMap(tag, helpers, depth + 1)

  const recordType = CHOICE_RECORD_TYPES[type]
  if (recordType) {
    if (tag.type === 'string') return validKey(tag.value, helpers)
    return tag.type === 'compound' ? persistentNbtValue(tag, recordType, helpers, depth + 1) : undefined
  }

  if (type === 'consumption_effect') {
    const effectType = stringValue(tag.value?.type)
    if (!effectType || !effectType.startsWith('minecraft:')) return undefined
    const branchType = helpers.codecType?.(`consumption_effect_${effectType.slice('minecraft:'.length)}`)
    return branchType === undefined ? undefined : persistentNbtValue(tag, branchType, helpers, depth + 1)
  }

  return null
}

function componentPredicateValue (name, tag, helpers, depth = 0) {
  if (depth > 32) return undefined
  if (name === 'damage') return recordWithDefaultBounds(tag, { durability: integerBound, damage: integerBound }, ['durability', 'damage'])
  if (name === 'enchantments' || name === 'stored_enchantments') {
    const values = listFromTag(tag)
    if (!values) return undefined
    const converted = values.map(value => recordWithDefaultBounds(value, {
      enchantments: holderSetValue,
      levels: integerBound
    }, ['levels']))
    return converted.includes(undefined) ? undefined : converted
  }
  if (name === 'potion_contents') {
    return recordFromTag(tag, {
      potions: holderSetValue,
      effects: value => collectionPredicate(value, mobEffectsPredicate)
    })
  }
  if (name === 'custom_data') return isNbtTag(tag) && tag.type === 'compound' ? tag : undefined
  if (name === 'container' || name === 'bundle_contents') {
    return recordFromTag(tag, { items: value => collectionPredicate(value, entry => itemPredicate(entry, helpers, depth + 1)) })
  }
  if (name === 'firework_explosion') {
    return recordFromTag(tag, {
      shape: stringValue,
      has_twinkle: booleanValue,
      has_trail: booleanValue
    })
  }
  if (name === 'fireworks') {
    return recordWithDefaultBounds(tag, {
      explosions: value => collectionPredicate(value, entry => recordFromTag(entry, {
        shape: stringValue,
        has_twinkle: booleanValue,
        has_trail: booleanValue
      })),
      flight_duration: integerBound
    }, ['flight_duration'])
  }
  if (name === 'writable_book_content') {
    return recordFromTag(tag, { pages: value => collectionPredicate(value, stringValue) })
  }
  if (name === 'written_book_content') {
    return recordWithDefaultBounds(tag, {
      pages: value => collectionPredicate(value, page => {
        if (page.type === 'compound') return { type: 'compound', name: '', value: page.value }
        if (page.type === 'list') return { type: 'list', name: '', value: page.value }
        return page
      }),
      author: stringValue,
      title: stringValue,
      generation: integerBound,
      resolved: booleanValue
    }, ['generation'])
  }
  if (name === 'attribute_modifiers') {
    return recordFromTag(tag, {
      modifiers: value => collectionPredicate(value, entry => recordWithDefaultBounds(entry, {
        attribute: holderSetValue,
        id: stringValue,
        amount: value => numberBound(value, 'double'),
        operation: stringValue,
        slot: stringValue
      }, ['amount']), integerBound)
    })
  }
  if (name === 'trim') {
    return recordFromTag(tag, { material: holderSetValue, pattern: holderSetValue })
  }
  if (name === 'jukebox_playable') return recordFromTag(tag, { song: holderSetValue })
  if (name === 'villager/variant') return holderSetValue(tag)
  return undefined
}

function convertPredicate (value, helpers) {
  if (!isRecord(value)) return undefined
  const result = {}

  if (value.blockSet != null) {
    const blockSet = Array.isArray(value.blockSet.blockIds)
      ? { ids: value.blockSet.blockIds }
      : value.blockSet
    const blocks = helpers.holderSet(blockSet, 'minecraft:block')
    if (blocks === undefined) return undefined
    if (typeof blocks === 'string') {
      const key = blocks.startsWith('#') ? `#${validKey(blocks.slice(1), helpers)}` : validKey(blocks, helpers)
      if (!key || key.endsWith('undefined')) return undefined
      result.blocks = key
    } else if (Array.isArray(blocks)) {
      const keys = helpers.all(blocks.map(block => validKey(block, helpers)))
      if (!keys) return undefined
      result.blocks = keys
    } else {
      return undefined
    }
  }

  if (value.properties != null) {
    const state = convertProperties(value.properties)
    if (state === undefined) return undefined
    result.state = state
  }
  if (value.nbt != null) {
    if (!isNbtTag(value.nbt) || value.nbt.type !== 'compound') return undefined
    result.nbt = value.nbt
  }

  const matchers = value.components
  if (matchers != null) {
    if (!isRecord(matchers) || !Array.isArray(matchers.exactMatchers) || !Array.isArray(matchers.partialMatchers)) return undefined
    if (matchers.exactMatchers.length) {
      const components = {}
      for (const matcher of matchers.exactMatchers) {
        if (!isRecord(matcher) || !Object.hasOwn(matcher, 'data')) return undefined
        const name = helpers.componentName(matcher.type)
        if (!name) return undefined
        if (TRANSIENT_COMPONENTS.has(name)) continue
        const componentKey = `minecraft:${name}`
        if (Object.hasOwn(components, componentKey)) return undefined
        const component = helpers.componentValue(name, matcher.data)
        if (component === undefined) return undefined
        components[componentKey] = component
      }
      if (Object.keys(components).length) result.components = components
    }
    if (matchers.partialMatchers.length) {
      const predicates = {}
      for (const matcher of matchers.partialMatchers) {
        if (!isRecord(matcher) || typeof matcher.isPredicate !== 'boolean' || !isNbtTag(matcher.data)) return undefined
        const name = matcher.isPredicate
          ? helpers.predicateTypeName(matcher.type)
          : helpers.componentName(matcher.type)
        if (!name) return undefined
        const typeKey = `minecraft:${name}`
        if (Object.hasOwn(predicates, typeKey)) return undefined
        if (!matcher.isPredicate) {
          if (matcher.data.type !== 'compound' || Object.keys(matcher.data.value).length !== 0) return undefined
          predicates[typeKey] = {}
        } else {
          const value = componentPredicateValue(name, matcher.data, helpers)
          if (value === undefined) return undefined
          predicates[typeKey] = value
        }
      }
      if (Object.keys(predicates).length) result.predicates = predicates
    }
  }
  return result
}

function convert (value, helpers) {
  if (!Array.isArray(value?.predicates)) return undefined
  if (value.predicates.length === 0) return undefined
  const predicates = helpers.all(value.predicates.map(predicate => convertPredicate(predicate, helpers)))
  if (!predicates) return undefined
  return predicates.length === 1 ? predicates[0] : predicates
}

const ids = ['can_place_on', 'can_break']
const predicateTypes = {
  predicates_block_holder_set: [value => { throw new Error('write only') }, function (value, buffer, offset, args, context) {
    const type = typeof value === 'string' ? 'string' : Array.isArray(value) ? ['list', 'string'] : undefined
    if (!type) throw new Error('invalid block holder set')
    return this.write(value, buffer, offset, type, context)
  }, function (value, args, context) {
    const type = typeof value === 'string' ? 'string' : Array.isArray(value) ? ['list', 'string'] : undefined
    if (!type) throw new Error('invalid block holder set')
    return this.sizeOf(value, type, context)
  }],
  predicates_property: [value => { throw new Error('write only') }, function (value, buffer, offset, args, context) {
    const type = typeof value === 'string' ? 'string' : isRecord(value) ? 'predicates_property_range' : undefined
    if (!type) throw new Error('invalid property matcher')
    return this.write(value, buffer, offset, type, context)
  }, function (value, args, context) {
    const type = typeof value === 'string' ? 'string' : isRecord(value) ? 'predicates_property_range' : undefined
    if (!type) throw new Error('invalid property matcher')
    return this.sizeOf(value, type, context)
  }],
  predicates_property_range: ['map', {
    min: { type: 'string', optional: true },
    max: { type: 'string', optional: true }
  }],
  predicates_state: ['dict', 'predicates_property'],
  predicates_block: ['map', {
    blocks: { type: 'predicates_block_holder_set', optional: true },
    state: { type: 'predicates_state', optional: true },
    nbt: { type: 'nbt', optional: true },
    components: { type: 'predicates_component_values', optional: true },
    predicates: { type: 'predicates_value_map', optional: true }
  }],
  predicates_compact_list: [value => { throw new Error('write only') }, function (value, buffer, offset, args, context) {
    const type = Array.isArray(value) ? ['list', 'predicates_block'] : 'predicates_block'
    return this.write(value, buffer, offset, type, context)
  }, function (value, args, context) {
    const type = Array.isArray(value) ? ['list', 'predicates_block'] : 'predicates_block'
    return this.sizeOf(value, type, context)
  }]
}
const components = { can_place_on: 'predicates_compact_list', can_break: 'predicates_compact_list' }
const converters = { can_place_on: convert, can_break: convert }
const predicateValueTypes = {
  damage: 'predicates_damage',
  enchantments: 'predicates_enchantment_list',
  stored_enchantments: 'predicates_enchantment_list',
  potion_contents: 'predicates_potions',
  custom_data: 'nbt',
  container: 'predicates_nested_items',
  bundle_contents: 'predicates_nested_items',
  firework_explosion: 'predicates_firework_explosion',
  fireworks: 'predicates_fireworks',
  writable_book_content: 'predicates_writable_book',
  written_book_content: 'predicates_written_book',
  attribute_modifiers: 'predicates_attributes',
  trim: 'predicates_trim',
  jukebox_playable: 'predicates_jukebox_playable',
  'villager/variant': 'predicates_holder_set',
  custom_name: 'predicates_any_value',
  item_name: 'predicates_any_value',
  damage_resistant: 'predicates_any_value',
  unbreakable: 'predicates_any_value',
  max_damage: 'predicates_any_value',
  max_stack_size: 'predicates_any_value',
  count: 'predicates_any_value',
  dyed_color: 'predicates_any_value',
  enchantment_glint_override: 'predicates_any_value'
}

function predicateMatcherType (name, value) {
  const type = predicateValueTypes[name]
  if (type === 'predicates_any_value') return isRecord(value) && Object.keys(value).length === 0 ? type : undefined
  if (type) return type
  return isRecord(value) && Object.keys(value).length === 0 ? 'predicates_any_value' : undefined
}

const types = {
  ...predicateTypes,
  predicates_any_value: ['map', {}],
  predicates_holder_set: [value => { throw new Error('write only') }, function (value, buffer, offset, args, context) {
    const type = typeof value === 'string' ? 'string' : Array.isArray(value) ? ['list', 'string'] : undefined
    if (!type) throw new Error('invalid predicate holder set')
    return this.write(value, buffer, offset, type, context)
  }, function (value, args, context) {
    const type = typeof value === 'string' ? 'string' : Array.isArray(value) ? ['list', 'string'] : undefined
    if (!type) throw new Error('invalid predicate holder set')
    return this.sizeOf(value, type, context)
  }],
  predicates_int_bound: [value => { throw new Error('write only') }, function (value, buffer, offset, args, context) {
    const type = Number.isInteger(value) ? 'int' : isRecord(value) ? 'predicates_int_range' : undefined
    if (!type) throw new Error('invalid integer predicate bound')
    return this.write(value, buffer, offset, type, context)
  }, function (value, args, context) {
    const type = Number.isInteger(value) ? 'int' : isRecord(value) ? 'predicates_int_range' : undefined
    if (!type) throw new Error('invalid integer predicate bound')
    return this.sizeOf(value, type, context)
  }],
  predicates_int_range: ['map', { min: { type: 'int', optional: true }, max: { type: 'int', optional: true } }],
  predicates_double_bound: [value => { throw new Error('write only') }, function (value, buffer, offset, args, context) {
    const type = Number.isFinite(value) ? 'double' : isRecord(value) ? 'predicates_double_range' : undefined
    if (!type) throw new Error('invalid double predicate bound')
    return this.write(value, buffer, offset, type, context)
  }, function (value, args, context) {
    const type = Number.isFinite(value) ? 'double' : isRecord(value) ? 'predicates_double_range' : undefined
    if (!type) throw new Error('invalid double predicate bound')
    return this.sizeOf(value, type, context)
  }],
  predicates_double_range: ['map', { min: { type: 'double', optional: true }, max: { type: 'double', optional: true } }],
  predicates_enchantment: ['map', {
    enchantments: { type: 'predicates_holder_set', optional: true },
    levels: { type: 'predicates_int_bound', optional: true }
  }],
  predicates_enchantment_list: ['list', 'predicates_enchantment'],
  predicates_damage: ['map', {
    durability: { type: 'predicates_int_bound', optional: true },
    damage: { type: 'predicates_int_bound', optional: true }
  }],
  predicates_firework_explosion: ['map', {
    shape: { type: 'string', optional: true },
    has_twinkle: { type: 'boolean', optional: true },
    has_trail: { type: 'boolean', optional: true }
  }],
  predicates_trim: ['map', {
    material: { type: 'predicates_holder_set', optional: true },
    pattern: { type: 'predicates_holder_set', optional: true }
  }],
  predicates_jukebox_playable: ['map', { song: { type: 'predicates_holder_set', optional: true } }],
  predicates_collection_item: ['map', {
    contains: { type: ['list', 'predicates_item'], optional: true },
    count: { type: ['list', ['map', { test: 'predicates_item', count: 'predicates_int_bound' }]], optional: true },
    size: { type: 'predicates_int_bound', optional: true }
  }],
  predicates_collection_mob_effects: ['map', {
    contains: { type: ['list', 'predicates_mob_effects'], optional: true },
    count: { type: ['list', ['map', { test: 'predicates_mob_effects', count: 'predicates_int_bound' }]], optional: true },
    size: { type: 'predicates_int_bound', optional: true }
  }],
  predicates_collection_firework: ['map', {
    contains: { type: ['list', 'predicates_firework_explosion'], optional: true },
    count: { type: ['list', ['map', { test: 'predicates_firework_explosion', count: 'predicates_int_bound' }]], optional: true },
    size: { type: 'predicates_int_bound', optional: true }
  }],
  predicates_collection_string: ['map', {
    contains: { type: ['list', 'string'], optional: true },
    count: { type: ['list', ['map', { test: 'string', count: 'predicates_int_bound' }]], optional: true },
    size: { type: 'predicates_int_bound', optional: true }
  }],
  predicates_collection_text: ['map', {
    contains: { type: ['list', 'text'], optional: true },
    count: { type: ['list', ['map', { test: 'text', count: 'predicates_int_bound' }]], optional: true },
    size: { type: 'predicates_int_bound', optional: true }
  }],
  predicates_collection_attribute: ['map', {
    contains: { type: ['list', 'predicates_attribute_entry'], optional: true },
    count: { type: ['list', ['map', { test: 'predicates_attribute_entry', count: 'predicates_int_bound' }]], optional: true },
    size: { type: 'predicates_int_bound', optional: true }
  }],
  predicates_mob_effect: ['map', {
    amplifier: { type: 'predicates_int_bound', optional: true, default: {} },
    duration: { type: 'predicates_int_bound', optional: true, default: {} },
    ambient: { type: 'boolean', optional: true },
    visible: { type: 'boolean', optional: true }
  }],
  predicates_mob_effects: ['dict', 'predicates_mob_effect'],
  predicates_item: ['map', {
    items: { type: 'predicates_holder_set', optional: true },
    count: { type: 'predicates_int_bound', optional: true, default: {} },
    components: { type: 'predicates_component_values', optional: true, default: {} },
    predicates: { type: 'predicates_value_map', optional: true, default: {} }
  }],
  predicates_potions: ['map', {
    potions: { type: 'predicates_holder_set', optional: true },
    effects: { type: 'predicates_collection_mob_effects', optional: true }
  }],
  predicates_nested_items: ['map', { items: { type: 'predicates_collection_item', optional: true } }],
  predicates_fireworks: ['map', {
    explosions: { type: 'predicates_collection_firework', optional: true },
    flight_duration: { type: 'predicates_int_bound', optional: true, default: {} }
  }],
  predicates_writable_book: ['map', { pages: { type: 'predicates_collection_string', optional: true } }],
  predicates_written_book: ['map', {
    pages: { type: 'predicates_collection_text', optional: true },
    author: { type: 'string', optional: true },
    title: { type: 'string', optional: true },
    generation: { type: 'predicates_int_bound', optional: true, default: {} },
    resolved: { type: 'boolean', optional: true }
  }],
  predicates_attribute_entry: ['map', {
    attribute: { type: 'predicates_holder_set', optional: true },
    id: { type: 'string', optional: true },
    amount: { type: 'predicates_double_bound', optional: true, default: {} },
    operation: { type: 'string', optional: true },
    slot: { type: 'string', optional: true }
  }],
  predicates_attributes: ['map', { modifiers: { type: 'predicates_collection_attribute', optional: true } }],
  predicates_value_map: [value => { throw new Error('write only') }, function (value, buffer, offset, args, context) {
    if (!isRecord(value)) throw new Error('invalid predicate matcher map')
    const fields = {}
    for (const key of Object.keys(value)) {
      const name = key.startsWith('minecraft:') ? key.slice('minecraft:'.length) : undefined
      const type = name && predicateMatcherType(name, value[key])
      if (!type) throw new Error(`unsupported predicate matcher ${key}`)
      fields[key] = type
    }
    return this.write(value, buffer, offset, ['map', fields], context)
  }, function (value, args, context) {
    if (!isRecord(value)) throw new Error('invalid predicate matcher map')
    const fields = {}
    for (const key of Object.keys(value)) {
      const name = key.startsWith('minecraft:') ? key.slice('minecraft:'.length) : undefined
      const type = name && predicateMatcherType(name, value[key])
      if (!type) throw new Error(`unsupported predicate matcher ${key}`)
      fields[key] = type
    }
    return this.sizeOf(value, ['map', fields], context)
  }]
}

module.exports = { ids, types, components, converters }
