/* eslint-env mocha */

const assert = require('assert')
const hashedSlot = require('../lib/hashedSlot')
const createHelpers = require('../lib/hashedSlot/families/helpers')
const consumption = require('../lib/hashedSlot/families/consumption')

describe('protocol 777 consumption component codecs', () => {
  const registry = require('prismarine-registry')('26.3')
  const helpers = createHelpers(registry)
  const hashComponent = hashedSlot(registry).hashComponent

  it('declares each assigned component with a persistent codec shape', () => {
    assert.deepStrictEqual([...consumption.ids].sort(), [
      'consumable', 'death_protection', 'potion_contents', 'suspicious_stew_effects'
    ].sort())
    for (const id of consumption.ids) assert.ok(consumption.components[id], `${id} has a codec shape`)
  })

  it('maps consumable network names and sounds to the persistent record', () => {
    const soundId = registry.soundsArray.findIndex(entry => entry.name === 'entity.generic.eat')
    const value = consumption.converters.consumable({
      consume_seconds: 1.6,
      animation: 'eat',
      sound: { soundId },
      makes_particles: true,
      effects: []
    }, helpers)

    assert.deepStrictEqual(value, {})
    assert.deepStrictEqual(consumption.converters.consumable({
      consume_seconds: 2,
      animation: 'drink',
      sound: { soundId: registry.soundsArray.findIndex(entry => entry.name === 'entity.generic.drink') },
      makes_particles: false,
      effects: []
    }, helpers), {
      consume_seconds: 2,
      animation: 'drink',
      sound: 'minecraft:entity.generic.drink',
      has_consume_particles: false
    })
  })

  it('rejects malformed consumable required and optional values', () => {
    assert.strictEqual(consumption.converters.consumable({}, helpers), undefined)
    assert.strictEqual(consumption.converters.consumable({
      consume_seconds: -1, animation: 'eat', sound: { soundId: 1 }, makes_particles: true, effects: []
    }, helpers), undefined)
    assert.strictEqual(consumption.converters.consumable({
      consume_seconds: 1, animation: 'not_an_animation', sound: { soundId: 1 }, makes_particles: true, effects: []
    }, helpers), undefined)
  })

  it('normalizes all consume-effect branches and rejects unknown effect IDs', () => {
    const effect = {
      effects: [{
        id: registry.effectsByName.Speed.id,
        details: {
          amplifier: 1, duration: 40, ambient: false, showParticles: true, showIcon: true, hiddenEffect: null
        }
      }],
      probability: 1
    }
    const value = consumption.normalizeConsumeEffect({ type: 'apply_effects', ...effect }, helpers)
    assert.deepStrictEqual(value, {
      type: 'minecraft:apply_effects',
      effects: [{ id: 'minecraft:speed', amplifier: 1, duration: 40, show_icon: true }]
    })
    assert.deepStrictEqual(consumption.normalizeConsumeEffect({ type: 'clear_all_effects' }, helpers), {
      type: 'minecraft:clear_all_effects'
    })
    assert.deepStrictEqual(consumption.normalizeConsumeEffect({ type: 'teleport_randomly', diameter: 16, directionalParticles: true }, helpers), {
      type: 'minecraft:teleport_randomly'
    })
    assert.deepStrictEqual(consumption.normalizeConsumeEffect({ type: 'teleport_randomly', diameter: 8, directionalParticles: false }, helpers), {
      type: 'minecraft:teleport_randomly', diameter: 8, directional_particles: false
    })
    assert.deepStrictEqual(consumption.normalizeConsumeEffect({ type: 'remove_effects', effects: { ids: [registry.effectsByName.Speed.id] } }, helpers), {
      type: 'minecraft:remove_effects', effects: 'minecraft:speed'
    })
    assert.deepStrictEqual(consumption.normalizeConsumeEffect({ type: 'play_sound', sound: { soundId: registry.soundsArray.findIndex(entry => entry.name === 'entity.generic.eat') } }, helpers), {
      type: 'minecraft:play_sound', sound: 'minecraft:entity.generic.eat'
    })
    assert.strictEqual(consumption.normalizeConsumeEffect({ type: 'apply_effects', effects: [{ id: 999999, details: {} }], probability: 1 }, helpers), undefined)
    assert.strictEqual(consumption.normalizeConsumeEffect({ type: 'remove_effects', effects: { ids: [999999] } }, helpers), undefined)
    assert.strictEqual(consumption.normalizeConsumeEffect({ type: 'unknown' }, helpers), undefined)
  })

  it('uses the official vanilla potion registry ordinal mapping and rejects unknown ordinals', () => {
    assert.strictEqual(consumption.potionKey(0, helpers), 'minecraft:water')
    assert.strictEqual(consumption.potionKey(13, helpers), 'minecraft:swiftness')
    assert.strictEqual(consumption.potionKey(999999, helpers), undefined)
  })

  it('preserves custom effect namespaces returned by the live registry', () => {
    const customRegistry = {
      ...registry,
      loginPacket: {
        ...registry.loginPacket,
        dimensionCodec: {
          ...registry.loginPacket.dimensionCodec,
          'minecraft:mob_effect': { entries: [{ key: 'mod:effect' }] }
        }
      }
    }
    const customHelpers = createHelpers(customRegistry)
    const data = { effects: [{ effect: 0, duration: 160 }] }
    assert.deepStrictEqual(consumption.converters.suspicious_stew_effects(data, customHelpers), [{ id: 'mod:effect' }])
    assert.deepStrictEqual(consumption.normalizeConsumeEffect({ type: 'remove_effects', effects: { ids: [0] } }, customHelpers), {
      type: 'minecraft:remove_effects', effects: 'mod:effect'
    })
    assert.deepStrictEqual(consumption.normalizeConsumeEffect({ type: 'remove_effects', effects: { name: 'mod:effects' } }, customHelpers), {
      type: 'minecraft:remove_effects', effects: '#mod:effects'
    })
    const expected = hashedSlot.hash([{ id: 'mod:effect' }], ['list', ['map', { id: 'string' }]])
    assert.strictEqual(hashedSlot(customRegistry).hashComponent('suspicious_stew_effects', data), expected)
  })

  it('omits the optional empty death effect list', () => {
    assert.deepStrictEqual(consumption.converters.death_protection({ deathEffects: [] }, helpers), {})
    assert.strictEqual(consumption.converters.death_protection({}, helpers), undefined)
  })

  it('normalizes potion and suspicious-stew effect IDs', () => {
    const effect = {
      id: registry.effectsByName.Regeneration.id,
      details: {
        amplifier: 0, duration: 100, ambient: false, showParticles: true, showIcon: true, hiddenEffect: null
      }
    }
    assert.deepStrictEqual(consumption.converters.potion_contents({
      potionId: 0, customColor: 0x123456, customEffects: [effect], customName: null
    }, helpers), {
      potion: 'minecraft:water',
      custom_color: 0x123456,
      custom_effects: [{ id: 'minecraft:regeneration', duration: 100, show_icon: true }]
    })
    assert.deepStrictEqual(consumption.converters.suspicious_stew_effects({
      effects: [
        { effect: registry.effectsByName.Speed.id, duration: 160 }
      ]
    }, helpers), [{ id: 'minecraft:speed' }])
    assert.deepStrictEqual(consumption.converters.suspicious_stew_effects({
      effects: [
        { effect: registry.effectsByName.Speed.id }
      ]
    }, helpers), [{ id: 'minecraft:speed' }])
    assert.strictEqual(consumption.converters.suspicious_stew_effects({ effects: [{ effect: 999999 }] }, helpers), undefined)
    assert.strictEqual(consumption.converters.potion_contents({ potionId: 999999 }, helpers), undefined)
    assert.deepStrictEqual(consumption.converters.potion_contents({ potionId: null, customEffects: [] }, helpers), {})
  })

  it('hashes the persistent consumable, protection, potion, and stew codec shapes', () => {
    const soundId = registry.soundsArray.findIndex(entry => entry.name === 'entity.generic.drink')
    const effect = {
      id: registry.effectsByName.Speed.id,
      details: {
        amplifier: 1,
        duration: 40,
        ambient: false,
        showParticles: true,
        showIcon: false,
        hiddenEffect: {
          amplifier: 0,
          duration: 20,
          ambient: false,
          showParticles: true,
          showIcon: true
        }
      }
    }

    assert.strictEqual(typeof hashComponent('consumable', {
      consume_seconds: 2,
      animation: 'drink',
      sound: { soundId },
      makes_particles: false,
      effects: [{ type: 'apply_effects', effects: [effect], probability: 0.5 }]
    }), 'number')
    assert.strictEqual(typeof hashComponent('death_protection', {
      deathEffects: [{ type: 'play_sound', sound: { data: { soundName: 'minecraft:entity.generic.drink', fixedRange: null } } }]
    }), 'number')
    assert.strictEqual(typeof hashComponent('potion_contents', {
      customColor: -1,
      customName: 'custom potion',
      customEffects: [effect]
    }), 'number')
    assert.strictEqual(typeof hashComponent('suspicious_stew_effects', {
      effects: [{ effect: registry.effectsByName.Speed.id, duration: 120 }]
    }), 'number')
  })
})
