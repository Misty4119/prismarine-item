/* eslint-env mocha */

const expect = require('expect').default
const nbt = require('prismarine-nbt')
const hashedSlot = require('../lib/hashedSlot')
const { hash } = hashedSlot

describe('hashed slot', () => {
  it('hashes maps independently of insertion order', () => {
    const dict = ['dict', 'int']
    expect(hash({ x: 1, y: 2 }, dict)).toBe(hash({ y: 2, x: 1 }, dict))
    expect(hash({ x: 1, y: 2 }, dict)).not.toBe(hash({ x: 2, y: 1 }, dict))
  })

  it('hashes nbt compounds as maps of their entries', () => {
    const tag = nbt.comp({ a: nbt.int(1), b: nbt.string('s') })
    expect(hash(tag, 'nbt')).toBe(hash({ a: 1, b: 's' }, ['map', { a: 'int', b: 'string' }]))
  })

  it('hashes text component booleans as booleans, not bytes', () => {
    const tag = nbt.comp({ text: nbt.string('hi'), italic: nbt.byte(0) })
    expect(hash(tag, 'text')).toBe(hash({ text: 'hi', italic: false }, ['map', { text: 'string', italic: 'boolean' }]))
    expect(hash(nbt.string('hi'), 'text')).toBe(hash('hi', 'string'))
  })

  it('omits optional and defaulted record fields, and requires the rest', () => {
    const record = ['map', { a: 'int', b: { type: 'int', default: 0 }, c: { type: 'int', optional: true } }]
    expect(hash({ a: 1, b: 0 }, record)).toBe(hash({ a: 1 }, ['map', { a: 'int' }]))
    expect(hash({ a: 1, b: 2, c: 3 }, record)).not.toBe(hash({ a: 1 }, record))
    expect(() => hash({ b: 1 }, record)).toThrow('a is required')
  })

  describe('1.21.5', () => {
    const registry = require('prismarine-registry')('1.21.5')
    const Item = require('prismarine-item')(registry)
    const { hashComponent } = hashedSlot(registry)

    it('hashes enchantments as a map of key to level', () => {
      const sharpness = registry.enchantmentsByName.sharpness.id
      expect(hashComponent('enchantments', { enchantments: [{ id: sharpness, level: 5 }] }))
        .toBe(hash({ 'minecraft:sharpness': 5 }, ['dict', 'int']))
    })

    it('omits codec defaults', () => {
      expect(hashComponent('written_book_content', { rawTitle: 't', filteredTitle: undefined, author: 'a', generation: 0, pages: [], resolved: false }))
        .toBe(hash({ title: { raw: 't' }, author: 'a' }, ['map', { title: ['map', { raw: 'string' }], author: 'string' }]))
    })

    it('reports components it cannot hash', () => {
      expect(hashComponent('trim', {})).toBeUndefined()
    })

    it('toHashedNotch carries hashes instead of component data', () => {
      const item = new Item(registry.itemsByName.diamond_sword.id, 1)
      item.components = [{ type: 'damage', data: 3 }, { type: 'unbreakable', data: undefined }]
      item.removedComponents = [{ type: 'lore' }]
      expect(Item.toHashedNotch(item)).toStrictEqual({
        itemId: registry.itemsByName.diamond_sword.id,
        itemCount: 1,
        components: [{ type: 'damage', hash: hash(3, 'int') }, { type: 'unbreakable', hash: hash(undefined, ['map', {}]) }],
        removeComponents: [{ type: 'lore' }]
      })
      expect(Item.toHashedNotch(null)).toBeNull()
    })
  })

  describe('26.3 protocol 777', () => {
    const registry = require('prismarine-registry')('26.3')
    const Item = require('prismarine-item')(registry)
    const { hashComponent } = hashedSlot(registry)

    it('converts network components to hashes and preserves removals', () => {
      expect(registry.version).toMatchObject({ majorVersion: '26.3', version: 777 })
      expect(registry.protocol.types.HashedSlot).toBeDefined()

      const itemId = registry.itemsByName.diamond_sword.id
      const sharpnessId = registry.enchantmentsByName.sharpness.id
      const customName = nbt.string('{"text":"26.3 sword"}')
      const item = Item.fromNotch({
        itemId,
        itemCount: 1,
        components: [
          { type: 'custom_name', data: customName },
          { type: 'enchantments', data: { enchantments: [{ id: sharpnessId, level: 5 }] } }
        ],
        removeComponents: [{ type: 'lore' }]
      })

      const network = Item.toNotch(item)
      expect(Item.toHashedNotch(item)).toStrictEqual({
        itemId,
        itemCount: 1,
        components: network.components.map(component => ({
          type: component.type,
          hash: hashComponent(component.type, component.data) ?? 0
        })),
        removeComponents: [{ type: 'lore' }]
      })
    })

    it('hashes cushion color with the 26.3 Vanilla-accepted string codec', () => {
      expect(hashComponent('cushion/color', 'blue')).toBe(199633461)
      expect(hashComponent('cushion/color', 11)).toBe(199633461)

      const item = new Item(registry.itemsByName.white_cushion.id, 1)
      item.components = [{ type: 'cushion/color', data: 'blue' }]
      expect(Item.toHashedNotch(item)).toStrictEqual({
        itemId: registry.itemsByName.white_cushion.id,
        itemCount: 1,
        components: [{ type: 'cushion/color', hash: 199633461 }],
        removeComponents: []
      })
    })

    it('uses the zero-hash fallback for a malformed 26.3 component and omits non-hashed components', () => {
      const componentTypes = Object.values(registry.protocol.types.SlotComponentType[1].mappings)
      expect(componentTypes).toContain('sulfur_cube_content')
      expect(hashComponent('sulfur_cube_content', {})).toBeUndefined()

      const item = new Item(registry.itemsByName.diamond_sword.id, 1)
      item.components = [
        { type: 'sulfur_cube_content', data: {} },
        { type: 'creative_slot_lock', data: undefined }
      ]
      item.removedComponents = [{ type: 'lore' }]

      expect(Item.toHashedNotch(item)).toStrictEqual({
        itemId: registry.itemsByName.diamond_sword.id,
        itemCount: 1,
        components: [{ type: 'sulfur_cube_content', hash: 0 }],
        removeComponents: [{ type: 'lore' }]
      })
    })

    it('hashes swing animations with the vanilla type and duration defaults', () => {
      const swingAnimation = ['map', {
        type: { type: 'string', default: 'whack' },
        duration: { type: 'int', default: 6 }
      }]
      const emptySwingAnimationHash = hash({}, swingAnimation)

      expect(hashComponent('attack_animation', { type: 'whack', duration: 6 })).toBe(emptySwingAnimationHash)
      expect(hashComponent('attack_animation', {})).toBe(emptySwingAnimationHash)
      expect(hashComponent('attack_animation', { type: 1, duration: 6 })).toBe(emptySwingAnimationHash)
      expect(hashComponent('interact_animation', { type: 'whack', duration: 6 })).toBe(emptySwingAnimationHash)

      expect(hashComponent('attack_animation', { type: 'stab', duration: 1 }))
        .toBe(hash({ type: 'stab', duration: 1 }, swingAnimation))
      expect(hashComponent('interact_animation', { type: 'stab', duration: 2 }))
        .toBe(hash({ type: 'stab', duration: 2 }, swingAnimation))
      expect(hashComponent('interact_animation', { type: 'whack', duration: 2 }))
        .toBe(hash({ duration: 2 }, swingAnimation))
      expect(hashComponent('attack_animation', { type: 3, duration: 6 })).toBeUndefined()
    })

    it('normalizes sign text dye colors to codec names', () => {
      const signText = ['map', {
        messages: ['list', 'text'],
        filtered_messages: { type: ['list', 'text'], optional: true },
        color: 'string',
        has_glowing_text: { type: 'boolean', default: false }
      }]
      const messages = [nbt.string('front 1'), nbt.string('front 2'), nbt.string('front 3'), nbt.string('front 4')]

      expect(hashComponent('sign_text_front', { messages, color: 0, hasGlowingText: false }))
        .toBe(hash({ messages, color: 'white', has_glowing_text: false }, signText))
      expect(hashComponent('sign_text_back', { messages, filteredMessages: messages, color: 15, hasGlowingText: true }))
        .toBe(hash({ messages, filtered_messages: messages, color: 'black', has_glowing_text: true }, signText))
    })

    it('converts mob visibility holder sets into compact codec values', () => {
      const zombieId = registry.entitiesByName.zombie.id
      const skeletonId = registry.entitiesByName.skeleton.id
      const single = ['map', { targeting_entity_types: 'string', visibility: 'float' }]
      const multiple = ['map', { targeting_entity_types: ['list', 'string'], visibility: 'float' }]

      expect(hashComponent('mob_visibility', { targetingEntityTypes: { ids: [zombieId] }, visibility: 10 }))
        .toBe(hash({ targeting_entity_types: 'minecraft:zombie', visibility: 10 }, single))
      expect(hashComponent('mob_visibility', { targetingEntityTypes: { ids: [zombieId, skeletonId] }, visibility: 10 }))
        .toBe(hash({ targeting_entity_types: ['minecraft:zombie', 'minecraft:skeleton'], visibility: 10 }, multiple))
      expect(hashComponent('mob_visibility', { targetingEntityTypes: { ids: [] }, visibility: 10 }))
        .toBe(hash({ targeting_entity_types: [], visibility: 10 }, multiple))

      expect(hashComponent('mob_visibility', { targetingEntityTypes: { name: 'minecraft:undead' }, visibility: 10 }))
        .toBe(hash({ targeting_entity_types: '#minecraft:undead', visibility: 10 }, single))
      expect(hashComponent('mob_visibility', { targetingEntityTypes: { name: '#minecraft:undead' }, visibility: 10 }))
        .toBe(hash({ targeting_entity_types: '#minecraft:undead', visibility: 10 }, single))
      expect(hashComponent('mob_visibility', { targetingEntityTypes: { ids: [99999] }, visibility: 10 })).toBeUndefined()
    })

    it('hashes constant and referenced 26.3 Resolvable values with their codec scalar types', () => {
      const compostable = ['map', { layers: 'resolvable_int' }]
      const cookingFuel = ['map', { burn_time: 'resolvable_int', speed_multiplier: 'resolvable_float' }]
      const brewingFuel = ['map', { uses: 'resolvable_int', speed_multiplier: 'resolvable_float' }]

      expect(hashComponent('compostable', { isConstant: true, value: 1 }))
        .toBe(hash({ layers: 1 }, compostable))
      expect(hashComponent('compostable', { isConstant: false, value: 'test:compost_layers' }))
        .toBe(hash({ layers: 'test:compost_layers' }, compostable))
      expect(hashComponent('compostable', { isConstant: false, value: 'compost_layers' }))
        .toBe(hash({ layers: 'minecraft:compost_layers' }, compostable))

      expect(hashComponent('cooking_fuel', {
        burnTime: { isConstant: true, value: 200 },
        speedMultiplier: { isConstant: false, value: 'test:cooking_speed' }
      })).toBe(hash({ burn_time: 200, speed_multiplier: 'test:cooking_speed' }, cookingFuel))
      expect(hashComponent('cooking_fuel', {
        burnTime: { isConstant: false, value: 'test:burn_time' },
        speedMultiplier: { isConstant: true, value: 1.5 }
      })).toBe(hash({ burn_time: 'test:burn_time', speed_multiplier: 1.5 }, cookingFuel))

      expect(hashComponent('brewing_fuel', {
        uses: { isConstant: false, value: 'test:brewing_uses' },
        speedMultiplier: { isConstant: false, value: 'test:brewing_speed' }
      })).toBe(hash({ uses: 'test:brewing_uses', speed_multiplier: 'test:brewing_speed' }, brewingFuel))
      expect(hashComponent('cooking_fuel', {
        burnTime: { isConstant: true, value: 1.5 },
        speedMultiplier: { isConstant: true, value: 1 }
      })).toBeUndefined()
    })
  })

  // Component values from Vanilla inventory state, with the hashes sent in
  // window_click and verified after authoritative window synchronization.
  describe('hashes accepted by a vanilla server', () => {
    const vectors = require('./hashedSlot.vectors.json')
    for (const version of Object.keys(vectors)) {
      describe(version, () => {
        const { hashComponent } = hashedSlot(require('prismarine-registry')(version))
        for (const vector of vectors[version]) {
          it(vector.give, () => {
            for (const component of vector.components) {
              expect(hashComponent(component.type, component.data)).toBe(vector.hashes[component.type])
            }
          })
        }
      })
    }
  })

  it('toHashedNotch throws before 1.21.5', () => {
    const Item = require('prismarine-item')('1.21.4')
    expect(() => Item.toHashedNotch(null)).toThrow()
  })

  for (const version of ['1.21.5', '26.3']) {
    it(`keeps malformed network converter inputs recoverable on ${version}`, () => {
      const registry = require('prismarine-registry')(version)
      const Item = require('prismarine-item')(registry)
      const { hashComponent } = hashedSlot(registry)
      for (const type of ['food', 'enchantments', 'bundle_contents', 'container', 'tooltip_display']) {
        expect(hashComponent(type, null)).toBeUndefined()
        expect(hashComponent(type, {})).toBeUndefined()
      }
      const item = new Item(registry.itemsByName.feather.id, 1)
      item.components = [{ type: 'bundle_contents', data: null }]
      item.removedComponents = []
      expect(Item.toHashedNotch(item).components).toStrictEqual([{ type: 'bundle_contents', hash: 0 }])
    })
  }
})
