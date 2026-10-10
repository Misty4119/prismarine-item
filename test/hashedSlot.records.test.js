/* eslint-env mocha */

const assert = require('assert')
const createHelpers = require('../lib/hashedSlot/families/helpers')
const family = require('../lib/hashedSlot/families/records')

describe('protocol 777 records hashed component family', () => {
  const registry = require('prismarine-registry')('26.3')
  const helpers = createHelpers(registry)

  it('declares the complete records component list and persistent codec shapes', () => {
    const expectedIds = [
      'use_effects', 'use_cooldown', 'weapon', 'attack_range', 'enchantable', 'damage_type',
      'repairable', 'dye', 'lodestone_tracker', 'firework_explosion', 'fireworks', 'break_sound'
    ]
    assert.deepStrictEqual(family.ids, expectedIds)
    assert.deepStrictEqual(Object.keys(family.components).sort(), [...expectedIds].sort())
    assert.deepStrictEqual(family.components.use_effects, ['map', {
      can_sprint: { type: 'boolean', default: false },
      interact_vibrations: { type: 'boolean', default: true },
      speed_multiplier: { type: 'float', default: 0.2 }
    }])
    assert.deepStrictEqual(family.components.use_cooldown, ['map', {
      seconds: 'float',
      cooldown_group: { type: 'string', optional: true }
    }])
    assert.deepStrictEqual(family.components.weapon, ['map', {
      item_damage_per_attack: { type: 'int', default: 1 },
      disable_blocking_for_seconds: { type: 'float', default: 0 }
    }])
    assert.deepStrictEqual(family.components.attack_range, ['map', {
      min_reach: { type: 'float', default: 0 },
      max_reach: { type: 'float', default: 3 },
      min_creative_reach: { type: 'float', default: 0 },
      max_creative_reach: { type: 'float', default: 5 },
      hitbox_margin: { type: 'float', default: 0.3 },
      mob_factor: { type: 'float', default: 1 }
    }])
    assert.deepStrictEqual(family.components.enchantable, ['map', { value: 'int' }])
    assert.deepStrictEqual(family.components.repairable, ['map', { items: 'records_holder_set' }])
    assert.strictEqual(family.components.damage_type, 'records_damage_type')
    assert.strictEqual(family.components.dye, 'string')
    assert.deepStrictEqual(family.components.lodestone_tracker, ['map', {
      target: { type: 'records_global_pos', optional: true },
      tracked: { type: 'boolean', default: true }
    }])
    assert.strictEqual(family.components.firework_explosion, 'records_firework_explosion')
    assert.deepStrictEqual(family.components.fireworks, ['map', {
      flight_duration: { type: 'int', default: 0 },
      explosions: { type: ['list', 'records_firework_explosion'], default: [] }
    }])
    assert.strictEqual(family.components.break_sound, 'records_sound_event')
    assert.strictEqual(Array.isArray(family.types.records_holder_set), true)
    assert.strictEqual(Array.isArray(family.types.records_damage_type), true)
    assert.strictEqual(Array.isArray(family.types.records_sound_event), true)
  })

  it('normalizes scalar records and rejects malformed fields', () => {
    assert.deepStrictEqual(family.converters.use_effects({
      canSprint: true,
      interactVibrations: false,
      speedMultiplier: 0.75
    }, helpers), {
      can_sprint: true,
      interact_vibrations: false,
      speed_multiplier: 0.75
    })
    assert.strictEqual(family.converters.use_effects({ canSprint: 1, interactVibrations: true, speedMultiplier: 0.2 }, helpers), undefined)
    assert.deepStrictEqual(family.converters.use_cooldown({ seconds: 1.25, cooldownGroup: 'test:shared' }, helpers), {
      seconds: 1.25,
      cooldown_group: 'test:shared'
    })
    assert.deepStrictEqual(family.converters.use_cooldown({ seconds: 1, cooldownGroup: null }, helpers), { seconds: 1 })
    assert.strictEqual(family.converters.use_cooldown({ seconds: 0, cooldownGroup: null }, helpers), undefined)
    assert.deepStrictEqual(family.converters.weapon({ itemDamagePerAttack: 2, disableBlockingForSeconds: 3 }, helpers), {
      item_damage_per_attack: 2,
      disable_blocking_for_seconds: 3
    })
    assert.strictEqual(family.converters.weapon({ itemDamagePerAttack: -1, disableBlockingForSeconds: 0 }, helpers), undefined)
    assert.deepStrictEqual(family.converters.attack_range({
      minRange: 1,
      maxRange: 4,
      minCreativeRange: 2,
      maxCreativeRange: 6,
      hitboxMargin: 0.2,
      mobFactor: 1.5
    }, helpers), {
      min_reach: 1,
      max_reach: 4,
      min_creative_reach: 2,
      max_creative_reach: 6,
      hitbox_margin: 0.2,
      mob_factor: 1.5
    })
    assert.strictEqual(family.converters.attack_range({ minRange: 65, maxRange: 4, minCreativeRange: 0, maxCreativeRange: 5, hitboxMargin: 0.2, mobFactor: 1 }, helpers), undefined)
    assert.deepStrictEqual(family.converters.enchantable(5, helpers), { value: 5 })
    assert.strictEqual(family.converters.enchantable(0, helpers), undefined)
  })

  it('resolves registry-backed values, compact holder sets, and sound holders', () => {
    const damageId = registry.loginPacket.dimensionCodec['minecraft:damage_type'].entries.findIndex(entry => entry.key === 'minecraft:generic')
    const ironId = registry.itemsByName.iron_ingot.id
    const soundId = registry.soundsArray.findIndex(entry => entry.name === 'block.stone.break')
    assert.strictEqual(family.converters.damage_type({ hasHolder: true, damageType: { damageTypeId: damageId } }, helpers), 'minecraft:generic')
    assert.strictEqual(family.converters.damage_type({ hasHolder: false, damageType: 'test:custom' }, helpers), 'test:custom')
    assert.strictEqual(family.converters.damage_type({ hasHolder: true, damageType: { damageTypeId: 999999 } }, helpers), undefined)
    assert.deepStrictEqual(family.converters.damage_type({
      hasHolder: true,
      damageType: {
        data: {
          msgId: 'custom_hit',
          scaling: 2,
          exhaustion: 0.1,
          effects: 4,
          deathMessageType: 1
        }
      }
    }, helpers), {
      message_id: 'custom_hit',
      scaling: 'always',
      exhaustion: 0.1,
      effects: 'poking',
      death_message_type: 'fall_variants'
    })
    assert.strictEqual(family.converters.damage_type({
      hasHolder: true,
      damageType: { data: { msgId: 'custom_hit', scaling: 8, exhaustion: 0, effects: 0, deathMessageType: 0 } }
    }, helpers), undefined)
    assert.deepStrictEqual(family.converters.repairable({ items: { ids: [ironId] } }, helpers), { items: 'minecraft:iron_ingot' })
    assert.deepStrictEqual(family.converters.repairable({ items: { name: '#repairs_iron' } }, helpers), { items: '#minecraft:repairs_iron' })
    assert.strictEqual(family.converters.repairable({ items: { ids: [999999] } }, helpers), undefined)
    assert.strictEqual(family.converters.dye(3, helpers), 'light_blue')
    assert.strictEqual(family.converters.dye('red', helpers), 'red')
    assert.strictEqual(family.converters.dye(16, helpers), undefined)
    assert.strictEqual(family.converters.break_sound({ soundId }, helpers), 'minecraft:block.stone.break')
    assert.strictEqual(family.converters.break_sound({ soundId: 999999 }, helpers), undefined)
    assert.deepStrictEqual(family.converters.break_sound({ data: { soundName: 'test:stone.break' } }, helpers), {
      sound_id: 'test:stone.break'
    })
    assert.deepStrictEqual(family.converters.break_sound({ data: { soundName: 'test:stone.break', fixedRange: 12 } }, helpers), {
      sound_id: 'test:stone.break',
      range: 12
    })
    assert.strictEqual(family.converters.break_sound({ data: { soundName: 3 } }, helpers), undefined)
  })

  it('converts global positions and firework records without losing order', () => {
    assert.deepStrictEqual(family.converters.lodestone_tracker({
      globalPosition: { dimensionName: 'minecraft:overworld', location: { x: 10, y: 64, z: -3 } },
      tracked: false
    }, helpers), {
      target: { dimension: 'minecraft:overworld', pos: [10, 64, -3] },
      tracked: false
    })
    assert.deepStrictEqual(family.converters.lodestone_tracker({ globalPosition: null, tracked: true }, helpers), { tracked: true })
    assert.strictEqual(family.converters.lodestone_tracker({
      globalPosition: { dimensionName: 'minecraft:overworld', location: { x: 1, y: 2 } },
      tracked: true
    }, helpers), undefined)

    const explosion = {
      shape: 2,
      colors: [0x112233, 0x445566],
      fadeColors: [0x778899],
      hasTrail: true,
      hasTwinkle: false
    }
    const convertedExplosion = {
      shape: 'star',
      colors: [0x112233, 0x445566],
      fade_colors: [0x778899],
      has_trail: true,
      has_twinkle: false
    }
    assert.deepStrictEqual(family.converters.firework_explosion(explosion, helpers), convertedExplosion)
    assert.strictEqual(family.converters.firework_explosion({ ...explosion, shape: 7 }, helpers), undefined)
    assert.deepStrictEqual(family.converters.fireworks({ flightDuration: 2, explosions: [explosion] }, helpers), {
      flight_duration: 2,
      explosions: [convertedExplosion]
    })
    assert.strictEqual(family.converters.fireworks({ flightDuration: 2, explosions: [{ ...explosion, colors: 'bad' }] }, helpers), undefined)
  })
})
