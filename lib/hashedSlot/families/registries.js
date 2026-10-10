'use strict'

const ids = [
  'trim',
  'instrument',
  'provides_trim_material',
  'jukebox_playable',
  'provides_banner_patterns',
  'banner_patterns'
]

const codecText = 'text'
const trimMaterialData = ['map', { palette_id: 'string', description: codecText }]
const trimPatternData = ['map', {
  asset_id: 'string',
  description: codecText,
  decal: { type: 'boolean', default: false }
}]
const instrumentData = ['map', {
  sound_event: 'sound_event_holder',
  use_duration: 'float',
  range: 'float',
  description: codecText
}]
const soundEventData = ['map', {
  sound_id: 'string',
  range: { type: 'float', optional: true }
}]
const jukeboxSongData = ['map', {
  sound_event: 'sound_event_holder',
  description: codecText,
  length_in_seconds: 'float',
  comparator_output: 'int'
}]
const bannerPatternData = ['map', {
  asset_id: 'string',
  translation_key: 'string'
}]
const bannerPatternLayer = ['map', {
  pattern: 'banner_pattern_holder',
  color: 'string'
}]
const dyeColors = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
]
const NBT_TAG_TYPES = new Set(['byte', 'short', 'int', 'long', 'float', 'double', 'byteArray', 'string', 'list', 'compound', 'intArray', 'longArray'])

function resourceKey (value, helpers) {
  const normalized = helpers.key(value)
  return normalized && /^[a-z0-9_.-]+:[a-z0-9/._-]+$/.test(normalized) ? normalized : undefined
}

function isNbtTag (value) {
  return value !== null && typeof value === 'object' && NBT_TAG_TYPES.has(value.type) && Object.prototype.hasOwnProperty.call(value, 'value')
}

function isOverrideArmorAssets (value) {
  return Array.isArray(value) && value.every(entry => entry && typeof entry.key === 'string' && typeof entry.value === 'string')
}

function choice (recordType) {
  return [
    () => { throw new Error('HashOps values are hashed on write and cannot be read back') },
    function (value, buffer, offset, args, context) {
      const type = typeof value === 'string' ? 'string' : value && typeof value === 'object' ? recordType : undefined
      if (!type) throw new Error('invalid value for registry holder codec')
      return this.write(value, buffer, offset, type, context)
    },
    function (value, args, context) {
      const type = typeof value === 'string' ? 'string' : value && typeof value === 'object' ? recordType : undefined
      if (!type) throw new Error('invalid value for registry holder codec')
      return this.sizeOf(value, type, context)
    }
  ]
}

function compactHolderSet () {
  const typeOf = value => {
    if (typeof value === 'string') return 'string'
    if (Array.isArray(value) && value.every(entry => typeof entry === 'string')) return ['list', 'string']
    return undefined
  }

  return [
    () => { throw new Error('HashOps values are hashed on write and cannot be read back') },
    function (value, buffer, offset, args, context) {
      const type = typeOf(value)
      if (!type) throw new Error('invalid value for compact registry holder set')
      return this.write(value, buffer, offset, type, context)
    },
    function (value, args, context) {
      const type = typeOf(value)
      if (!type) throw new Error('invalid value for compact registry holder set')
      return this.sizeOf(value, type, context)
    }
  ]
}

const types = {
  registries_trim: ['map', { material: 'trim_material_holder', pattern: 'trim_pattern_holder' }],
  trim_material_data: trimMaterialData,
  trim_pattern_data: trimPatternData,
  instrument_data: instrumentData,
  sound_event_data: soundEventData,
  jukebox_song_data: jukeboxSongData,
  banner_pattern_data: bannerPatternData,
  trim_material_holder: choice(trimMaterialData),
  trim_pattern_holder: choice(trimPatternData),
  instrument_holder: choice(instrumentData),
  sound_event_holder: choice(soundEventData),
  jukebox_song_holder: choice(jukeboxSongData),
  banner_pattern_holder_set: compactHolderSet(),
  banner_pattern_holder: choice(bannerPatternData),
  banner_pattern_layer: bannerPatternLayer,
  banner_pattern_layers: ['list', 'banner_pattern_layer']
}

function convertTrimMaterial (data, helpers) {
  if (!data || typeof data !== 'object' || typeof data.assetBase !== 'string' || !isOverrideArmorAssets(data.overrideArmorAssets) || !isNbtTag(data.description)) return undefined
  const paletteId = resourceKey(data.assetBase, helpers)
  if (!paletteId) return undefined
  return { palette_id: paletteId, description: data.description }
}

function convertTrimPattern (data, helpers) {
  if (!data || typeof data !== 'object' || typeof data.assetId !== 'string' || !isNbtTag(data.description) || typeof data.decal !== 'boolean') return undefined
  const assetId = resourceKey(data.assetId, helpers)
  if (!assetId) return undefined
  return { asset_id: assetId, description: data.description, decal: data.decal }
}

function convertTrim (value, helpers) {
  if (!value || typeof value !== 'object') return undefined
  const material = helpers.holder(value.material, 'minecraft:trim_material', 'materialId', 'data', data => convertTrimMaterial(data, helpers))
  const pattern = helpers.holder(value.pattern, 'minecraft:trim_pattern', 'patternId', 'data', data => convertTrimPattern(data, helpers))
  if (material === undefined || pattern === undefined) return undefined
  return { material, pattern }
}

function convertProvidesTrimMaterial (value, helpers) {
  if (!value || typeof value !== 'object' || typeof value.hasHolder !== 'boolean') return undefined
  if (!value.hasHolder) return resourceKey(value.material, helpers)
  return helpers.holder(value.material, 'minecraft:trim_material', 'materialId', 'data', data => convertTrimMaterial(data, helpers))
}

function convertInstrumentData (data, helpers) {
  if (!data || typeof data !== 'object' || typeof data.useDuration !== 'number' || !Number.isFinite(data.useDuration) ||
    typeof data.range !== 'number' || !Number.isFinite(data.range) || !isNbtTag(data.description)) return undefined
  const soundEvent = helpers.soundEvent(data.soundEvent)
  if (soundEvent === undefined) return undefined
  return {
    sound_event: soundEvent,
    use_duration: data.useDuration,
    range: data.range,
    description: data.description
  }
}

function convertInstrument (value, helpers) {
  if (!value || typeof value !== 'object' || typeof value.hasHolder !== 'boolean') return undefined
  if (!value.hasHolder) return resourceKey(value.data, helpers)
  return helpers.holder(value.data, 'minecraft:instrument', 'instrumentId', 'data', data => convertInstrumentData(data, helpers))
}

function convertJukeboxSongData (data, helpers) {
  if (!data || typeof data !== 'object' || typeof data.lengthInSeconds !== 'number' || !Number.isFinite(data.lengthInSeconds) ||
    !Number.isInteger(data.comparatorOutput) || data.comparatorOutput < 0 || !isNbtTag(data.description)) return undefined
  const soundEvent = helpers.soundEvent(data.soundEvent)
  if (soundEvent === undefined) return undefined
  return {
    sound_event: soundEvent,
    description: data.description,
    length_in_seconds: data.lengthInSeconds,
    comparator_output: data.comparatorOutput
  }
}

function convertJukeboxPlayable (value, helpers) {
  if (!value || typeof value !== 'object' || typeof value.hasHolder !== 'boolean') return undefined
  if (!value.hasHolder) return resourceKey(value.song, helpers)
  return helpers.holder(value.song, 'minecraft:jukebox_song', 'songId', 'data', data => convertJukeboxSongData(data, helpers))
}

function convertProvidesBannerPatterns (value, helpers) {
  return helpers.holderSet(value, 'minecraft:banner_pattern')
}

function convertBannerPatternData (data, helpers) {
  if (!data || typeof data !== 'object' || typeof data.assetId !== 'string' || typeof data.translationKey !== 'string') return undefined
  const assetId = resourceKey(data.assetId, helpers)
  if (!assetId) return undefined
  return { asset_id: assetId, translation_key: data.translationKey }
}

function convertBannerPatternLayer (layer, helpers) {
  if (!layer || typeof layer !== 'object') return undefined
  const pattern = helpers.holder(layer.pattern, 'minecraft:banner_pattern', 'patternId', 'data', data => convertBannerPatternData(data, helpers))
  const color = helpers.enumValue(layer.colorId, dyeColors)
  if (pattern === undefined || color === undefined) return undefined
  return { pattern, color }
}

function convertBannerPatterns (value, helpers) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.layers)) return undefined
  return helpers.all(value.layers.map(layer => convertBannerPatternLayer(layer, helpers)))
}

module.exports = {
  ids,
  types,
  components: {
    trim: 'registries_trim',
    instrument: 'instrument_holder',
    provides_trim_material: 'trim_material_holder',
    jukebox_playable: 'jukebox_song_holder',
    provides_banner_patterns: 'banner_pattern_holder_set',
    banner_patterns: 'banner_pattern_layers'
  },
  converters: {
    trim: convertTrim,
    instrument: convertInstrument,
    provides_trim_material: convertProvidesTrimMaterial,
    jukebox_playable: convertJukeboxPlayable,
    provides_banner_patterns: convertProvidesBannerPatterns,
    banner_patterns: convertBannerPatterns
  }
}
