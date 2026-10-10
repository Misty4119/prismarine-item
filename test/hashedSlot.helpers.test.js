/* eslint-env mocha */

const assert = require('assert')
const createHelpers = require('../lib/hashedSlot/families/helpers')

describe('protocol 777 hashed component family helpers', () => {
  const registry = require('prismarine-registry')('26.3')
  const helpers = createHelpers(registry)

  it('normalizes namespaced and default-namespace resource keys', () => {
    assert.strictEqual(helpers.key('minecraft:zombie'), 'minecraft:zombie')
    assert.strictEqual(helpers.key('test:custom'), 'test:custom')
    assert.strictEqual(helpers.key('zombie'), 'minecraft:zombie')
  })

  it('resolves registry IDs from synchronized dynamic registries and data registries', () => {
    const damageType = registry.loginPacket.dimensionCodec['minecraft:damage_type'].entries[0].key
    const damageId = registry.loginPacket.dimensionCodec['minecraft:damage_type'].entries.findIndex(entry => entry.key === damageType)
    assert.strictEqual(helpers.registryEntry('minecraft:damage_type', damageId), damageType)

    const zombieId = registry.entitiesByName.zombie.id
    assert.strictEqual(helpers.registryEntry('minecraft:entity_type', zombieId), 'minecraft:zombie')
    assert.strictEqual(helpers.registryEntry('minecraft:unknown', 0), undefined)
    assert.strictEqual(helpers.registryEntry('minecraft:entity_type', 999999), undefined)

    const drinkIndex = registry.soundsArray.findIndex(entry => entry.name === 'entity.generic.drink')
    assert.strictEqual(registry.soundsArray[drinkIndex].id, drinkIndex + 1, '26.3 sound data IDs are one-based, while the network carries the registry index')
    assert.strictEqual(helpers.registryEntry('minecraft:sound_event', drinkIndex), 'minecraft:entity.generic.drink')
  })

  it('converts holder sets into their compact persistent codec form', () => {
    const zombieId = registry.entitiesByName.zombie.id
    const skeletonId = registry.entitiesByName.skeleton.id

    assert.strictEqual(helpers.holderSet({ ids: [zombieId] }, 'minecraft:entity_type'), 'minecraft:zombie')
    assert.deepStrictEqual(helpers.holderSet({ ids: [zombieId, skeletonId] }, 'minecraft:entity_type'), [
      'minecraft:zombie', 'minecraft:skeleton'
    ])
    assert.deepStrictEqual(helpers.holderSet({ ids: [] }, 'minecraft:entity_type'), [])
    assert.strictEqual(helpers.holderSet({ name: 'minecraft:undead' }, 'minecraft:entity_type'), '#minecraft:undead')
    assert.strictEqual(helpers.holderSet({ name: '#undead' }, 'minecraft:entity_type'), '#minecraft:undead')
    assert.strictEqual(helpers.holderSet({ ids: [999999] }, 'minecraft:entity_type'), undefined)
  })

  it('maps numeric enums and rejects out-of-range values', () => {
    assert.strictEqual(helpers.enumValue(1, ['small', 'medium', 'large']), 'medium')
    assert.strictEqual(helpers.enumValue('large', ['small', 'medium', 'large']), 'large')
    assert.strictEqual(helpers.enumValue(3, ['small', 'medium', 'large']), undefined)
    assert.strictEqual(helpers.enumValue('missing', ['small', 'medium', 'large']), undefined)
  })

  it('converts nested item component patches recursively into persistent form', () => {
    const featherId = registry.itemsByName.feather.id
    const damageId = Object.entries(registry.protocol.types.SlotComponentType[1].mappings)
      .find(([, name]) => name === 'damage')[0]
    const enchantmentsId = Object.entries(registry.protocol.types.SlotComponentType[1].mappings)
      .find(([, name]) => name === 'enchantments')[0]
    const loreId = Object.entries(registry.protocol.types.SlotComponentType[1].mappings)
      .find(([, name]) => name === 'lore')[0]

    const stack = helpers.itemStackTemplate({
      itemId: featherId,
      itemCount: 2,
      components: [
        { type: Number(damageId), data: 3 },
        { type: Number(enchantmentsId), data: { enchantments: [] } }
      ],
      removeComponents: [{ type: Number(loreId) }]
    }, (name, value) => name === 'damage' ? value : { normalized: value })

    assert.deepStrictEqual(stack, {
      id: 'minecraft:feather',
      count: 2,
      components: {
        'minecraft:damage': 3,
        'minecraft:enchantments': { normalized: { enchantments: [] } },
        '!minecraft:lore': {}
      }
    })
  })

  it('rejects unknown, duplicate, malformed and excessively nested item patches', () => {
    const featherId = registry.itemsByName.feather.id
    const damageId = Number(Object.entries(registry.protocol.types.SlotComponentType[1].mappings)
      .find(([, name]) => name === 'damage')[0])
    const convert = (name, value) => value
    const template = { itemId: featherId, itemCount: 1, components: [], removeComponents: [] }

    assert.strictEqual(helpers.itemStackTemplate({ ...template, itemId: 999999 }, convert), undefined)
    assert.strictEqual(helpers.itemStackTemplate({ ...template, itemCount: 0 }, convert), undefined)
    assert.strictEqual(helpers.itemStackTemplate({ ...template, components: [{ type: 999999, data: 1 }] }, convert), undefined)
    assert.strictEqual(helpers.itemStackTemplate({ ...template, components: [{ type: Number(damageId), data: 1 }], removeComponents: [{ type: Number(damageId) }] }, convert), undefined)
    assert.strictEqual(helpers.itemStackTemplate({ ...template, components: 'malformed' }, convert), undefined)
    assert.strictEqual(helpers.itemStackTemplate({ ...template, components: [{ type: Number(damageId), data: 1 }] }, () => undefined), undefined)

    let nested = { ...template }
    for (let i = 0; i < 40; i++) {
      nested = {
        ...template,
        components: [{ type: Number(Object.entries(registry.protocol.types.SlotComponentType[1].mappings).find(([, name]) => name === 'use_remainder')[0]), data: nested }]
      }
    }
    const recursiveConvert = (name, value) => name === 'use_remainder' ? helpers.itemStackTemplate(value, recursiveConvert) : value
    assert.strictEqual(helpers.itemStackTemplate(nested, recursiveConvert), undefined)
  })
})
