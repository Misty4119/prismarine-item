'use strict'

const EQUIPMENT_SLOTS = {
  main_hand: 'mainhand',
  off_hand: 'offhand',
  feet: 'feet',
  legs: 'legs',
  chest: 'chest',
  head: 'head',
  body: 'body',
  saddle: 'saddle'
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value)
const isInteger = value => Number.isInteger(value)
const isNonNegativeInt = value => isInteger(value) && value >= 0 && value <= 2147483647
const inRange = (value, min, max) => isFiniteNumber(value) && value >= min && value <= max
const resourceKeyPattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/

function codecVariant (typeOf) {
  return [
    function () {
      throw new Error('HashedSlot variant values are written only')
    },
    function (value, buffer, offset, args, context) {
      const type = typeOf(value)
      if (!type) throw new Error('invalid value for HashedSlot codec variant')
      return this.write(value, buffer, offset, type, context)
    },
    function (value, args, context) {
      const type = typeOf(value)
      if (!type) throw new Error('invalid value for HashedSlot codec variant')
      return this.sizeOf(value, type, context)
    }
  ]
}

function validResourceKey (value, helpers) {
  const normalized = helpers.key(value)
  return normalized && resourceKeyPattern.test(normalized) ? normalized : undefined
}

function normalizeHolderSet (value, registryName, helpers) {
  const entries = helpers.holderSet(value, registryName)
  if (entries === undefined) return undefined
  if (typeof entries === 'string') {
    if (entries.startsWith('#')) {
      const tag = validResourceKey(entries.slice(1), helpers)
      return tag ? `#${tag}` : undefined
    }
    return validResourceKey(entries, helpers)
  }
  if (!Array.isArray(entries)) return undefined
  return helpers.all(entries.map(entry => validResourceKey(entry, helpers)))
}

function convertSoundEvent (data, helpers) {
  return helpers.soundEvent(data)
}

function convertCondition (data) {
  if (!isRecord(data) || !isNonNegativeInt(data.maxDurationTicks) ||
      !inRange(data.minSpeed, -Infinity, Infinity) || !inRange(data.minRelativeSpeed, -Infinity, Infinity)) return undefined
  return {
    max_duration_ticks: data.maxDurationTicks,
    min_speed: data.minSpeed,
    min_relative_speed: data.minRelativeSpeed
  }
}

function convertDamageResistant (data, helpers) {
  if (!isRecord(data)) return undefined
  const types = normalizeHolderSet(data, 'minecraft:damage_type', helpers)
  return types === undefined ? undefined : { types }
}

function convertTool (data, helpers) {
  if (!isRecord(data) || !Array.isArray(data.rules) || !inRange(data.defaultMiningSpeed, -Infinity, Infinity) ||
      !isNonNegativeInt(data.damagePerBlock) || typeof data.canDestroyBlocksInCreative !== 'boolean') return undefined

  const rules = helpers.all(data.rules.map(rule => {
    if (!isRecord(rule)) return undefined
    const blocks = normalizeHolderSet(rule.blocks, 'minecraft:block', helpers)
    if (blocks === undefined) return undefined
    const converted = { blocks }
    if (rule.speed != null) {
      if (!inRange(rule.speed, Number.MIN_VALUE, Infinity)) return undefined
      converted.speed = rule.speed
    }
    if (rule.correctDropForBlocks != null) {
      if (typeof rule.correctDropForBlocks !== 'boolean') return undefined
      converted.correct_for_drops = rule.correctDropForBlocks
    }
    return converted
  }))
  if (!rules) return undefined

  return {
    rules,
    default_mining_speed: data.defaultMiningSpeed,
    damage_per_block: data.damagePerBlock,
    can_destroy_blocks_in_creative: data.canDestroyBlocksInCreative
  }
}

function convertEquippable (data, helpers) {
  if (!isRecord(data) || typeof data.slot !== 'string' || EQUIPMENT_SLOTS[data.slot] === undefined ||
      typeof data.dispensable !== 'boolean' || typeof data.swappable !== 'boolean' ||
      typeof data.damageable !== 'boolean' || typeof data.equipOnInteract !== 'boolean' ||
      typeof data.shearable !== 'boolean') return undefined

  const equipSound = convertSoundEvent(data.sound, helpers)
  const shearingSound = convertSoundEvent(data.shearingSound, helpers)
  if (equipSound === undefined || shearingSound === undefined) return undefined

  const result = {
    slot: EQUIPMENT_SLOTS[data.slot],
    equip_sound: equipSound,
    dispensable: data.dispensable,
    swappable: data.swappable,
    damage_on_hurt: data.damageable,
    equip_on_interact: data.equipOnInteract,
    can_be_sheared: data.shearable,
    shearing_sound: shearingSound
  }

  if (data.model != null) {
    const assetId = validResourceKey(data.model, helpers)
    if (!assetId) return undefined
    result.asset_id = assetId
  }
  if (data.cameraOverlay != null) {
    const cameraOverlay = validResourceKey(data.cameraOverlay, helpers)
    if (!cameraOverlay) return undefined
    result.camera_overlay = cameraOverlay
  }
  if (data.allowedEntities != null) {
    const allowedEntities = normalizeHolderSet(data.allowedEntities, 'minecraft:entity_type', helpers)
    if (allowedEntities === undefined) return undefined
    result.allowed_entities = allowedEntities
  }
  return result
}

function convertDamageReduction (data, helpers) {
  if (!isRecord(data) || !inRange(data.horizontalBlockingAngle, Number.MIN_VALUE, Infinity) ||
      !isFiniteNumber(data.base) || !isFiniteNumber(data.factor)) return undefined
  const result = {
    horizontal_blocking_angle: data.horizontalBlockingAngle,
    base: data.base,
    factor: data.factor
  }
  if (data.type != null) {
    const type = normalizeHolderSet(data.type, 'minecraft:damage_type', helpers)
    if (type === undefined) return undefined
    result.type = type
  }
  return result
}

function convertItemDamage (data) {
  if (!isRecord(data) || !inRange(data.threshold, 0, Infinity) || !isFiniteNumber(data.base) || !isFiniteNumber(data.factor)) return undefined
  return { threshold: data.threshold, base: data.base, factor: data.factor }
}

function convertBlocksAttacks (data, helpers) {
  if (!isRecord(data) || !inRange(data.blockDelaySeconds, 0, Infinity) || !inRange(data.disableCooldownScale, 0, Infinity) ||
      !Array.isArray(data.damageReductions)) return undefined
  const damageReductions = helpers.all(data.damageReductions.map(reduction => convertDamageReduction(reduction, helpers)))
  const itemDamage = convertItemDamage(data.itemDamage)
  if (!damageReductions || !itemDamage) return undefined

  const result = {
    block_delay_seconds: data.blockDelaySeconds,
    disable_cooldown_scale: data.disableCooldownScale,
    damage_reductions: damageReductions,
    item_damage: itemDamage
  }

  if (data.bypassedBy != null) {
    if (typeof data.bypassedBy !== 'string' || data.bypassedBy.length === 0) return undefined
    const tagName = data.bypassedBy.startsWith('#') ? data.bypassedBy.slice(1) : data.bypassedBy
    const tag = validResourceKey(tagName, helpers)
    if (!tag) return undefined
    result.bypassed_by = `#${tag}`
  }
  for (const [networkName, codecName] of [['blockSound', 'block_sound'], ['disableSound', 'disabled_sound']]) {
    if (data[networkName] != null) {
      const sound = convertSoundEvent(data[networkName], helpers)
      if (sound === undefined) return undefined
      result[codecName] = sound
    }
  }
  return result
}

function convertPiercingWeapon (data, helpers) {
  if (!isRecord(data) || typeof data.dealsKnockback !== 'boolean' || typeof data.dismounts !== 'boolean') return undefined
  const result = { deals_knockback: data.dealsKnockback, dismounts: data.dismounts }
  if (data.sound != null) {
    const sound = convertSoundEvent(data.sound, helpers)
    if (sound === undefined) return undefined
    result.sound = sound
  }
  if (data.hitSound != null) {
    const hitSound = convertSoundEvent(data.hitSound, helpers)
    if (hitSound === undefined) return undefined
    result.hit_sound = hitSound
  }
  return result
}

function convertKineticWeapon (data, helpers) {
  if (!isRecord(data) || !isNonNegativeInt(data.contactCooldownTicks) ||
      !isNonNegativeInt(data.delayTicks) || !isFiniteNumber(data.forwardMovement) ||
      !isFiniteNumber(data.damageMultiplier)) return undefined

  const result = {
    contact_cooldown_ticks: data.contactCooldownTicks,
    delay_ticks: data.delayTicks,
    forward_movement: data.forwardMovement,
    damage_multiplier: data.damageMultiplier
  }
  for (const [networkName, codecName] of [
    ['dismountConditions', 'dismount_conditions'],
    ['knockbackConditions', 'knockback_conditions'],
    ['damageConditions', 'damage_conditions']
  ]) {
    if (data[networkName] != null) {
      const condition = convertCondition(data[networkName])
      if (!condition) return undefined
      result[codecName] = condition
    }
  }
  for (const [networkName, codecName] of [['sound', 'sound'], ['hitSound', 'hit_sound']]) {
    if (data[networkName] != null) {
      const sound = convertSoundEvent(data[networkName], helpers)
      if (sound === undefined) return undefined
      result[codecName] = sound
    }
  }
  return result
}

const ids = ['damage_resistant', 'tool', 'equippable', 'blocks_attacks', 'piercing_weapon', 'kinetic_weapon']

const types = {
  combat_holder_set: codecVariant(value => typeof value === 'string' ? 'string' : Array.isArray(value) ? ['list', 'string'] : undefined),
  combat_sound_event_data: ['map', {
    sound_id: 'string',
    range: { type: 'float', optional: true }
  }],
  combat_sound_event: codecVariant(value => typeof value === 'string' ? 'string' : isRecord(value) ? 'combat_sound_event_data' : undefined),
  combat_tool_rule: ['map', {
    blocks: 'combat_holder_set',
    speed: { type: 'float', optional: true },
    correct_for_drops: { type: 'boolean', optional: true }
  }],
  combat_tool: ['map', {
    rules: ['list', 'combat_tool_rule'],
    default_mining_speed: { type: 'float', default: 1 },
    damage_per_block: { type: 'int', default: 1 },
    can_destroy_blocks_in_creative: { type: 'boolean', default: true }
  }],
  combat_equippable: ['map', {
    slot: 'string',
    equip_sound: { type: 'combat_sound_event', default: 'minecraft:item.armor.equip_generic' },
    asset_id: { type: 'string', optional: true },
    camera_overlay: { type: 'string', optional: true },
    allowed_entities: { type: 'combat_holder_set', optional: true },
    dispensable: { type: 'boolean', default: true },
    swappable: { type: 'boolean', default: true },
    damage_on_hurt: { type: 'boolean', default: true },
    equip_on_interact: { type: 'boolean', default: false },
    can_be_sheared: { type: 'boolean', default: false },
    shearing_sound: { type: 'combat_sound_event', default: 'minecraft:item.shears.snip' }
  }],
  combat_damage_reduction: ['map', {
    horizontal_blocking_angle: { type: 'float', default: 90 },
    type: { type: 'combat_holder_set', optional: true },
    base: 'float',
    factor: 'float'
  }],
  combat_item_damage: ['map', {
    threshold: 'float',
    base: 'float',
    factor: 'float'
  }],
  combat_blocks_attacks: ['map', {
    block_delay_seconds: { type: 'float', default: 0 },
    disable_cooldown_scale: { type: 'float', default: 1 },
    damage_reductions: {
      type: ['list', 'combat_damage_reduction'],
      default: [{ horizontal_blocking_angle: 90, base: 0, factor: 1 }]
    },
    item_damage: { type: 'combat_item_damage', default: { threshold: 1, base: 0, factor: 1 } },
    bypassed_by: { type: 'combat_holder_set', optional: true },
    block_sound: { type: 'combat_sound_event', optional: true },
    disabled_sound: { type: 'combat_sound_event', optional: true }
  }],
  combat_piercing_weapon: ['map', {
    deals_knockback: { type: 'boolean', default: true },
    dismounts: { type: 'boolean', default: false },
    sound: { type: 'combat_sound_event', optional: true },
    hit_sound: { type: 'combat_sound_event', optional: true }
  }],
  combat_condition: ['map', {
    max_duration_ticks: 'int',
    min_speed: { type: 'float', default: 0 },
    min_relative_speed: { type: 'float', default: 0 }
  }],
  combat_kinetic_weapon: ['map', {
    contact_cooldown_ticks: { type: 'int', default: 10 },
    delay_ticks: { type: 'int', default: 0 },
    dismount_conditions: { type: 'combat_condition', optional: true },
    knockback_conditions: { type: 'combat_condition', optional: true },
    damage_conditions: { type: 'combat_condition', optional: true },
    forward_movement: { type: 'float', default: 0 },
    damage_multiplier: { type: 'float', default: 1 },
    sound: { type: 'combat_sound_event', optional: true },
    hit_sound: { type: 'combat_sound_event', optional: true }
  }]
}

const components = {
  damage_resistant: ['map', { types: 'combat_holder_set' }],
  tool: 'combat_tool',
  equippable: 'combat_equippable',
  blocks_attacks: 'combat_blocks_attacks',
  piercing_weapon: 'combat_piercing_weapon',
  kinetic_weapon: 'combat_kinetic_weapon'
}

const converters = {
  damage_resistant: convertDamageResistant,
  tool: convertTool,
  equippable: convertEquippable,
  blocks_attacks: convertBlocksAttacks,
  piercing_weapon: convertPiercingWeapon,
  kinetic_weapon: convertKineticWeapon
}

module.exports = { ids, types, components, converters }
