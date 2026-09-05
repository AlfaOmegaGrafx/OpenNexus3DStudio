import { describe, expect, it } from 'vitest'
import {
  AVATAR_ROLE_EXTRAS_KEY,
  AVATAR_ROLE_SPEC,
  normalizeAvatarRole,
  readAvatarRoleFromGltfJson,
  avatarRoleToGltfExtras,
} from '../library/avatarRole.js'

describe('avatarRole', () => {
  it('normalizes OpenNexus Role JSON', () => {
    const role = normalizeAvatarRole({
      spec: AVATAR_ROLE_SPEC,
      name: 'Aria',
      description: 'A calm guide',
    })
    expect(role.name).toBe('Aria')
    expect(role.description).toBe('A calm guide')
    expect(role.spec).toBe(AVATAR_ROLE_SPEC)
  })

  it('maps SillyTavern-shaped V2 cards without AGPL lib', () => {
    const role = normalizeAvatarRole({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Bob',
        description: 'Friendly merchant',
        personality: 'warm',
      },
    })
    expect(role.name).toBe('Bob')
    expect(role.description).toBe('Friendly merchant')
    expect(role.personality).toBe('warm')
  })

  it('reads Role from glTF extras', () => {
    const json = {
      extras: {
        [AVATAR_ROLE_EXTRAS_KEY]: {
          name: 'Kai',
          description: 'Scout',
        },
      },
    }
    const role = readAvatarRoleFromGltfJson(json)
    expect(role?.name).toBe('Kai')
  })

  it('builds extras fragment for export', () => {
    const extras = avatarRoleToGltfExtras({ name: 'N', description: 'D' })
    expect(extras[AVATAR_ROLE_EXTRAS_KEY].description).toBe('D')
  })
})
