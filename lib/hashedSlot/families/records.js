'use strict'

const DYE_COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
const DAMAGE_SCALING = ['never', 'when_caused_by_living_non_player', 'always']
const DAMAGE_EFFECTS = ['hurt', 'thorns', 'drowning', 'burning', 'poking', 'freezing']
const DEATH_MESSAGE_TYPES = ['default', 'fall_variants', 'intentional_game_design']
const FIREWORK_SHAPES = ['small_ball', 'large_ball', 'star', 'creeper', 'burst']

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

function recordFloat (value, field, min = -Infinity, max = Infinity) {
  return inRange(value?.[field], min, max) ? value[field] : undefined
}

function convertDamageTypeData (data, helpers) {
  if (!isRecord(data) || typeof data.msgId !== 'string' || data.msgId.length === 0 || !isFiniteNumber(data.exhaustion)) return undefined
  const scaling = helpers.enumValue(data.scaling, DAMAGE_SCALING)
  const effects = helpers.enumValue(data.effects, DAMAGE_EFFECTS)
  const deathMessageType = helpers.enumValue(data.deathMessageType, DEATH_MESSAGE_TYPES)
  if (scaling === undefined || effects === undefined || deathMessageType === undefined) return undefined
  return {
    message_id: data.msgId,
    scaling,
    exhaustion: data.exhaustion,
    effects,
    death_message_type: deathMessageType
  }
}

function convertDamageType (data, helpers) {
  if (!isRecord(data) || typeof data.hasHolder !== 'boolean') return undefined
  if (!data.hasHolder) return validResourceKey(data.damageType, helpers)
  return helpers.holder(data.damageType, 'minecraft:damage_type', 'damageTypeId', 'data', value => convertDamageTypeData(value, helpers))
}

function convertSoundEvent (data, helpers) {
  return helpers.soundEvent(data)
}

function convertUseEffects (data) {
  if (!isRecord(data) || typeof data.canSprint !== 'boolean' || typeof data.interactVibrations !== 'boolean' || !inRange(data.speedMultiplier, 0, 1)) return undefined
  return {
    can_sprint: data.canSprint,
    interact_vibrations: data.interactVibrations,
    speed_multiplier: data.speedMultiplier
  }
}

function convertUseCooldown (data, helpers) {
  if (!isRecord(data) || !inRange(data.seconds, Number.MIN_VALUE, Infinity)) return undefined
  const result = { seconds: data.seconds }
  if (data.cooldownGroup != null) {
    const group = validResourceKey(data.cooldownGroup, helpers)
    if (!group) return undefined
    result.cooldown_group = group
  }
  return result
}

function convertWeapon (data) {
  if (!isRecord(data) || !isNonNegativeInt(data.itemDamagePerAttack) || !inRange(data.disableBlockingForSeconds, 0, Infinity)) return undefined
  return {
    item_damage_per_attack: data.itemDamagePerAttack,
    disable_blocking_for_seconds: data.disableBlockingForSeconds
  }
}

function convertAttackRange (data) {
  if (!isRecord(data)) return undefined
  const fields = [
    ['minRange', 'min_reach', 0, 64],
    ['maxRange', 'max_reach', 0, 64],
    ['minCreativeRange', 'min_creative_reach', 0, 64],
    ['maxCreativeRange', 'max_creative_reach', 0, 64],
    ['hitboxMargin', 'hitbox_margin', 0, 1],
    ['mobFactor', 'mob_factor', 0, 2]
  ]
  const result = {}
  for (const [networkName, codecName, min, max] of fields) {
    const number = recordFloat(data, networkName, min, max)
    if (number === undefined) return undefined
    result[codecName] = number
  }
  return result
}

function convertEnchantable (data) {
  return isInteger(data) && data > 0 && data <= 2147483647 ? { value: data } : undefined
}

function convertRepairable (data, helpers) {
  if (!isRecord(data)) return undefined
  const items = helpers.holderSet(data.items, 'minecraft:item')
  if (items === undefined) return undefined
  let normalized
  if (typeof items === 'string' && items.startsWith('#')) {
    const tag = validResourceKey(items.slice(1), helpers)
    if (!tag) return undefined
    normalized = `#${tag}`
  } else if (Array.isArray(items)) {
    normalized = helpers.all(items.map(value => validResourceKey(value, helpers)))
    if (!normalized) return undefined
  } else {
    normalized = validResourceKey(items, helpers)
    if (!normalized) return undefined
  }
  return { items: normalized }
}

function convertDye (data, helpers) {
  return helpers.enumValue(data, DYE_COLORS)
}

function convertGlobalPosition (data, helpers) {
  if (!isRecord(data)) return undefined
  const dimension = validResourceKey(data.dimensionName, helpers)
  const location = data.location
  if (!dimension || !isRecord(location) || ![location.x, location.y, location.z].every(value => isInteger(value) && value >= -2147483648 && value <= 2147483647)) return undefined
  return { dimension, pos: [location.x, location.y, location.z] }
}

function convertLodestoneTracker (data, helpers) {
  if (!isRecord(data) || typeof data.tracked !== 'boolean') return undefined
  const result = { tracked: data.tracked }
  if (data.globalPosition != null) {
    const target = convertGlobalPosition(data.globalPosition, helpers)
    if (!target) return undefined
    result.target = target
  }
  return result
}

function convertFireworkExplosion (data, helpers) {
  if (!isRecord(data)) return undefined
  const shape = helpers.enumValue(data.shape, FIREWORK_SHAPES)
  if (shape === undefined || !Array.isArray(data.colors) || !Array.isArray(data.fadeColors) ||
      !data.colors.every(value => isInteger(value) && value >= -2147483648 && value <= 2147483647) ||
      !data.fadeColors.every(value => isInteger(value) && value >= -2147483648 && value <= 2147483647) ||
      typeof data.hasTrail !== 'boolean' || typeof data.hasTwinkle !== 'boolean') return undefined
  return {
    shape,
    colors: data.colors,
    fade_colors: data.fadeColors,
    has_trail: data.hasTrail,
    has_twinkle: data.hasTwinkle
  }
}

function convertFireworks (data, helpers) {
  if (!isRecord(data) || !isInteger(data.flightDuration) || data.flightDuration < 0 || data.flightDuration > 255 ||
      !Array.isArray(data.explosions) || data.explosions.length > 256) return undefined
  const explosions = helpers.all(data.explosions.map(explosion => convertFireworkExplosion(explosion, helpers)))
  if (!explosions) return undefined
  return { flight_duration: data.flightDuration, explosions }
}

const ids = [
  'use_effects', 'use_cooldown', 'weapon', 'attack_range', 'enchantable', 'damage_type',
  'repairable', 'dye', 'lodestone_tracker', 'firework_explosion', 'fireworks', 'break_sound'
]

const types = {
  records_holder_set: codecVariant(value => typeof value === 'string' ? 'string' : Array.isArray(value) ? ['list', 'string'] : undefined),
  records_damage_type_data: ['map', {
    message_id: 'string',
    scaling: 'string',
    exhaustion: 'float',
    effects: { type: 'string', default: 'hurt' },
    death_message_type: { type: 'string', default: 'default' }
  }],
  records_damage_type: codecVariant(value => typeof value === 'string' ? 'string' : isRecord(value) ? 'records_damage_type_data' : undefined),
  records_sound_event_data: ['map', {
    sound_id: 'string',
    range: { type: 'float', optional: true }
  }],
  records_sound_event: codecVariant(value => typeof value === 'string' ? 'string' : isRecord(value) ? 'records_sound_event_data' : undefined),
  records_global_pos: ['map', {
    dimension: 'string',
    pos: 'int_array'
  }],
  records_firework_explosion: ['map', {
    shape: 'string',
    colors: { type: ['list', 'int'], default: [] },
    fade_colors: { type: ['list', 'int'], default: [] },
    has_trail: { type: 'boolean', default: false },
    has_twinkle: { type: 'boolean', default: false }
  }]
}

const components = {
  use_effects: ['map', {
    can_sprint: { type: 'boolean', default: false },
    interact_vibrations: { type: 'boolean', default: true },
    speed_multiplier: { type: 'float', default: 0.2 }
  }],
  use_cooldown: ['map', {
    seconds: 'float',
    cooldown_group: { type: 'string', optional: true }
  }],
  weapon: ['map', {
    item_damage_per_attack: { type: 'int', default: 1 },
    disable_blocking_for_seconds: { type: 'float', default: 0 }
  }],
  attack_range: ['map', {
    min_reach: { type: 'float', default: 0 },
    max_reach: { type: 'float', default: 3 },
    min_creative_reach: { type: 'float', default: 0 },
    max_creative_reach: { type: 'float', default: 5 },
    hitbox_margin: { type: 'float', default: 0.3 },
    mob_factor: { type: 'float', default: 1 }
  }],
  enchantable: ['map', { value: 'int' }],
  damage_type: 'records_damage_type',
  repairable: ['map', { items: 'records_holder_set' }],
  dye: 'string',
  lodestone_tracker: ['map', {
    target: { type: 'records_global_pos', optional: true },
    tracked: { type: 'boolean', default: true }
  }],
  firework_explosion: 'records_firework_explosion',
  fireworks: ['map', {
    flight_duration: { type: 'int', default: 0 },
    explosions: { type: ['list', 'records_firework_explosion'], default: [] }
  }],
  break_sound: 'records_sound_event'
}

const converters = {
  use_effects: convertUseEffects,
  use_cooldown: convertUseCooldown,
  weapon: convertWeapon,
  attack_range: convertAttackRange,
  enchantable: convertEnchantable,
  damage_type: convertDamageType,
  repairable: convertRepairable,
  dye: convertDye,
  lodestone_tracker: convertLodestoneTracker,
  firework_explosion: convertFireworkExplosion,
  fireworks: convertFireworks,
  break_sound: convertSoundEvent
}

module.exports = { ids, types, components, converters }
