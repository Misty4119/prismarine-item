/* eslint-env mocha */

const assert = require('assert')
const createProtoDef = require('../lib/hashOps').createProtoDef
const hashValue = require('../lib/hashOps').hashValue
const createHelpers = require('../lib/hashedSlot/families/helpers')
const family = require('../lib/hashedSlot/families/variants')

const ids = [
  'villager/variant',
  'wolf/variant',
  'wolf/sound_variant',
  'fox/variant',
  'salmon/size',
  'parrot/variant',
  'tropical_fish/pattern',
  'mooshroom/variant',
  'rabbit/variant',
  'pig/variant',
  'pig/sound_variant',
  'cow/variant',
  'cow/sound_variant',
  'chicken/variant',
  'chicken/sound_variant',
  'zombie_nautilus/variant',
  'frog/variant',
  'horse/variant',
  'painting/variant',
  'llama/variant',
  'axolotl/variant',
  'cat/variant',
  'cat/sound_variant'
]

const registryNames = {
  'wolf/variant': ['minecraft:wolf_variant', 'minecraft:ashen'],
  'wolf/sound_variant': ['minecraft:wolf_sound_variant', 'minecraft:angry'],
  'pig/variant': ['minecraft:pig_variant', 'minecraft:cold'],
  'pig/sound_variant': ['minecraft:pig_sound_variant', 'minecraft:big'],
  'cow/variant': ['minecraft:cow_variant', 'minecraft:cold'],
  'cow/sound_variant': ['minecraft:cow_sound_variant', 'minecraft:classic'],
  'chicken/variant': ['minecraft:chicken_variant', 'minecraft:cold'],
  'chicken/sound_variant': ['minecraft:chicken_sound_variant', 'minecraft:classic'],
  'zombie_nautilus/variant': ['minecraft:zombie_nautilus_variant', 'minecraft:temperate'],
  'frog/variant': ['minecraft:frog_variant', 'minecraft:cold'],
  'painting/variant': ['minecraft:painting_variant', 'minecraft:alban'],
  'cat/variant': ['minecraft:cat_variant', 'minecraft:all_black'],
  'cat/sound_variant': ['minecraft:cat_sound_variant', 'minecraft:classic']
}

describe('protocol 777 hashed variant components', () => {
  const registry = require('prismarine-registry')('26.3')
  const helpers = createHelpers(registry)
  const proto = createProtoDef()

  if (family.types) proto.addTypes(family.types)
  proto.addTypes(family.components)

  it('declares every variant component once with a codec shape and converter', () => {
    assert.deepStrictEqual(family.ids, ids)
    assert.deepStrictEqual(Object.keys(family.components).sort(), [...ids].sort())
    assert.deepStrictEqual(Object.keys(family.converters).sort(), [...ids].sort())
    for (const id of ids) assert.ok(family.components[id], `${id} needs a persistent codec shape`)
  })

  it('converts built-in 26.3 ordinals, including their declared defaults', () => {
    const cases = [
      ['villager/variant', 2, 'minecraft:plains'],
      ['fox/variant', 0, 'red'],
      ['fox/variant', 1, 'snow'],
      ['salmon/size', 1, 'medium'],
      ['parrot/variant', 0, 'red_blue'],
      ['tropical_fish/pattern', 0, 'kob'],
      ['tropical_fish/pattern', 256, 'sunstreak'],
      ['tropical_fish/pattern', 1281, 'clayfish'],
      ['mooshroom/variant', 0, 'red'],
      ['mooshroom/variant', 1, 'brown'],
      ['rabbit/variant', 0, 'brown'],
      ['rabbit/variant', 99, 'evil'],
      ['horse/variant', 0, 'white'],
      ['horse/variant', 6, 'dark_brown'],
      ['llama/variant', 0, 'creamy'],
      ['axolotl/variant', 0, 'lucy'],
      ['axolotl/variant', 4, 'blue']
    ]

    for (const [id, input, expected] of cases) {
      const converted = family.converters[id](input, helpers)
      assert.strictEqual(converted, expected, `${id} ordinal ${input}`)
      assert.doesNotThrow(() => hashValue(proto, converted, family.components[id]), `${id} should hash in codec form`)
    }
  })

  it('resolves all synchronized variants through the login registry codec', () => {
    for (const [id, [registryName, expected]] of Object.entries(registryNames)) {
      const registryId = registry.loginPacket.dimensionCodec[registryName].entries.findIndex(entry => entry.key === expected)
      assert.notStrictEqual(registryId, -1, `${expected} must exist in ${registryName}`)

      let input = registryId
      if (id === 'chicken/variant' || id === 'chicken/sound_variant' || id === 'zombie_nautilus/variant' || id === 'painting/variant') {
        input = { variantId: registryId }
      }

      const converted = family.converters[id](input, helpers)
      assert.strictEqual(converted, expected, `${id} registry entry`)
      assert.doesNotThrow(() => hashValue(proto, converted, family.components[id]), `${id} should hash in codec form`)
    }
  })

  it('resolves default dynamic variants and sound sets to their registered keys', () => {
    const cases = [
      ['wolf/variant', 3, 'minecraft:wolf_variant', 'minecraft:pale'],
      ['wolf/sound_variant', 2, 'minecraft:wolf_sound_variant', 'minecraft:classic'],
      ['pig/variant', 1, 'minecraft:pig_variant', 'minecraft:temperate'],
      ['pig/sound_variant', 1, 'minecraft:pig_sound_variant', 'minecraft:classic'],
      ['cow/variant', 1, 'minecraft:cow_variant', 'minecraft:temperate'],
      ['cow/sound_variant', 0, 'minecraft:cow_sound_variant', 'minecraft:classic'],
      ['chicken/variant', 1, 'minecraft:chicken_variant', 'minecraft:temperate'],
      ['chicken/sound_variant', 0, 'minecraft:chicken_sound_variant', 'minecraft:classic'],
      ['zombie_nautilus/variant', 0, 'minecraft:zombie_nautilus_variant', 'minecraft:temperate'],
      ['frog/variant', 1, 'minecraft:frog_variant', 'minecraft:temperate'],
      ['cat/sound_variant', 0, 'minecraft:cat_sound_variant', 'minecraft:classic']
    ]

    for (const [id, registryId, registryName, expected] of cases) {
      assert.strictEqual(registry.loginPacket.dimensionCodec[registryName].entries[registryId].key, expected)
      const input = id === 'chicken/variant' || id === 'chicken/sound_variant' || id === 'zombie_nautilus/variant'
        ? { variantId: registryId }
        : registryId
      assert.strictEqual(family.converters[id](input, helpers), expected, `${id} default key`)
    }
  })

  it('converts direct holder data and preserves optional painting text fields', () => {
    const chicken = family.converters['chicken/variant']({ variantData: 'test:chicken_variant' }, helpers)
    assert.strictEqual(chicken, 'test:chicken_variant')
    assert.strictEqual(family.converters['chicken/sound_variant']({ variantData: 'test:chicken_sounds' }, helpers), 'test:chicken_sounds')
    assert.strictEqual(family.converters['zombie_nautilus/variant']({ variantData: 'test:nautilus_variant' }, helpers), 'test:nautilus_variant')

    const painting = {
      width: 2,
      height: 1,
      assetId: 'test:painting',
      title: { type: 'string', value: 'Title' }
    }
    const converted = family.converters['painting/variant']({ data: painting }, helpers)
    assert.deepStrictEqual(converted, {
      width: 2,
      height: 1,
      asset_id: 'test:painting',
      title: painting.title
    })
    assert.doesNotThrow(() => hashValue(proto, converted, family.components['painting/variant']))
  })

  it('rejects invalid ordinals, unknown registry IDs, and malformed direct holders', () => {
    const invalid = [
      ['villager/variant', -1],
      ['fox/variant', 2],
      ['salmon/size', 3],
      ['parrot/variant', 5],
      ['tropical_fish/pattern', 2],
      ['mooshroom/variant', 2],
      ['rabbit/variant', 6],
      ['horse/variant', 7],
      ['llama/variant', 4],
      ['axolotl/variant', 5]
    ]
    for (const [id, input] of invalid) {
      assert.strictEqual(family.converters[id](input, helpers), undefined, `${id} invalid ordinal ${input}`)
    }

    for (const id of Object.keys(registryNames)) {
      const input = id === 'chicken/variant' || id === 'chicken/sound_variant' || id === 'zombie_nautilus/variant' || id === 'painting/variant'
        ? { variantId: 999999 }
        : 999999
      assert.strictEqual(family.converters[id](input, helpers), undefined, `${id} unknown registry id`)
    }

    assert.strictEqual(family.converters['chicken/variant']({ variantData: '' }, helpers), undefined)
    assert.strictEqual(family.converters['painting/variant']({ data: { width: 0, height: 1, assetId: 'bad:painting' } }, helpers), undefined)
    assert.strictEqual(family.converters['painting/variant']({ data: { width: 1, height: 1, assetId: '' } }, helpers), undefined)
  })
})
