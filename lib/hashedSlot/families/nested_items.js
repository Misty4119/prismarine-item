'use strict'

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isInt32 = value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647

function convertTemplate (value, helpers) {
  return helpers.itemStackTemplate(value)
}

function convertPotDecorations (value, helpers) {
  if (!isRecord(value)) return undefined
  const result = {}
  for (const face of ['back', 'left', 'right', 'front']) {
    if (!Object.hasOwn(value, face)) continue
    if (value[face] == null) continue
    const item = helpers.itemStackTemplate(value[face])
    if (item === undefined) return undefined
    result[face] = item
  }
  return result
}

function convertBees (value, helpers) {
  if (!isRecord(value) || !Array.isArray(value.bees)) return undefined
  const bees = []
  for (const bee of value.bees) {
    if (!isRecord(bee) || !isRecord(bee.nbtData) || bee.nbtData.type !== 'compound' || !isRecord(bee.nbtData.value) ||
        !isInt32(bee.ticksInHive) || !isInt32(bee.minTicksInHive)) return undefined
    const entityId = helpers.registryEntry('minecraft:entity_type', bee.entityType)
    if (entityId === undefined) return undefined
    bees.push({
      entity_data: {
        type: 'compound',
        value: { ...bee.nbtData.value, id: { type: 'string', value: entityId } }
      },
      ticks_in_hive: bee.ticksInHive,
      min_ticks_in_hive: bee.minTicksInHive
    })
  }
  return bees
}

const ids = ['use_remainder', 'pot_decorations', 'bees', 'sulfur_cube_content']
const types = {
  nested_pot_decorations: ['map', {
    back: { type: 'item_stack_template', optional: true },
    left: { type: 'item_stack_template', optional: true },
    right: { type: 'item_stack_template', optional: true },
    front: { type: 'item_stack_template', optional: true }
  }],
  nested_bee: ['map', {
    entity_data: 'nbt',
    ticks_in_hive: 'int',
    min_ticks_in_hive: 'int'
  }],
  nested_bees: ['list', 'nested_bee']
}

const components = {
  use_remainder: 'item_stack_template',
  pot_decorations: 'nested_pot_decorations',
  bees: 'nested_bees',
  sulfur_cube_content: 'item_stack_template'
}

const converters = {
  use_remainder: convertTemplate,
  pot_decorations: convertPotDecorations,
  bees: convertBees,
  sulfur_cube_content: convertTemplate
}

module.exports = { ids, types, components, converters }
