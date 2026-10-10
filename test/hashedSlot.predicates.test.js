/* eslint-env mocha */

const assert = require('assert')
const { createProtoDef, hashValue } = require('../lib/hashOps')
const hashedSlot = require('../lib/hashedSlot')
const createHelpers = require('../lib/hashedSlot/families/helpers')
const family = require('../lib/hashedSlot/families/predicates')

describe('protocol 777 predicate hashed component family', () => {
  const registry = require('prismarine-registry')('26.3')
  const helpers = createHelpers(registry, (name, data) => name === 'damage' ? data : undefined)
  const hashComponent = hashedSlot(registry).hashComponent

  it('declares both IDs and exact persistent codec shapes', () => {
    assert.deepStrictEqual(family.ids, ['can_place_on', 'can_break'])
    assert.deepStrictEqual(Object.keys(family.components).sort(), [...family.ids].sort())
    assert.strictEqual(family.components.can_place_on, 'predicates_compact_list')
    assert.deepStrictEqual(family.types.predicates_property_range, ['map', {
      min: { type: 'string', optional: true },
      max: { type: 'string', optional: true }
    }])
    assert.deepStrictEqual(family.types.predicates_state, ['dict', 'predicates_property'])
    assert.deepStrictEqual(family.types.predicates_block, ['map', {
      blocks: { type: 'predicates_block_holder_set', optional: true },
      state: { type: 'predicates_state', optional: true },
      nbt: { type: 'nbt', optional: true },
      components: { type: 'predicates_component_values', optional: true },
      predicates: { type: 'predicates_value_map', optional: true }
    }])
  })

  it('accepts prismarine-nbt bare list payloads and compact holder-set forms', () => {
    const stringList = { type: 'list', value: { type: 'string', value: ['minecraft:sharpness', 'minecraft:unbreaking'] } }
    const enchantmentList = {
      type: 'list',
      value: {
        type: 'compound',
        value: [
          { enchantments: { type: 'string', value: 'minecraft:sharpness' }, levels: { type: 'int', value: 2 } },
          { enchantments: stringList, levels: { type: 'int', value: 3 } }
        ]
      }
    }
    const matcher = {
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: {
          exactMatchers: [],
          partialMatchers: [{ isPredicate: true, type: 1, data: enchantmentList }]
        }
      }]
    }

    assert.deepStrictEqual(family.converters.can_break(matcher, helpers), {
      predicates: {
        'minecraft:enchantments': [
          { enchantments: 'minecraft:sharpness', levels: 2 },
          { enchantments: ['minecraft:sharpness', 'minecraft:unbreaking'], levels: 3 }
        ]
      }
    })
    assert.strictEqual(typeof hashComponent('can_break', matcher), 'number')
  })

  it('hashes every registered 26.3 partial predicate codec family', () => {
    const tag = (type, value) => ({ type, name: '', value })
    const compound = value => tag('compound', value)
    const strings = values => tag('list', { type: 'string', value: values })
    const compounds = values => tag('list', { type: 'compound', value: values })
    const emptyItem = {}
    const cases = [
      compound({ damage: tag('int', 5) }),
      compounds([{ enchantments: tag('string', 'minecraft:sharpness'), levels: tag('int', 2) }]),
      compounds([{ enchantments: strings(['minecraft:sharpness', 'minecraft:unbreaking']), levels: tag('int', 2) }]),
      compound({ potions: strings(['minecraft:water', 'minecraft:awkward']), effects: compound({ contains: compounds([{ 'minecraft:speed': compound({ amplifier: tag('int', 1), ambient: tag('byte', 1) }) }]) }) }),
      compound({ CustomFlag: tag('byte', 1) }),
      compound({ items: compound({ contains: compounds([emptyItem]), size: tag('int', 1) }) }),
      compound({ items: compound({ count: compounds([{ test: compound(emptyItem), count: tag('int', 2) }]) }) }),
      compound({ shape: tag('string', 'star'), has_twinkle: tag('byte', 1), has_trail: tag('byte', 0) }),
      compound({ explosions: compound({ contains: compounds([{ has_twinkle: tag('byte', 1) }]) }), flight_duration: tag('int', 2) }),
      compound({ pages: compound({ contains: strings(['hello', 'world']) }) }),
      compound({ pages: compound({ contains: compounds([{ text: tag('string', 'hello'), bold: tag('byte', 1) }]) }), author: tag('string', 'Alex'), resolved: tag('byte', 1) }),
      compound({ modifiers: compound({ contains: compounds([{ attribute: strings(['minecraft:generic.attack_damage', 'minecraft:generic.movement_speed']), id: tag('string', 'minecraft:test'), amount: tag('double', 2.5), operation: tag('string', 'add_value'), slot: tag('string', 'mainhand') }]) }) }),
      compound({ material: tag('string', '#minecraft:trim_materials'), pattern: strings(['minecraft:sentry', 'minecraft:dune']) }),
      compound({ song: tag('string', 'minecraft:13') }),
      strings(['minecraft:plains', 'minecraft:desert'])
    ]

    for (let id = 0; id < cases.length; id++) {
      const matcher = {
        predicates: [{
          blockSet: null,
          properties: null,
          nbt: null,
          components: { exactMatchers: [], partialMatchers: [{ isPredicate: true, type: id, data: cases[id] }] }
        }]
      }
      assert.strictEqual(typeof family.converters.can_break(matcher, helpers), 'object', `codec ${id} converts`)
      assert.strictEqual(typeof hashComponent('can_break', matcher), 'number', `codec ${id} hashes`)
    }
  })

  it('recursively hashes nested item exact and partial component matchers', () => {
    const tag = (type, value) => ({ type, name: '', value })
    const compound = value => tag('compound', value)
    const nestedItem = {
      items: tag('string', 'minecraft:stone'),
      components: compound({
        'minecraft:custom_name': compound({ text: tag('string', 'hello'), bold: tag('byte', 1) })
      }),
      predicates: compound({ 'minecraft:damage': compound({ damage: tag('int', 2) }) })
    }
    const itemMatcher = {
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: {
          exactMatchers: [],
          partialMatchers: [{
            isPredicate: true,
            type: 5,
            data: compound({
              items: compound({
                contains: tag('list', { type: 'compound', value: [nestedItem] })
              })
            })
          }]
        }
      }]
    }

    const names = ['records', 'combat', 'consumption', 'predicates', 'registries', 'nested_items', 'variants']
    const codecTypes = {}
    const shapes = require('../lib/hashedSlot.json')
    const componentShapes = { ...shapes.components, ...shapes.protocol777Components }
    for (const name of names) {
      const codecFamily = require(`../lib/hashedSlot/families/${name}`)
      Object.assign(codecTypes, codecFamily.types)
      Object.assign(componentShapes, codecFamily.components)
    }
    codecTypes.item_stack_template = ['map', {
      id: 'string',
      count: { type: 'int', default: 1 },
      components: { type: 'item_component_patch', default: {} }
    }]
    componentShapes.charged_projectiles = ['list', 'item_stack_template']
    componentShapes.bundle_contents = ['list', 'item_stack_template']
    componentShapes.container = ['list', ['map', { slot: 'int', item: 'item_stack_template' }]]
    const persistentHelpers = createHelpers(registry, () => undefined, codecTypes, componentShapes)
    const makeNested = data => ({
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: { exactMatchers: [], partialMatchers: [{ isPredicate: true, type: 5, data }] }
      }]
    })
    const basicItem = { items: tag('string', 'minecraft:stone') }
    const nestedData = compound({ items: compound({ contains: tag('list', { type: 'compound', value: [basicItem] }) }) })
    assert.notStrictEqual(family.converters.can_break(makeNested(nestedData), persistentHelpers), undefined, 'basic nested item')
    const converted = family.converters.can_break(itemMatcher, persistentHelpers)
    assert.deepStrictEqual(converted, {
      predicates: {
        'minecraft:container': {
          items: {
            contains: [{
              items: 'minecraft:stone',
              components: {
                'minecraft:custom_name': nestedItem.components.value['minecraft:custom_name']
              },
              predicates: { 'minecraft:damage': { damage: 2 } }
            }]
          }
        }
      }
    })
    assert.strictEqual(typeof hashComponent('can_break', itemMatcher), 'number')

    const arrowTemplate = {
      id: tag('string', 'minecraft:arrow'),
      components: compound({
        'minecraft:custom_data': compound({ nested: tag('long', [1234, 5678]) }),
        'minecraft:profile': compound({
          name: tag('string', 'Alex'),
          id: tag('intArray', [0, -2147483648, 2147483647, 1]),
          properties: tag('list', { type: 'end', value: [] }),
          texture: tag('string', 'minecraft:skins/player'),
          cape: tag('string', 'minecraft:skins/cape'),
          elytra: tag('string', 'minecraft:skins/elytra'),
          model: tag('string', 'slim')
        }),
        '!minecraft:damage': compound({})
      })
    }
    const nestedConsumable = compound({
      consume_seconds: tag('float', 2),
      animation: tag('string', 'drink'),
      sound: tag('string', 'minecraft:entity.generic.drink'),
      on_consume_effects: tag('list', {
        type: 'compound',
        value: [{ type: tag('string', 'minecraft:clear_all_effects') }]
      })
    })
    const dynamicItem = {
      items: tag('string', 'minecraft:stone'),
      components: compound({
        'minecraft:charged_projectiles': tag('list', { type: 'compound', value: [arrowTemplate] }),
        'minecraft:consumable': nestedConsumable,
        'minecraft:trim': compound({ material: tag('string', 'minecraft:quartz'), pattern: tag('string', 'minecraft:sentry') })
      }),
      predicates: compound({ 'minecraft:custom_name': compound({}) })
    }
    const dynamicWithoutTemplate = {
      ...dynamicItem,
      components: compound({
        'minecraft:consumable': nestedConsumable,
        'minecraft:trim': compound({ material: tag('string', 'minecraft:quartz'), pattern: tag('string', 'minecraft:sentry') })
      })
    }
    const noTemplateMatcher = makeNested(compound({
      items: compound({ contains: tag('list', { type: 'compound', value: [dynamicWithoutTemplate] }) })
    }))
    assert.notStrictEqual(family.converters.can_break(noTemplateMatcher, persistentHelpers), undefined, 'nested choice codecs and AnyValue matchers')
    assert.strictEqual(typeof hashComponent('can_break', noTemplateMatcher), 'number', 'nested dynamic component hashes')
    const dynamicMatcher = makeNested(compound({ items: compound({ contains: tag('list', { type: 'compound', value: [dynamicItem] }) }) }))
    assert.notStrictEqual(family.converters.can_break(dynamicMatcher, persistentHelpers), undefined, 'nested item component patches')
    assert.strictEqual(typeof hashComponent('can_break', dynamicMatcher), 'number')

    const resolvableItem = {
      items: tag('string', 'minecraft:stone'),
      components: compound({
        'minecraft:compostable': compound({ layers: tag('int', 4) }),
        'minecraft:cooking_fuel': compound({ burn_time: tag('int', 200), speed_multiplier: tag('float', 1.25) }),
        'minecraft:brewing_fuel': compound({ uses: tag('string', 'minecraft:brew_uses'), speed_multiplier: tag('string', 'minecraft:brew_speed') })
      })
    }
    const resolvableMatcher = makeNested(compound({
      items: compound({ contains: tag('list', { type: 'compound', value: [resolvableItem] }) })
    }))
    assert.deepStrictEqual(family.converters.can_break(resolvableMatcher, persistentHelpers), {
      predicates: {
        'minecraft:container': {
          items: {
            contains: [{
              items: 'minecraft:stone',
              components: {
                'minecraft:compostable': { layers: 4 },
                'minecraft:cooking_fuel': { burn_time: 200, speed_multiplier: 1.25 },
                'minecraft:brewing_fuel': { uses: 'minecraft:brew_uses', speed_multiplier: 'minecraft:brew_speed' }
              }
            }]
          }
        }
      }
    })
    assert.strictEqual(typeof hashComponent('can_break', resolvableMatcher), 'number', 'nested resolvable scalars hash')

    const nestedProfileIdMatcher = profileId => makeNested(compound({
      items: compound({
        contains: tag('list', {
          type: 'compound',
          value: [{
            items: tag('string', 'minecraft:stone'),
            components: compound({
              'minecraft:charged_projectiles': tag('list', {
                type: 'compound',
                value: [{
                  id: tag('string', 'minecraft:arrow'),
                  components: compound({ 'minecraft:profile': compound({ id: tag('intArray', profileId) }) })
                }]
              })
            })
          }]
        })
      })
    }))
    assert.strictEqual(hashComponent('can_break', nestedProfileIdMatcher([0, 1, 2])), undefined, 'nested profile UUIDs require exactly four int array values')
    assert.strictEqual(hashComponent('can_break', nestedProfileIdMatcher([2147483648, 0, 0, 0])), undefined, 'nested profile int arrays reject out-of-range entries')

    const emptyCustomDataItem = {
      items: tag('string', 'minecraft:stone'),
      predicates: compound({ 'minecraft:custom_data': compound({}) })
    }
    const emptyCustomDataMatcher = makeNested(compound({
      items: compound({ contains: tag('list', { type: 'compound', value: [emptyCustomDataItem] }) })
    }))
    const expectedEmptyCustomDataHash = hashValue(createPredicateProto(), {
      predicates: {
        'minecraft:container': {
          items: {
            contains: [{
              items: 'minecraft:stone',
              predicates: { 'minecraft:custom_data': compound({}) }
            }]
          }
        }
      }
    }, family.components.can_break)
    assert.strictEqual(hashComponent('can_break', emptyCustomDataMatcher), expectedEmptyCustomDataHash, 'empty custom_data remains its concrete NBT predicate codec')

    const anyValueNames = ['creative_slot_lock', 'map_post_processing', 'additional_trade_cost']
    const anyValueItem = {
      items: tag('string', 'minecraft:stone'),
      predicates: compound(Object.fromEntries(anyValueNames.map(name => [`minecraft:${name}`, compound({})])))
    }
    const anyValueNestedMatcher = makeNested(compound({
      items: compound({ contains: tag('list', { type: 'compound', value: [anyValueItem] }) })
    }))
    assert.deepStrictEqual(family.converters.can_break(anyValueNestedMatcher, persistentHelpers), {
      predicates: {
        'minecraft:container': {
          items: {
            contains: [{
              items: 'minecraft:stone',
              predicates: Object.fromEntries(anyValueNames.map(name => [`minecraft:${name}`, {}]))
            }]
          }
        }
      }
    }, 'nested AnyValue matchers use the component registry even without hash shapes')
    assert.strictEqual(typeof hashComponent('can_break', anyValueNestedMatcher), 'number')

    const unknownAnyValueItem = {
      ...anyValueItem,
      predicates: compound({ 'minecraft:unknown_component': compound({}) })
    }
    const unknownAnyValueMatcher = makeNested(compound({
      items: compound({ contains: tag('list', { type: 'compound', value: [unknownAnyValueItem] }) })
    }))
    assert.strictEqual(family.converters.can_break(unknownAnyValueMatcher, persistentHelpers), undefined)
    assert.strictEqual(hashComponent('can_break', unknownAnyValueMatcher), undefined)
  })

  it('accepts long NBT values, NbtOps numeric booleans, and default collection bounds', () => {
    const tag = (type, value) => ({ type, name: '', value })
    const compound = value => tag('compound', value)
    const customData = compound({
      long_value: tag('long', [1234, 5678]),
      long_values: tag('list', { type: 'long', value: [[12, 34], [56, 78]] }),
      arbitrary_int_array: tag('intArray', [1, 2, 3])
    })
    const customDataMatcher = {
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: { exactMatchers: [], partialMatchers: [{ isPredicate: true, type: 4, data: customData }] }
      }]
    }
    assert.strictEqual(typeof hashComponent('can_break', customDataMatcher), 'number')

    const customDataMatcherFor = value => ({
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: { exactMatchers: [], partialMatchers: [{ isPredicate: true, type: 4, data: value }] }
      }]
    })
    assert.strictEqual(typeof hashComponent('can_break', customDataMatcherFor(compound({ max: tag('long', (1n << 63n) - 1n) }))), 'number')
    assert.strictEqual(hashComponent('can_break', customDataMatcherFor(compound({ overflow: tag('long', 1n << 63n) }))), undefined)
    assert.strictEqual(hashComponent('can_break', customDataMatcherFor(compound({ malformed: tag('longArray', [[1, 2, 3]]) }))), undefined)
    assert.strictEqual(hashComponent('can_break', customDataMatcherFor(compound({ malformed: tag('intArray', [2147483648]) }))), undefined)

    const nonCanonicalBoolean = {
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: { exactMatchers: [], partialMatchers: [{ isPredicate: true, type: 7, data: compound({ has_twinkle: tag('byte', 2), has_trail: tag('int', 1) }) }] }
      }]
    }
    assert.deepStrictEqual(family.converters.can_break(nonCanonicalBoolean, helpers), {
      predicates: { 'minecraft:firework_explosion': { has_twinkle: true, has_trail: true } }
    })
    assert.strictEqual(typeof hashComponent('can_break', nonCanonicalBoolean), 'number')

    const any = compound({})
    const anyCount = compound({
      count: tag('list', { type: 'compound', value: [{ test: compound({}), count: any }] }),
      size: any
    })
    const container = family.converters.can_break({
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: { exactMatchers: [], partialMatchers: [{ isPredicate: true, type: 5, data: compound({ items: anyCount }) }] }
      }]
    }, helpers)
    assert.deepStrictEqual(container, { predicates: { 'minecraft:container': { items: { count: [{ test: {} }] } } } })
  })

  it('normalizes compact holder, tag, list, property, and nested NBT forms in order', () => {
    const stone = registry.blocksByName.stone.id
    const dirt = registry.blocksByName.dirt.id
    const values = {
      predicates: [
        { blockSet: { ids: [stone] }, properties: [{ name: 'axis', isExactMatch: true, value: { exactValue: 'x' } }], nbt: null, components: { exactMatchers: [], partialMatchers: [] } },
        { blockSet: { name: '#logs' }, properties: [{ name: 'age', isExactMatch: false, value: { minValue: '1', maxValue: null } }], nbt: null, components: { exactMatchers: [], partialMatchers: [] } },
        { blockSet: { ids: [stone, dirt] }, properties: null, nbt: { type: 'compound', value: { CustomName: { type: 'string', value: 'test' } } }, components: { exactMatchers: [], partialMatchers: [] } }
      ]
    }
    assert.deepStrictEqual(family.converters.can_place_on(values, helpers), [
      { blocks: 'minecraft:stone', state: { axis: 'x' } },
      { blocks: '#minecraft:logs', state: { age: { min: '1' } } },
      { blocks: ['minecraft:stone', 'minecraft:dirt'], nbt: values.predicates[2].nbt }
    ])
    assert.deepStrictEqual(family.converters.can_break({ predicates: [values.predicates[1]] }, helpers),
      { blocks: '#minecraft:logs', state: { age: { min: '1' } } })
  })

  it('preserves empty lists, defaults, and single predicate compact encoding', () => {
    assert.strictEqual(family.converters.can_place_on({ predicates: [] }, helpers), undefined)
    assert.deepStrictEqual(family.converters.can_break({ predicates: [{ blockSet: null, properties: null, nbt: null, components: { exactMatchers: [], partialMatchers: [] } }] }, helpers), {})
    assert.deepStrictEqual(family.converters.can_place_on({ predicates: [{ blockSet: null, properties: null, nbt: null, components: { exactMatchers: [], partialMatchers: [] } }] }, helpers), {})
    assert.notStrictEqual(hashValue(createPredicateProto(), {}, family.components.can_break), hashValue(createPredicateProto(), [], family.components.can_break))
  })

  it('hashes exact and partial matcher maps in their persistent codec form', () => {
    const emptyCompound = { type: 'compound', name: '', value: {} }
    const matcher = {
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: {
          exactMatchers: [{ type: 'damage', data: 5 }],
          partialMatchers: [{ isPredicate: false, type: 'custom_name', data: emptyCompound }]
        }
      }]
    }

    assert.deepStrictEqual(family.converters.can_break(matcher, helpers), {
      components: { 'minecraft:damage': 5 },
      predicates: { 'minecraft:custom_name': {} }
    })
    assert.strictEqual(typeof hashComponent('can_break', matcher), 'number')
    const anyValueMatcher = {
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: { exactMatchers: [], partialMatchers: [{ type: 'custom_name', isPredicate: false, data: emptyCompound }] }
      }]
    }
    assert.strictEqual(hashComponent('can_break', anyValueMatcher), hashValue(createPredicateProto(), {
      predicates: { 'minecraft:custom_name': {} }
    }, family.components.can_break))

    for (const name of ['creative_slot_lock', 'map_post_processing', 'additional_trade_cost']) {
      const matcher = {
        predicates: [{
          blockSet: null,
          properties: null,
          nbt: null,
          components: { exactMatchers: [], partialMatchers: [{ isPredicate: false, type: helpers.componentId(name), data: emptyCompound }] }
        }]
      }
      assert.deepStrictEqual(family.converters.can_break(matcher, helpers), {
        predicates: { [`minecraft:${name}`]: {} }
      }, `${name} accepts the protocol AnyValue matcher`)
      assert.strictEqual(typeof hashComponent('can_break', matcher), 'number', `${name} AnyValue matcher hashes`)
    }

    const completeProfile = {
      type: 'complete',
      complete: {
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Alex',
        properties: [{ name: 'textures', value: 'encoded-texture', signature: 'signature' }]
      },
      skinPatch: {
        body: 'minecraft:skins/player',
        cape: 'minecraft:skins/cape',
        elytra: 'minecraft:skins/elytra',
        model: true
      }
    }
    const partialProfile = {
      type: 'partial',
      partial: { name: 'Alex', properties: [] },
      skinPatch: { model: false }
    }
    assert.strictEqual(typeof hashComponent('profile', completeProfile), 'number', 'complete wire profile and slim skin patch hash')
    assert.strictEqual(typeof hashComponent('profile', partialProfile), 'number', 'partial wire profile and wide skin patch hash')

    const damageMatcher = {
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: {
          exactMatchers: [],
          partialMatchers: [{
            isPredicate: true,
            type: 'damage',
            data: { type: 'compound', name: '', value: { damage: { type: 'compound', value: { min: { type: 'int', value: 5 } } } } }
          }]
        }
      }]
    }
    assert.strictEqual(typeof hashComponent('can_place_on', damageMatcher), 'number')

    const transient = {
      predicates: [{
        blockSet: null,
        properties: null,
        nbt: null,
        components: {
          exactMatchers: [{ type: 'additional_trade_cost', data: 1 }],
          partialMatchers: []
        }
      }]
    }
    assert.deepStrictEqual(family.converters.can_break(transient, helpers), {})
  })

  it('rejects malformed predicates, unknown block IDs, and unsupported nested component matchers', () => {
    assert.strictEqual(family.converters.can_place_on(null, helpers), undefined)
    assert.strictEqual(family.converters.can_place_on({ predicates: [{ blockSet: { ids: ['stone'] }, properties: null, nbt: null, components: { exactMatchers: [], partialMatchers: [] } }] }, helpers), undefined)
    assert.strictEqual(family.converters.can_place_on({ predicates: [{ blockSet: { ids: [999999] }, properties: null, nbt: null, components: { exactMatchers: [], partialMatchers: [] } }] }, helpers), undefined)
    assert.strictEqual(family.converters.can_place_on({ predicates: [{ blockSet: null, properties: [{ name: 'axis', isExactMatch: true, value: { exactValue: null } }], nbt: null, components: { exactMatchers: [], partialMatchers: [] } }] }, helpers), undefined)
    assert.strictEqual(family.converters.can_place_on({ predicates: [{ blockSet: null, properties: null, nbt: { type: 'compound', value: { Broken: { type: 'unknown', value: 1 } } }, components: { exactMatchers: [], partialMatchers: [] } }] }, helpers), undefined)
    assert.strictEqual(family.converters.can_place_on({ predicates: [{ blockSet: null, properties: null, nbt: null, components: { exactMatchers: [{}], partialMatchers: [] } }] }, helpers), undefined)
    assert.strictEqual(family.converters.can_place_on({ predicates: [{ blockSet: null, properties: null, nbt: null, components: { exactMatchers: [], partialMatchers: [3] } }] }, helpers), undefined)
    assert.strictEqual(family.converters.can_place_on({ predicates: [{ blockSet: null, properties: null, nbt: null, components: { exactMatchers: [], partialMatchers: [{ isPredicate: true, type: 'unknown', data: { type: 'compound', value: {} } }] } }] }, helpers), undefined)
  })
})

function createPredicateProto () {
  const proto = createProtoDef()
  proto.addTypes(family.types)
  proto.addTypes(family.components)
  return proto
}
