/* eslint-env mocha */

const assert = require('assert')
const registries = require('../lib/hashedSlot/families/registries')
const createHelpers = require('../lib/hashedSlot/families/helpers')
const { createProtoDef } = require('../lib/hashOps')

describe('protocol 777 hashed component registry family', () => {
  const registry = require('prismarine-registry')('26.3')
  const helpers = createHelpers(registry)

  it('declares each assigned component ID, codec shape, and converter exactly once', () => {
    const expected = [
      'trim',
      'instrument',
      'provides_trim_material',
      'jukebox_playable',
      'provides_banner_patterns',
      'banner_patterns'
    ]

    assert.deepStrictEqual(registries.ids.slice().sort(), expected.slice().sort())
    assert.strictEqual(new Set(registries.ids).size, expected.length)
    assert.deepStrictEqual(Object.keys(registries.components).sort(), expected.slice().sort())
    assert.deepStrictEqual(Object.keys(registries.converters).sort(), expected.slice().sort())
    for (const id of expected) {
      assert.ok(registries.components[id])
      assert.strictEqual(typeof registries.converters[id], 'function')
    }
  })

  it('converts trim registry holders and direct material or pattern data', () => {
    const materials = registry.loginPacket.dimensionCodec['minecraft:trim_material'].entries
    const patterns = registry.loginPacket.dimensionCodec['minecraft:trim_pattern'].entries
    const materialId = materials.findIndex(entry => entry.key === 'minecraft:amethyst')
    const patternId = patterns.findIndex(entry => entry.key === 'minecraft:bolt')
    const description = { type: 'string', value: 'Trim description' }

    assert.ok(registries.types.registries_trim)
    assert.strictEqual(registries.components.trim, 'registries_trim')
    assert.deepStrictEqual(registries.converters.trim({ material: { materialId }, pattern: { patternId } }, helpers), {
      material: 'minecraft:amethyst',
      pattern: 'minecraft:bolt'
    })
    assert.deepStrictEqual(registries.converters.trim({
      material: { data: { assetBase: 'trims/material/test', overrideArmorAssets: [], description } },
      pattern: { data: { assetId: 'trims/pattern/test', description, decal: true } }
    }, helpers), {
      material: { palette_id: 'minecraft:trims/material/test', description },
      pattern: { asset_id: 'minecraft:trims/pattern/test', description, decal: true }
    })
    assert.deepStrictEqual(registries.converters.trim({
      material: { materialId },
      pattern: { data: { assetId: 'trims/pattern/test', description, decal: false } }
    }, helpers), {
      material: 'minecraft:amethyst',
      pattern: { asset_id: 'minecraft:trims/pattern/test', description, decal: false }
    })
    assert.strictEqual(registries.converters.trim({ material: { materialId: 999999 }, pattern: { patternId } }, helpers), undefined)
    assert.strictEqual(registries.converters.trim({ material: { materialId }, pattern: { patternId: 999999 } }, helpers), undefined)
    assert.strictEqual(registries.converters.trim({ material: { data: { assetBase: 'trim', description } }, pattern: { patternId } }, helpers), undefined)
    assert.strictEqual(registries.converters.trim({ material: { materialId }, pattern: { data: { assetId: 'bolt', decal: false } } }, helpers), undefined)
  })

  it('resolves an instrument holder ID to its registry key', () => {
    const instruments = registry.loginPacket.dimensionCodec['minecraft:instrument'].entries
    const instrumentId = instruments.findIndex(entry => entry.key === 'minecraft:admire_goat_horn')

    assert.strictEqual(registries.components.instrument, 'instrument_holder')
    assert.strictEqual(registries.converters.instrument({ hasHolder: true, data: { instrumentId } }, helpers), 'minecraft:admire_goat_horn')
  })

  it('converts inline instrument and sound data and rejects unresolved holders', () => {
    const soundId = registry.soundsArray.findIndex(entry => entry.name === 'item.goat_horn.sound.4')
    const description = { type: 'compound', value: { translate: { type: 'string', value: 'instrument.example' } } }
    const instrument = {
      soundEvent: { data: { soundName: 'item.example.horn', fixedRange: 32 } },
      useDuration: 7,
      range: 256,
      description
    }

    assert.deepStrictEqual(registries.converters.instrument({ hasHolder: true, data: { data: instrument } }, helpers), {
      sound_event: { sound_id: 'minecraft:item.example.horn', range: 32 },
      use_duration: 7,
      range: 256,
      description
    })
    const noFixedRange = registries.converters.instrument({
      hasHolder: true,
      data: { data: { ...instrument, soundEvent: { data: { soundName: 'item.example.horn' } } } }
    }, helpers)
    assert.deepStrictEqual(noFixedRange.sound_event, { sound_id: 'minecraft:item.example.horn' })
    assert.deepStrictEqual(registries.converters.instrument({ hasHolder: true, data: { data: { ...instrument, soundEvent: { soundId } } } }, helpers), {
      sound_event: 'minecraft:item.goat_horn.sound.4',
      use_duration: 7,
      range: 256,
      description
    })
    assert.strictEqual(registries.converters.instrument({ hasHolder: true, data: { instrumentId: 999999 } }, helpers), undefined)
    assert.strictEqual(registries.converters.instrument({ hasHolder: true, data: { data: { ...instrument, soundEvent: { soundId: 999999 } } } }, helpers), undefined)
    assert.strictEqual(registries.converters.instrument({ hasHolder: true, data: { data: { ...instrument, useDuration: '7' } } }, helpers), undefined)
    assert.strictEqual(registries.converters.instrument({ hasHolder: false, data: 'admire_goat_horn' }, helpers), 'minecraft:admire_goat_horn')
    assert.strictEqual(registries.converters.instrument({ hasHolder: false, data: '' }, helpers), undefined)
  })

  it('resolves a provided trim material holder and converts direct material data', () => {
    const materials = registry.loginPacket.dimensionCodec['minecraft:trim_material'].entries
    const materialId = materials.findIndex(entry => entry.key === 'minecraft:amethyst')
    const description = { type: 'string', value: 'trim material' }

    assert.strictEqual(registries.components.provides_trim_material, 'trim_material_holder')
    assert.strictEqual(registries.converters.provides_trim_material({ hasHolder: true, material: { materialId } }, helpers), 'minecraft:amethyst')
    assert.strictEqual(registries.converters.provides_trim_material({ hasHolder: false, material: 'amethyst' }, helpers), 'minecraft:amethyst')
    assert.strictEqual(registries.converters.provides_trim_material({ hasHolder: false, material: 'not a key' }, helpers), undefined)
    assert.deepStrictEqual(registries.converters.provides_trim_material({
      hasHolder: true,
      material: { data: { assetBase: 'trims/material/test', overrideArmorAssets: [], description } }
    }, helpers), { palette_id: 'minecraft:trims/material/test', description })
    assert.strictEqual(registries.converters.provides_trim_material({ hasHolder: true, material: { materialId: 999999 } }, helpers), undefined)
    assert.strictEqual(registries.converters.provides_trim_material({ hasHolder: true, material: { data: { assetBase: '', description } } }, helpers), undefined)
    assert.strictEqual(registries.converters.provides_trim_material({ hasHolder: true, material: { data: { assetBase: 'test', overrideArmorAssets: [{ key: 1, value: 'armor' }], description } } }, helpers), undefined)
  })

  it('resolves a jukebox song holder and converts direct song data', () => {
    const songs = registry.loginPacket.dimensionCodec['minecraft:jukebox_song'].entries
    const songId = songs.findIndex(entry => entry.key === 'minecraft:11')
    const soundId = registry.soundsArray.findIndex(entry => entry.name === 'music_disc.11')
    const description = { type: 'string', value: 'Eleven' }
    const song = {
      soundEvent: { soundId },
      description,
      lengthInSeconds: 71,
      comparatorOutput: 11
    }

    assert.strictEqual(registries.components.jukebox_playable, 'jukebox_song_holder')
    assert.strictEqual(registries.converters.jukebox_playable({ hasHolder: true, song: { songId } }, helpers), 'minecraft:11')
    assert.strictEqual(registries.converters.jukebox_playable({ hasHolder: false, song: 'minecraft:11' }, helpers), 'minecraft:11')
    assert.deepStrictEqual(registries.converters.jukebox_playable({ hasHolder: true, song: { data: song } }, helpers), {
      sound_event: 'minecraft:music_disc.11',
      description,
      length_in_seconds: 71,
      comparator_output: 11
    })
    assert.strictEqual(registries.converters.jukebox_playable({ hasHolder: true, song: { songId: 999999 } }, helpers), undefined)
    assert.strictEqual(registries.converters.jukebox_playable({ hasHolder: true, song: { data: { ...song, soundEvent: { soundId: 999999 } } } }, helpers), undefined)
    assert.strictEqual(registries.converters.jukebox_playable({ hasHolder: true, song: { data: { ...song, comparatorOutput: '11' } } }, helpers), undefined)
  })

  it('converts banner pattern holder sets, preserving IDs and tags', () => {
    const patterns = registry.loginPacket.dimensionCodec['minecraft:banner_pattern'].entries
    const baseId = patterns.findIndex(entry => entry.key === 'minecraft:base')
    const borderId = patterns.findIndex(entry => entry.key === 'minecraft:border')

    assert.strictEqual(registries.components.provides_banner_patterns, 'banner_pattern_holder_set')
    assert.strictEqual(registries.converters.provides_banner_patterns({ ids: [baseId] }, helpers), 'minecraft:base')
    assert.deepStrictEqual(registries.converters.provides_banner_patterns({ ids: [baseId, borderId] }, helpers), ['minecraft:base', 'minecraft:border'])
    assert.deepStrictEqual(registries.converters.provides_banner_patterns({ ids: [] }, helpers), [])
    assert.strictEqual(registries.converters.provides_banner_patterns({ name: 'minecraft:pattern_item/banner' }, helpers), '#minecraft:pattern_item/banner')
    assert.strictEqual(registries.converters.provides_banner_patterns({ name: '#pattern_item/banner' }, helpers), '#minecraft:pattern_item/banner')
    assert.strictEqual(registries.converters.provides_banner_patterns({ ids: [999999] }, helpers), undefined)
    assert.strictEqual(registries.converters.provides_banner_patterns({ ids: 'base' }, helpers), undefined)
  })

  it('converts ordered banner pattern layers and rejects invalid patterns or colors', () => {
    const patterns = registry.loginPacket.dimensionCodec['minecraft:banner_pattern'].entries
    const baseId = patterns.findIndex(entry => entry.key === 'minecraft:base')
    const borderId = patterns.findIndex(entry => entry.key === 'minecraft:border')
    const layers = [
      { pattern: { patternId: borderId }, colorId: 0 },
      { pattern: { patternId: baseId }, colorId: 1 }
    ]

    assert.strictEqual(registries.components.banner_patterns, 'banner_pattern_layers')
    assert.deepStrictEqual(registries.converters.banner_patterns({ layers }, helpers), [
      { pattern: 'minecraft:border', color: 'white' },
      { pattern: 'minecraft:base', color: 'orange' }
    ])
    assert.deepStrictEqual(registries.converters.banner_patterns({ layers: [] }, helpers), [])
    assert.deepStrictEqual(registries.converters.banner_patterns({
      layers: [{
        pattern: { data: { assetId: 'piglin', translationKey: 'block.minecraft.banner.piglin' } },
        colorId: 15
      }]
    }, helpers), [{
      pattern: { asset_id: 'minecraft:piglin', translation_key: 'block.minecraft.banner.piglin' },
      color: 'black'
    }])
    assert.strictEqual(registries.converters.banner_patterns({ layers: [{ pattern: { patternId: 999999 }, colorId: 0 }] }, helpers), undefined)
    assert.strictEqual(registries.converters.banner_patterns({ layers: [{ pattern: { patternId: baseId }, colorId: 16 }] }, helpers), undefined)
    assert.strictEqual(registries.converters.banner_patterns({ layers: [{ pattern: 'base', colorId: 0 }] }, helpers), undefined)
  })

  it('encodes all persistent codec shapes, including compact holder alternatives', () => {
    const proto = createProtoDef()
    proto.addTypes(registries.types)
    const description = { type: 'string', value: 'description' }
    const values = {
      trim: [{
        material: { palette_id: 'minecraft:trim/amethyst', description },
        pattern: { asset_id: 'minecraft:bolt', description, decal: true }
      }],
      instrument: [{
        sound_event: { sound_id: 'minecraft:item.example', range: 32 },
        use_duration: 7,
        range: 256,
        description
      }],
      provides_trim_material: [{ palette_id: 'minecraft:trim/amethyst', description }],
      jukebox_playable: [{
        sound_event: 'minecraft:music_disc.11',
        description,
        length_in_seconds: 71,
        comparator_output: 11
      }],
      provides_banner_patterns: ['minecraft:base', ['minecraft:base', 'minecraft:border'], []],
      banner_patterns: [[{ pattern: 'minecraft:base', color: 'white' }]]
    }

    for (const id of registries.ids) {
      for (const value of values[id]) {
        const type = registries.components[id]
        const size = proto.sizeOf(value, type, {})
        assert.ok(size > 0, `${id} should have a persistent codec shape`)
        proto.write(value, Buffer.alloc(size), 0, type, {})
      }
    }

    const withDefaultDecal = { asset_id: 'minecraft:bolt', description, decal: false }
    const withoutDecal = { asset_id: 'minecraft:bolt', description }
    assert.strictEqual(
      proto.sizeOf(withDefaultDecal, 'trim_pattern_holder', {}),
      proto.sizeOf(withoutDecal, 'trim_pattern_holder', {})
    )
  })
})
