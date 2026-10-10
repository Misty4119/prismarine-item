/* eslint-env mocha */

const assert = require('assert')
const createHelpers = require('../lib/hashedSlot/families/helpers')
const family = require('../lib/hashedSlot/families/combat')

describe('protocol 777 combat hashed component family', () => {
  const registry = require('prismarine-registry')('26.3')
  const helpers = createHelpers(registry)

  it('declares the complete combat component list and persistent codec shapes', () => {
    const expectedIds = ['damage_resistant', 'tool', 'equippable', 'blocks_attacks', 'piercing_weapon', 'kinetic_weapon']
    assert.deepStrictEqual(family.ids, expectedIds)
    assert.deepStrictEqual(Object.keys(family.components).sort(), [...expectedIds].sort())
    assert.deepStrictEqual(family.components.damage_resistant, ['map', { types: 'combat_holder_set' }])
    assert.strictEqual(family.components.tool, 'combat_tool')
    assert.strictEqual(family.components.equippable, 'combat_equippable')
    assert.strictEqual(family.components.blocks_attacks, 'combat_blocks_attacks')
    assert.strictEqual(family.components.piercing_weapon, 'combat_piercing_weapon')
    assert.strictEqual(family.components.kinetic_weapon, 'combat_kinetic_weapon')
    assert.strictEqual(Array.isArray(family.types.combat_holder_set), true)
    assert.strictEqual(Array.isArray(family.types.combat_sound_event), true)
    assert.deepStrictEqual(family.types.combat_tool, ['map', {
      rules: ['list', 'combat_tool_rule'],
      default_mining_speed: { type: 'float', default: 1 },
      damage_per_block: { type: 'int', default: 1 },
      can_destroy_blocks_in_creative: { type: 'boolean', default: true }
    }])
  })

  it('converts damage resistance and tool rules using the active registries', () => {
    const fireId = registry.loginPacket.dimensionCodec['minecraft:damage_type'].entries.findIndex(entry => entry.key === 'minecraft:in_fire')
    const stoneId = registry.blocksByName.stone.id
    assert.deepStrictEqual(family.converters.damage_resistant({ ids: [fireId] }, helpers), {
      types: 'minecraft:in_fire'
    })
    assert.deepStrictEqual(family.converters.damage_resistant({ name: '#is_fire' }, helpers), {
      types: '#minecraft:is_fire'
    })
    assert.strictEqual(family.converters.damage_resistant({ ids: [999999] }, helpers), undefined)

    assert.deepStrictEqual(family.converters.tool({
      rules: [{ blocks: { ids: [stoneId] }, speed: 5, correctDropForBlocks: true }],
      defaultMiningSpeed: 1.5,
      damagePerBlock: 2,
      canDestroyBlocksInCreative: false
    }, helpers), {
      rules: [{ blocks: 'minecraft:stone', speed: 5, correct_for_drops: true }],
      default_mining_speed: 1.5,
      damage_per_block: 2,
      can_destroy_blocks_in_creative: false
    })
    assert.strictEqual(family.converters.tool({
      rules: [{ blocks: { ids: [999999] }, speed: null, correctDropForBlocks: null }],
      defaultMiningSpeed: 1,
      damagePerBlock: 1,
      canDestroyBlocksInCreative: true
    }, helpers), undefined)
  })

  it('normalizes equippable slots, sound holders, assets, and optional entity sets', () => {
    const soundId = registry.soundsArray.findIndex(entry => entry.name === 'item.armor.equip_iron')
    const zombieId = registry.entitiesByName.zombie.id
    assert.deepStrictEqual(family.converters.equippable({
      slot: 'main_hand',
      sound: { soundId },
      model: 'minecraft:iron',
      cameraOverlay: null,
      allowedEntities: { ids: [zombieId] },
      dispensable: true,
      swappable: false,
      damageable: true,
      equipOnInteract: false,
      shearable: true,
      shearingSound: { data: { soundName: 'test:shear', fixedRange: null } }
    }, helpers), {
      slot: 'mainhand',
      equip_sound: 'minecraft:item.armor.equip_iron',
      asset_id: 'minecraft:iron',
      allowed_entities: 'minecraft:zombie',
      dispensable: true,
      swappable: false,
      damage_on_hurt: true,
      equip_on_interact: false,
      can_be_sheared: true,
      shearing_sound: { sound_id: 'test:shear' }
    })
    assert.strictEqual(family.converters.equippable({
      slot: 'missing',
      sound: { soundId },
      model: null,
      cameraOverlay: null,
      allowedEntities: null,
      dispensable: true,
      swappable: true,
      damageable: true,
      equipOnInteract: false,
      shearable: false,
      shearingSound: { soundId }
    }, helpers), undefined)
    assert.strictEqual(family.converters.equippable({
      slot: 'main_hand',
      sound: { soundId: 999999 },
      model: null,
      cameraOverlay: null,
      allowedEntities: null,
      dispensable: true,
      swappable: true,
      damageable: true,
      equipOnInteract: false,
      shearable: false,
      shearingSound: { soundId }
    }, helpers), undefined)
  })

  it('normalizes blocking damage reductions and optional registry and sound holders', () => {
    const fireId = registry.loginPacket.dimensionCodec['minecraft:damage_type'].entries.findIndex(entry => entry.key === 'minecraft:in_fire')
    const soundId = registry.soundsArray.findIndex(entry => entry.name === 'item.shield.block')
    assert.deepStrictEqual(family.converters.blocks_attacks({
      blockDelaySeconds: 0.5,
      disableCooldownScale: 0.75,
      damageReductions: [{ horizontalBlockingAngle: 90, type: { ids: [fireId] }, base: 1, factor: 0.5 }],
      itemDamage: { threshold: 3, base: 1, factor: 0.5 },
      bypassedBy: 'bypasses_shield',
      blockSound: { soundId },
      disableSound: null
    }, helpers), {
      block_delay_seconds: 0.5,
      disable_cooldown_scale: 0.75,
      damage_reductions: [{ horizontal_blocking_angle: 90, type: 'minecraft:in_fire', base: 1, factor: 0.5 }],
      item_damage: { threshold: 3, base: 1, factor: 0.5 },
      bypassed_by: '#minecraft:bypasses_shield',
      block_sound: 'minecraft:item.shield.block'
    })
    assert.strictEqual(family.converters.blocks_attacks({
      blockDelaySeconds: 0,
      disableCooldownScale: 1,
      damageReductions: [{ horizontalBlockingAngle: 90, type: { ids: [999999] }, base: 0, factor: 1 }],
      itemDamage: { threshold: 1, base: 0, factor: 1 },
      bypassedBy: null,
      blockSound: null,
      disableSound: null
    }, helpers), undefined)
  })

  it('converts optional piercing and kinetic weapon conditions and sounds', () => {
    const soundId = registry.soundsArray.findIndex(entry => entry.name === 'item.trident.throw')
    assert.deepStrictEqual(family.converters.piercing_weapon({
      dealsKnockback: false,
      dismounts: true,
      sound: { soundId },
      hitSound: null
    }, helpers), {
      deals_knockback: false,
      dismounts: true,
      sound: 'minecraft:item.trident.throw'
    })
    assert.deepStrictEqual(family.converters.kinetic_weapon({
      contactCooldownTicks: 10,
      delayTicks: 2,
      dismountConditions: { maxDurationTicks: 3, minSpeed: 0.5, minRelativeSpeed: 0.25 },
      knockbackConditions: null,
      damageConditions: { maxDurationTicks: 8, minSpeed: 0, minRelativeSpeed: 1 },
      forwardMovement: 0.2,
      damageMultiplier: 1.5,
      sound: { soundId },
      hitSound: { data: { soundName: 'test:hit', fixedRange: 8 } }
    }, helpers), {
      contact_cooldown_ticks: 10,
      delay_ticks: 2,
      dismount_conditions: { max_duration_ticks: 3, min_speed: 0.5, min_relative_speed: 0.25 },
      damage_conditions: { max_duration_ticks: 8, min_speed: 0, min_relative_speed: 1 },
      forward_movement: 0.2,
      damage_multiplier: 1.5,
      sound: 'minecraft:item.trident.throw',
      hit_sound: { sound_id: 'test:hit', range: 8 }
    })
    assert.strictEqual(family.converters.kinetic_weapon({
      contactCooldownTicks: -1,
      delayTicks: 0,
      dismountConditions: null,
      knockbackConditions: null,
      damageConditions: null,
      forwardMovement: 0,
      damageMultiplier: 1,
      sound: null,
      hitSound: null
    }, helpers), undefined)
  })
})
