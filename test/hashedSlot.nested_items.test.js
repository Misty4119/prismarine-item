/* eslint-env mocha */

const assert = require('assert')
const createHelpers = require('../lib/hashedSlot/families/helpers')
const family = require('../lib/hashedSlot/families/nested_items')

describe('protocol 777 nested item hashed component family', () => {
  const registry = require('prismarine-registry')('26.3')
  const componentId = name => Number(Object.entries(registry.protocol.types.SlotComponentType[1].mappings)
    .find(([, componentName]) => componentName === name)[0])
  const stack = (itemName, components = [], removeComponents = [], itemCount = 1) => ({
    itemId: registry.itemsByName[itemName].id,
    itemCount,
    addedComponentCount: components.length,
    removedComponentCount: removeComponents.length,
    components,
    removeComponents
  })
  const helpers = createHelpers(registry, (name, value) => {
    const convert = family.converters[name]
    if (convert) return convert(value, helpers)
    return name === 'damage' && Number.isInteger(value) ? value : undefined
  })
  const hashComponent = require('../lib/hashedSlot')(registry).hashComponent

  it('declares the four persistent codec shapes', () => {
    assert.deepStrictEqual(family.ids, ['use_remainder', 'pot_decorations', 'bees', 'sulfur_cube_content'])
    assert.deepStrictEqual(Object.keys(family.components).sort(), [...family.ids].sort())
    assert.strictEqual(family.components.use_remainder, 'item_stack_template')
    assert.strictEqual(family.components.sulfur_cube_content, 'item_stack_template')
    assert.deepStrictEqual(family.types.nested_pot_decorations, ['map', {
      back: { type: 'item_stack_template', optional: true },
      left: { type: 'item_stack_template', optional: true },
      right: { type: 'item_stack_template', optional: true },
      front: { type: 'item_stack_template', optional: true }
    }])
    assert.deepStrictEqual(family.types.nested_bee, ['map', {
      entity_data: 'nbt',
      ticks_in_hive: 'int',
      min_ticks_in_hive: 'int'
    }])
    assert.deepStrictEqual(family.types.nested_bees, ['list', 'nested_bee'])
    assert.strictEqual(family.components.bees, 'nested_bees')
  })

  it('converts remainder and sulfur cube item templates with recursive patches', () => {
    const inner = stack('feather', [{ type: componentId('damage'), data: 3 }], [{ type: componentId('lore') }], 2)
    const outer = stack('brick', [{ type: componentId('use_remainder'), data: inner }])
    const expectedInner = {
      id: 'minecraft:feather',
      count: 2,
      components: { 'minecraft:damage': 3, '!minecraft:lore': {} }
    }
    assert.deepStrictEqual(family.converters.use_remainder(inner, helpers), expectedInner)
    assert.deepStrictEqual(family.converters.sulfur_cube_content(outer, helpers), {
      id: 'minecraft:brick',
      components: { 'minecraft:use_remainder': expectedInner }
    })
    assert.deepStrictEqual(family.converters.use_remainder(stack('brick'), helpers), { id: 'minecraft:brick' })
  })

  it('hashes component patches on nested charged, bundled, and container items', () => {
    const nested = stack('diamond_pickaxe', [{ type: componentId('damage'), data: 3 }])
    assert.strictEqual(typeof hashComponent('charged_projectiles', { projectiles: [nested] }), 'number')
    assert.strictEqual(typeof hashComponent('bundle_contents', { contents: [nested] }), 'number')
    assert.strictEqual(typeof hashComponent('container', { contents: [nested] }), 'number')
  })

  it('converts optional pot faces and omits absent faces', () => {
    assert.deepStrictEqual(family.converters.pot_decorations({
      back: stack('brick'), left: null, right: stack('feather', [], [], 2), front: null
    }, helpers), { back: { id: 'minecraft:brick' }, right: { id: 'minecraft:feather', count: 2 } })
    assert.deepStrictEqual(family.converters.pot_decorations({ back: null, left: null, right: null, front: null }, helpers), {})
    assert.deepStrictEqual(family.converters.pot_decorations({ front: stack('brick') }, helpers), { front: { id: 'minecraft:brick' } })
    assert.strictEqual(family.converters.pot_decorations({ back: stack('brick'), left: stack('brick', [{ type: 999999, data: 1 }]), right: null, front: null }, helpers), undefined)
  })

  it('puts the registry entity key inside each bee persistent NBT tag', () => {
    const beeId = registry.entitiesByName.bee.id
    const payload = { type: 'compound', value: { HasNectar: { type: 'byte', value: 1 } } }
    assert.deepStrictEqual(family.converters.bees({ bees: [{ entityType: beeId, nbtData: payload, ticksInHive: 120, minTicksInHive: 600 }] }, helpers), [{
      entity_data: { type: 'compound', value: { id: { type: 'string', value: 'minecraft:bee' }, HasNectar: { type: 'byte', value: 1 } } },
      ticks_in_hive: 120,
      min_ticks_in_hive: 600
    }])
    assert.deepStrictEqual(payload, { type: 'compound', value: { HasNectar: { type: 'byte', value: 1 } } })
    assert.deepStrictEqual(family.converters.bees({ bees: [] }, helpers), [])
    assert.strictEqual(family.converters.bees({ bees: [{ entityType: 999999, nbtData: payload, ticksInHive: 0, minTicksInHive: 600 }] }, helpers), undefined)
    assert.strictEqual(family.converters.bees({ bees: [{ entityType: beeId, nbtData: { type: 'list', value: [] }, ticksInHive: 0, minTicksInHive: 600 }] }, helpers), undefined)
    assert.strictEqual(family.converters.bees({ bees: [{ entityType: beeId, nbtData: payload, ticksInHive: 2147483648, minTicksInHive: 600 }] }, helpers), undefined)
  })

  it('rejects unsupported nested values and excessive recursion', () => {
    assert.strictEqual(family.converters.use_remainder(stack('brick', [{ type: componentId('custom_data'), data: {} }]), helpers), undefined)
    assert.strictEqual(family.converters.sulfur_cube_content(stack('brick', [{ type: 999999, data: 1 }]), helpers), undefined)
    let nested = stack('brick')
    for (let i = 0; i < 40; i++) nested = stack('brick', [{ type: componentId('use_remainder'), data: nested }])
    assert.strictEqual(family.converters.use_remainder(nested, helpers), undefined)
  })
})
