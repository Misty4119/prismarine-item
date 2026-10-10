'use strict'

const ids = ['consumable', 'death_protection', 'potion_contents', 'suspicious_stew_effects']

// These are the built-in PotionContents ordinals used by the 26.3 stream codec.
// Custom potion contents use a separate effect/color representation.
const POTIONS = [
  'water', 'mundane', 'thick', 'awkward', 'night_vision', 'long_night_vision',
  'invisibility', 'long_invisibility', 'leaping', 'long_leaping', 'strong_leaping',
  'fire_resistance', 'long_fire_resistance', 'swiftness', 'long_swiftness', 'strong_swiftness',
  'slowness', 'long_slowness', 'strong_slowness', 'turtle_master', 'long_turtle_master',
  'strong_turtle_master', 'water_breathing', 'long_water_breathing', 'healing', 'strong_healing',
  'harming', 'strong_harming', 'poison', 'long_poison', 'strong_poison', 'regeneration',
  'long_regeneration', 'strong_regeneration', 'strength', 'long_strength', 'strong_strength',
  'weakness', 'long_weakness', 'luck', 'slow_falling', 'long_slow_falling', 'wind_charged',
  'weaving', 'oozing', 'infested'
]

function validObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeEffectKey (value) {
  const separator = value.indexOf(':')
  const namespace = separator === -1 ? 'minecraft' : value.slice(0, separator)
  const path = value.slice(separator + 1)
  return `${namespace}:${path.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`
}

function normalizeMobEffectDetails (details, helpers, depth = 0) {
  if (!validObject(details) || depth > 32 || typeof details.showIcon !== 'boolean') return undefined
  const result = {}
  const fields = [
    ['amplifier', 'amplifier'],
    ['duration', 'duration'],
    ['ambient', 'ambient'],
    ['showParticles', 'show_particles'],
    ['showIcon', 'show_icon']
  ]
  for (const [source, target] of fields) {
    if (details[source] !== undefined) {
      const expected = target === 'amplifier' || target === 'duration' ? Number.isInteger(details[source]) : typeof details[source] === 'boolean'
      if (!expected || (target === 'amplifier' && details[source] < 0)) return undefined
      const defaultValue = target === 'amplifier' ? 0 : (target === 'ambient' ? false : (target === 'show_particles' ? true : undefined))
      if (defaultValue === undefined || details[source] !== defaultValue) result[target] = details[source]
    }
  }
  if (details.hiddenEffect != null) {
    const hidden = normalizeMobEffectDetails(details.hiddenEffect, helpers, depth + 1)
    if (!hidden) return undefined
    result.hidden_effect = hidden
  }
  return result
}

function normalizeMobEffect (value, helpers) {
  if (!validObject(value) || !Number.isInteger(value.id) || value.id < 0) return undefined
  const entry = helpers.registryEntry('minecraft:mob_effect', value.id)
  if (!entry) return undefined
  // minecraft-data's effect registry exposes display-style names (for example
  // "Speed"), while the persistent holder codec requires resource locations.
  const id = normalizeEffectKey(entry)
  const details = value.details == null ? {} : value.details
  if (!validObject(details)) return undefined
  const convertedDetails = normalizeMobEffectDetails(details, helpers)
  if (!convertedDetails) return undefined
  return { id, ...convertedDetails }
}

function normalizeConsumeEffect (effect, helpers) {
  if (!validObject(effect) || typeof effect.type !== 'string') return undefined
  switch (effect.type.replace(/^minecraft:/, '')) {
    case 'clear_all_effects':
      return { type: 'minecraft:clear_all_effects' }
    case 'teleport_randomly':
      if ((effect.diameter !== undefined && (!Number.isFinite(effect.diameter) || effect.diameter <= 0)) || (effect.directionalParticles !== undefined && typeof effect.directionalParticles !== 'boolean')) return undefined
      return {
        type: 'minecraft:teleport_randomly',
        ...(effect.diameter === undefined || effect.diameter === 16 ? {} : { diameter: effect.diameter }),
        ...(effect.directionalParticles === undefined || effect.directionalParticles ? {} : { directional_particles: false })
      }
    case 'apply_effects': {
      if (!Array.isArray(effect.effects)) return undefined
      const effects = helpers.all(effect.effects.map(value => normalizeMobEffect(value, helpers)))
      if (!effects || (effect.probability !== undefined && (!Number.isFinite(effect.probability) || effect.probability < 0 || effect.probability > 1))) return undefined
      return { type: 'minecraft:apply_effects', effects, ...(effect.probability === undefined || effect.probability === 1 ? {} : { probability: effect.probability }) }
    }
    case 'remove_effects': {
      const effects = helpers.holderSet(effect.effects, 'minecraft:mob_effect')
      if (effects === undefined) return undefined
      const normalize = value => value.startsWith('#') ? `#${normalizeEffectKey(value.slice(1))}` : normalizeEffectKey(value)
      return { type: 'minecraft:remove_effects', effects: Array.isArray(effects) ? effects.map(normalize) : normalize(effects) }
    }
    case 'play_sound': {
      const sound = helpers.soundEvent(effect.sound)
      return sound === undefined ? undefined : { type: 'minecraft:play_sound', sound }
    }
    default:
      return undefined
  }
}

function potionKey (id, helpers) {
  if (typeof id === 'string') return helpers.key(id)
  return Number.isInteger(id) && id >= 0 && id < POTIONS.length ? `minecraft:${POTIONS[id]}` : undefined
}

function normalizePotionEffect (effect, helpers) {
  const value = normalizeMobEffect(effect, helpers)
  if (!value) return undefined
  // PotionContents stores only the fields represented by its custom-effect codec.
  const result = { id: value.id }
  for (const field of ['amplifier', 'duration', 'ambient', 'show_particles', 'show_icon', 'hidden_effect']) {
    if (value[field] !== undefined) result[field] = value[field]
  }
  return result
}

function convertConsumable (value, helpers) {
  if (!validObject(value)) return undefined
  const sound = helpers.soundEvent(value.sound)
  const animations = ['none', 'eat', 'drink', 'block', 'bow', 'spear', 'crossbow', 'spyglass', 'toot_horn', 'brush']
  const animation = helpers.enumValue(value.animation, animations)
  if (!Number.isFinite(value.consume_seconds) || value.consume_seconds < 0 || !animation || sound === undefined || typeof value.makes_particles !== 'boolean' || !Array.isArray(value.effects)) return undefined
  const effects = helpers.all(value.effects.map(effect => normalizeConsumeEffect(effect, helpers)))
  if (!effects) return undefined
  return {
    ...(value.consume_seconds === 1.6 ? {} : { consume_seconds: value.consume_seconds }),
    ...(animation === 'eat' ? {} : { animation }),
    ...(sound === 'minecraft:entity.generic.eat' ? {} : { sound }),
    ...(value.makes_particles ? {} : { has_consume_particles: false }),
    ...(effects.length ? { on_consume_effects: effects } : {})
  }
}

function convertDeathProtection (value, helpers) {
  if (!validObject(value) || !Array.isArray(value.deathEffects)) return undefined
  const effects = helpers.all(value.deathEffects.map(effect => normalizeConsumeEffect(effect, helpers)))
  return effects && (effects.length ? { death_effects: effects } : {})
}

function convertPotionContents (value, helpers) {
  if (!validObject(value)) return undefined
  const result = {}
  if (value.potionId !== undefined && value.potionId !== null) {
    const potion = potionKey(value.potionId, helpers)
    if (!potion) return undefined
    result.potion = potion
  }
  if (value.customColor !== undefined && value.customColor !== null) {
    if (!Number.isInteger(value.customColor) || value.customColor < -2147483648 || value.customColor > 2147483647) return undefined
    result.custom_color = value.customColor
  }
  if (value.customEffects !== undefined) {
    if (!Array.isArray(value.customEffects)) return undefined
    const effects = helpers.all(value.customEffects.map(effect => normalizePotionEffect(effect, helpers)))
    if (!effects) return undefined
    if (effects.length) result.custom_effects = effects
  }
  if (value.customName !== undefined && value.customName !== null) {
    if (typeof value.customName !== 'string') return undefined
    result.custom_name = value.customName
  }
  return result
}

function convertStewEffects (value, helpers) {
  if (!validObject(value) || !Array.isArray(value.effects)) return undefined
  const result = []
  for (const entry of value.effects) {
    if (!validObject(entry) || !Number.isInteger(entry.effect) || entry.effect < 0) return undefined
    const registryId = helpers.registryEntry('minecraft:mob_effect', entry.effect)
    const id = registryId && normalizeEffectKey(registryId)
    const duration = entry.duration === undefined ? 160 : entry.duration
    if (!id || !Number.isInteger(duration) || duration < 0) return undefined
    result.push({ id, ...(duration === 160 ? {} : { duration }) })
  }
  return result
}

function codecChoice (typeOf) {
  return [
    () => { throw new Error('HashOps values are hashed on write and cannot be read back') },
    function (value, buffer, offset, args, context) {
      const type = typeOf(value)
      if (!type) throw new Error('invalid consumption codec variant')
      return this.write(value, buffer, offset, type, context)
    },
    function (value, args, context) {
      const type = typeOf(value)
      if (!type) throw new Error('invalid consumption codec variant')
      return this.sizeOf(value, type, context)
    }
  ]
}

const consumeEffectBranches = {
  'minecraft:apply_effects': ['map', {
    type: 'string',
    effects: ['list', 'consumption_mob_effect'],
    probability: { type: 'float', default: 1 }
  }],
  'minecraft:remove_effects': ['map', { type: 'string', effects: 'consumption_holder_set' }],
  'minecraft:clear_all_effects': ['map', { type: 'string' }],
  'minecraft:teleport_randomly': ['map', {
    type: 'string',
    diameter: { type: 'float', default: 16 },
    directional_particles: { type: 'boolean', default: true }
  }],
  'minecraft:play_sound': ['map', { type: 'string', sound: 'consumption_sound_event' }]
}
const consumeEffectType = codecChoice(value => consumeEffectBranches[value?.type])
const consumeSoundEventType = codecChoice(value => typeof value === 'string' ? 'string' : validObject(value) ? 'consumption_sound_event_data' : undefined)
const consumeHolderSetType = codecChoice(value => typeof value === 'string' ? 'string' : Array.isArray(value) ? ['list', 'string'] : undefined)
const consumeEffectPersistentTypes = Object.fromEntries(Object.entries(consumeEffectBranches)
  .map(([name, shape]) => [`consumption_effect_${name.slice('minecraft:'.length)}`, shape]))
const mobEffectDetailFields = {
  amplifier: { type: 'int', default: 0 },
  duration: { type: 'int', default: 0 },
  ambient: { type: 'boolean', default: false },
  show_particles: { type: 'boolean', default: true },
  show_icon: { type: 'boolean', optional: true },
  hidden_effect: { type: 'consumption_mob_effect_details', optional: true }
}

module.exports = {
  ids,
  components: {
    consumable: 'consumption_consumable',
    death_protection: 'consumption_death_protection',
    potion_contents: 'consumption_potion_contents',
    suspicious_stew_effects: 'consumption_suspicious_stew_effects'
  },
  types: {
    consumption_holder_set: consumeHolderSetType,
    consumption_sound_event_data: ['map', {
      sound_id: 'string',
      range: { type: 'float', optional: true }
    }],
    consumption_sound_event: consumeSoundEventType,
    consumption_mob_effect_details: ['map', mobEffectDetailFields],
    consumption_mob_effect: ['map', { id: 'string', ...mobEffectDetailFields }],
    consumption_effect: consumeEffectType,
    ...consumeEffectPersistentTypes,
    consumption_consumable: ['map', {
      consume_seconds: { type: 'float', default: 1.6 },
      animation: { type: 'string', default: 'eat' },
      sound: { type: 'consumption_sound_event', default: 'minecraft:entity.generic.eat' },
      has_consume_particles: { type: 'boolean', default: true },
      on_consume_effects: { type: ['list', 'consumption_effect'], default: [] }
    }],
    consumption_death_protection: ['map', {
      death_effects: { type: ['list', 'consumption_effect'], default: [] }
    }],
    consumption_potion_contents: ['map', {
      potion: { type: 'string', optional: true },
      custom_color: { type: 'int', optional: true },
      custom_effects: { type: ['list', 'consumption_mob_effect'], default: [] },
      custom_name: { type: 'string', optional: true }
    }],
    consumption_suspicious_stew_effect: ['map', {
      id: 'string',
      duration: { type: 'int', default: 160 }
    }],
    consumption_suspicious_stew_effects: ['list', 'consumption_suspicious_stew_effect']
  },
  converters: {
    consumable: convertConsumable,
    death_protection: convertDeathProtection,
    potion_contents: convertPotionContents,
    suspicious_stew_effects: convertStewEffects
  },
  normalizeConsumeEffect,
  potionKey
}
