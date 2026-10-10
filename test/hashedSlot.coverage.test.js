/* eslint-env mocha */

const assert = require('assert')
const hashedSlot = require('../lib/hashedSlot')

describe('protocol 777 hashed component coverage', () => {
  it('classifies each current component exactly once as hashable or not hashed', () => {
    const registry = require('prismarine-registry')('26.3')
    const { hashedTypes, NOT_HASHED } = hashedSlot(registry)
    const componentNames = Object.values(registry.protocol.types.SlotComponentType[1].mappings)
    const classified = [...hashedTypes, ...NOT_HASHED]

    assert.strictEqual(new Set(componentNames).size, 122)
    assert.strictEqual(new Set(classified).size, classified.length, 'component names must not appear in more than one family')
    assert.deepStrictEqual([...classified].sort(), [...componentNames].sort())
    assert.strictEqual(hashedTypes.length, 119)
    assert.strictEqual(NOT_HASHED.size, 3)
    assert.deepStrictEqual([...NOT_HASHED].sort(), ['additional_trade_cost', 'creative_slot_lock', 'map_post_processing'])
  })

  it('omits every explicit exclusion from HashedSlot while preserving component removals', () => {
    const registry = require('prismarine-registry')('26.3')
    const { hashComponent, NOT_HASHED } = hashedSlot(registry)
    const Item = require('../index')(registry)
    const item = new Item(registry.itemsByName.feather.id, 1)
    item.components = [...NOT_HASHED].map(type => ({ type, data: {} }))
    item.removedComponents = [{ type: 'lore' }]
    for (const type of NOT_HASHED) assert.strictEqual(hashComponent(type, {}), undefined)
    assert.deepStrictEqual(Item.toHashedNotch(item).components, [])
    assert.deepStrictEqual(Item.toHashedNotch(item).removeComponents, item.removedComponents)
  })
})
