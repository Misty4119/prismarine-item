'use strict'

const REGISTRY_ARRAYS = {
  'minecraft:block': 'blocksArray',
  'minecraft:item': 'itemsArray',
  'minecraft:entity_type': 'entitiesArray',
  'minecraft:mob_effect': 'effectsArray',
  'minecraft:enchantment': 'enchantmentsArray',
  'minecraft:attribute': 'attributesArray',
  'minecraft:particle_type': 'particlesArray',
  'minecraft:sound_event': 'soundsArray',
  'minecraft:instrument': 'instrumentsArray'
}

function createHelpers (registry, convertComponentValue, codecTypes = {}, componentShapes = {}) {
  const MAX_ITEM_STACK_TEMPLATE_DEPTH = 32
  let itemStackTemplateDepth = 0
  const componentNames = registry.protocol?.types?.SlotComponentType?.[1]?.mappings

  const key = name => {
    if (typeof name !== 'string' || name.length === 0) return undefined
    return name.includes(':') ? name : `minecraft:${name}`
  }
  const componentIds = new Map(Object.entries(componentNames ?? {}).map(([id, name]) => [name, Number(id)]))
  const predicateTypeNames = registry.protocol?.types?.DataComponentPredicateType?.[1]?.mappings
  const predicateTypeIds = new Map(Object.entries(predicateTypeNames ?? {}).map(([id, name]) => [name, Number(id)]))

  function registryEntry (registryName, id) {
    if (!Number.isInteger(id) || id < 0) return undefined
    const name = key(registryName)
    if (!name) return undefined

    const dynamicEntries = registry.loginPacket?.dimensionCodec?.[name]?.entries
    if (Array.isArray(dynamicEntries)) return dynamicEntries[id]?.key

    const arrayName = REGISTRY_ARRAYS[name]
    const entries = arrayName && registry[arrayName]
    if (!Array.isArray(entries)) return undefined
    const indexed = entries[id]
    // The protocol-777 sound holder carries the registry's zero-based entry
    // index, while minecraft-data's soundsArray items retain their one-based
    // `id` field. Keep the live index for 26.3 sound events (for example,
    // wire id 701 is entity.generic.drink, data id 702).
    if (name === 'minecraft:sound_event' && registry.version?.majorVersion === '26.3') {
      if (typeof indexed?.name === 'string') return key(indexed.name)
      if (typeof indexed?.resource === 'string') return key(indexed.resource)
      return undefined
    }
    const entry = indexed?.id === id ? indexed : entries.find(entry => entry?.id === id)
    if (typeof entry?.name === 'string') return key(entry.name)
    if (typeof entry?.resource === 'string') return key(entry.resource)
    return undefined
  }

  function holderSet (value, registryName) {
    if (!value || typeof value !== 'object') return undefined
    if (typeof value.name === 'string') {
      const tag = value.name.startsWith('#') ? value.name.slice(1) : value.name
      const resource = key(tag)
      return resource && `#${resource}`
    }
    if (!Array.isArray(value.ids)) return undefined
    const entries = value.ids.map(id => registryEntry(registryName, id))
    if (entries.some(entry => entry === undefined)) return undefined
    return entries.length === 1 ? entries[0] : entries
  }

  function holder (value, registryName, idField, dataField = 'data', convertData) {
    if (!value || typeof value !== 'object') return undefined
    if (Number.isInteger(value[idField])) return registryEntry(registryName, value[idField])
    if (dataField in value && typeof convertData === 'function') return convertData(value[dataField])
    return undefined
  }

  function soundEventData (value) {
    if (!value || typeof value !== 'object' || typeof value.soundName !== 'string') return undefined
    const soundId = key(value.soundName)
    if (!soundId || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(soundId)) return undefined
    if (value.fixedRange == null) return { sound_id: soundId }
    if (typeof value.fixedRange !== 'number' || !Number.isFinite(value.fixedRange) || value.fixedRange < 0) return undefined
    return { sound_id: soundId, range: value.fixedRange }
  }

  function soundEvent (value) {
    return holder(value, 'minecraft:sound_event', 'soundId', 'data', soundEventData)
  }

  function enumValue (value, values) {
    if (Array.isArray(values) && Number.isInteger(value)) return values[value]
    if (Array.isArray(values) && typeof value === 'string' && values.includes(value)) return value
    return undefined
  }

  function all (values) {
    return Array.isArray(values) && !values.includes(undefined) ? values : undefined
  }

  function componentName (id) {
    if (typeof id === 'string') return componentIds.has(id) ? id : undefined
    if (!Number.isInteger(id) || id < 0) return undefined
    const name = componentNames?.[id]
    return typeof name === 'string' ? name : undefined
  }

  function componentId (name) {
    return componentIds.get(name)
  }

  function predicateTypeName (id) {
    if (typeof id === 'string') return predicateTypeIds.has(id) ? id : undefined
    if (!Number.isInteger(id) || id < 0) return undefined
    const name = predicateTypeNames?.[id]
    return typeof name === 'string' ? name : undefined
  }

  function itemStackTemplate (value, convertComponent) {
    if (itemStackTemplateDepth >= MAX_ITEM_STACK_TEMPLATE_DEPTH ||
        !value || typeof value !== 'object' || Array.isArray(value) ||
        !Number.isInteger(value.itemId) || value.itemId < 0 ||
        !Number.isInteger(value.itemCount) || value.itemCount < 1 || value.itemCount > 99 ||
        !Array.isArray(value.components) || !Array.isArray(value.removeComponents)) return undefined

    if ((value.addedComponentCount !== undefined && value.addedComponentCount !== value.components.length) ||
        (value.removedComponentCount !== undefined && value.removedComponentCount !== value.removeComponents.length)) return undefined

    const indexedItem = registry.itemsArray?.[value.itemId]
    const item = indexedItem?.id === value.itemId
      ? indexedItem
      : registry.itemsArray?.find(entry => entry?.id === value.itemId)
    const itemKey = typeof item?.name === 'string' ? key(item.name) : undefined
    if (!itemKey) return undefined

    itemStackTemplateDepth++
    try {
      const components = {}
      const added = new Set()
      const removed = new Set()
      const convert = convertComponent ?? componentValue
      for (const component of value.components) {
        if (!component || typeof component !== 'object' || Array.isArray(component) ||
            componentName(component.type) === undefined || !Object.prototype.hasOwnProperty.call(component, 'data')) return undefined
        const name = componentName(component.type)
        const componentKey = name && key(name)
        if (!componentKey || added.has(componentKey) || typeof convert !== 'function') return undefined
        let codecValue
        try {
          codecValue = convert(name, component.data)
        } catch {
          return undefined
        }
        if (codecValue === undefined) return undefined
        added.add(componentKey)
        components[componentKey] = codecValue
      }

      for (const component of value.removeComponents) {
        if (!component || typeof component !== 'object' || Array.isArray(component) || componentName(component.type) === undefined) return undefined
        const name = componentName(component.type)
        const componentKey = name && key(name)
        if (!componentKey || added.has(componentKey) || removed.has(componentKey)) return undefined
        removed.add(componentKey)
        components[`!${componentKey}`] = {}
      }

      const result = { id: itemKey }
      if (value.itemCount !== 1) result.count = value.itemCount
      if (Object.keys(components).length > 0) result.components = components
      return result
    } finally {
      itemStackTemplateDepth--
    }
  }

  function componentValue (name, value) {
    if (typeof convertComponentValue !== 'function') return undefined
    return convertComponentValue(name, value)
  }

  function codecType (name) {
    return codecTypes[name] ?? componentShapes[name]
  }

  function componentShape (name) {
    return componentShapes[name]
  }

  return { key, registryEntry, holder, holderSet, soundEvent, enumValue, all, componentId, componentName, predicateTypeName, componentValue, componentShape, codecType, itemStackTemplate }
}

module.exports = createHelpers
