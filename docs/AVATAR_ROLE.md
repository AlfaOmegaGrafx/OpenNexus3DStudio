# Avatar Role (portable AI personality on VRM)

**Product term:** Role (user-facing). Never “Persona” in UI.

OpenNexus embeds an AI personality into exported VRMs so avatars can ship with a ready-made Companion / Live Speech Role — including marketplace listings and third-party apps that read the same extras key.

## Schema

```json
{
  "spec": "opennexus.avatar_role",
  "spec_version": "1.0",
  "name": "Aria",
  "description": "Full Role / system prompt text…",
  "personality": "optional short traits",
  "creator": "",
  "character_version": "1",
  "extensions": {}
}
```

## Where it lives in the file

glTF root extras:

```json
{
  "extras": {
    "opennexus.avatar_role": { "...": "Avatar Role object above" }
  }
}
```

Key constant: `opennexus.avatar_role`  
Code: `src/library/avatarRole.js` (Studio), `chat/packages/ccc` (Companion).

## Flows

1. **Create Role** in Companion Settings → Role (JSON / PNG chara / VRM with extras).  
2. **Export VRM** from OpenNexus — current Role from `localStorage` (`opennexus3d.avatarRole`) is written into extras.  
3. **Import VRM** — Role is read back into storage for Companion.  
4. **Marketplace** — buyers get mesh + Role in one file; any app that parses glTF extras can apply the personality.

## License

Schema + parsers are MIT (OpenNexus / chat packages). No AGPL character-card dependency.
