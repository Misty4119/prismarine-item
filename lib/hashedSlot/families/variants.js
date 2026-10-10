'use strict'

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

// VillagerType.bootstrap registers these keys in this exact order in the
// built-in minecraft:villager_type registry. Unlike the synchronized variant
// registries below, minecraft-data has no login codec or registry array for it.
const VILLAGER_TYPES = [
  'minecraft:desert',
  'minecraft:jungle',
  'minecraft:plains',
  'minecraft:savanna',
  'minecraft:snow',
  'minecraft:swamp',
  'minecraft:taiga'
]

const FOX_VARIANTS = ['red', 'snow']
const SALMON_SIZES = ['small', 'medium', 'large']
const PARROT_VARIANTS = ['red_blue', 'blue', 'green', 'yellow_blue', 'gray']

// Pattern.getPackedId() is base.id | index << 8. SMALL has id 0 and LARGE
// has id 1, so the complete sparse STREAM_CODEC table has IDs 0, 256..1280,
// 1, 257..1281 in declaration order.
const TROPICAL_FISH_PATTERNS = []
for (const [id, name] of [
  [0, 'kob'], [256, 'sunstreak'], [512, 'snooper'], [768, 'dasher'], [1024, 'brinely'], [1280, 'spotty'],
  [1, 'flopper'], [257, 'stripey'], [513, 'glitter'], [769, 'blockfish'], [1025, 'betty'], [1281, 'clayfish']
]) TROPICAL_FISH_PATTERNS[id] = name

const MOOSHROOM_VARIANTS = ['red', 'brown']
const RABBIT_VARIANTS = []
for (const [id, name] of [
  [0, 'brown'], [1, 'white'], [2, 'black'], [3, 'white_splotched'], [4, 'gold'], [5, 'salt'], [99, 'evil']
]) RABBIT_VARIANTS[id] = name
const HORSE_VARIANTS = ['white', 'creamy', 'chestnut', 'brown', 'black', 'gray', 'dark_brown']
const LLAMA_VARIANTS = ['creamy', 'white', 'brown', 'gray']
const AXOLOTL_VARIANTS = ['lucy', 'wild', 'gold', 'cyan', 'blue']

function nbtText (value) {
  if (!value || typeof value !== 'object') return false
  if (value.type === 'string') return typeof value.value === 'string'
  if (value.type === 'compound') return value.value !== null && typeof value.value === 'object' && !Array.isArray(value.value)
  if (value.type === 'list') {
    return value.value !== null && typeof value.value === 'object' &&
      typeof value.value.type === 'string' && Array.isArray(value.value.value)
  }
  return false
}

function resourceKey (value, helpers) {
  const key = helpers.key(value)
  return typeof key === 'string' && /^[a-z0-9_.-]+:[a-z0-9/._-]+$/.test(key) ? key : undefined
}

function paintingVariantData (data, helpers) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  const allowed = new Set(['width', 'height', 'assetId', 'title', 'author'])
  if (Object.keys(data).some(key => !allowed.has(key))) return undefined
  if (!Number.isInteger(data.width) || data.width < 1 || data.width > 16) return undefined
  if (!Number.isInteger(data.height) || data.height < 1 || data.height > 16) return undefined

  const assetId = resourceKey(data.assetId, helpers)
  if (!assetId) return undefined
  if (data.title != null && !nbtText(data.title)) return undefined
  if (data.author != null && !nbtText(data.author)) return undefined

  const result = { width: data.width, height: data.height, asset_id: assetId }
  if (data.title != null) result.title = data.title
  if (data.author != null) result.author = data.author
  return result
}

function paintingHolderType (value) {
  if (typeof value === 'string') return 'string'
  if (value && typeof value === 'object' && !Array.isArray(value)) return 'painting_variant_data'
  return undefined
}

const invalidHashRead = () => {
  throw new Error('HashOps values are hashed on write and cannot be read back')
}

const types = {
  painting_variant_data: ['map', {
    width: 'int',
    height: 'int',
    asset_id: 'string',
    title: { type: 'text', optional: true },
    author: { type: 'text', optional: true }
  }],
  // RegistryCodecs.holder hashes a named holder as its key and a direct holder
  // as the value encoded by PaintingVariant.DIRECT_CODEC.
  painting_variant_holder: [invalidHashRead, function (value, buffer, offset, args, context) {
    const type = paintingHolderType(value)
    if (!type) throw new Error('invalid value for painting variant holder codec')
    return this.write(value, buffer, offset, type, context)
  }, function (value, args, context) {
    const type = paintingHolderType(value)
    if (!type) throw new Error('invalid value for painting variant holder codec')
    return this.sizeOf(value, type, context)
  }]
}

const components = Object.fromEntries(ids.map(id => [id, id === 'painting/variant' ? 'painting_variant_holder' : 'string']))

function enumConverter (values) {
  return (value, helpers) => helpers.enumValue(value, values)
}

function registryConverter (registryName) {
  return (value, helpers) => helpers.registryEntry(registryName, value)
}

const converters = {
  'villager/variant': enumConverter(VILLAGER_TYPES),
  'wolf/variant': registryConverter('minecraft:wolf_variant'),
  'wolf/sound_variant': registryConverter('minecraft:wolf_sound_variant'),
  'fox/variant': enumConverter(FOX_VARIANTS),
  'salmon/size': enumConverter(SALMON_SIZES),
  'parrot/variant': enumConverter(PARROT_VARIANTS),
  'tropical_fish/pattern': enumConverter(TROPICAL_FISH_PATTERNS),
  'mooshroom/variant': enumConverter(MOOSHROOM_VARIANTS),
  'rabbit/variant': enumConverter(RABBIT_VARIANTS),
  'pig/variant': registryConverter('minecraft:pig_variant'),
  'pig/sound_variant': registryConverter('minecraft:pig_sound_variant'),
  'cow/variant': registryConverter('minecraft:cow_variant'),
  'cow/sound_variant': registryConverter('minecraft:cow_sound_variant'),
  'chicken/variant': (value, helpers) => helpers.holder(
    value,
    'minecraft:chicken_variant',
    'variantId',
    'variantData',
    data => resourceKey(data, helpers)
  ),
  'chicken/sound_variant': (value, helpers) => helpers.holder(
    value,
    'minecraft:chicken_sound_variant',
    'variantId',
    'variantData',
    data => resourceKey(data, helpers)
  ),
  'zombie_nautilus/variant': (value, helpers) => helpers.holder(
    value,
    'minecraft:zombie_nautilus_variant',
    'variantId',
    'variantData',
    data => resourceKey(data, helpers)
  ),
  'frog/variant': registryConverter('minecraft:frog_variant'),
  'horse/variant': enumConverter(HORSE_VARIANTS),
  'painting/variant': (value, helpers) => helpers.holder(
    value,
    'minecraft:painting_variant',
    'variantId',
    'data',
    data => paintingVariantData(data, helpers)
  ),
  'llama/variant': enumConverter(LLAMA_VARIANTS),
  'axolotl/variant': enumConverter(AXOLOTL_VARIANTS),
  'cat/variant': registryConverter('minecraft:cat_variant'),
  'cat/sound_variant': registryConverter('minecraft:cat_sound_variant')
}

module.exports = { ids, types, components, converters }
