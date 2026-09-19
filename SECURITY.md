# Security policy

## Scope

prismarine-item parses and serializes item NBT, component containers, stack IDs, hashed slots, and anvil inputs. Malformed NBT or component data can cause excessive allocation, parser errors, denial of service, or unsafe logging. HashedSlot CRC32C values provide protocol integrity hints and are not authentication.

## Supported versions

There is no formal long-term security-support matrix for this fork. Triage starts with current master and the latest published package. The version behavior selected by prismarine-registry, including Java 26.2 and 26.3 component paths and supported Bedrock representations, is the compatibility target. Older versions are not promised separate security maintenance.

## Reporting a vulnerability

As verified on 2026-09-19, this fork has no enabled GitHub private vulnerability-reporting endpoint. Do not put malicious NBT, exploit payloads, account data, or private packet captures in a public issue, pull request, discussion, or chat message.

1. Check the repository GitHub **Security** tab for **Report a vulnerability** and use the private form if available.
2. Otherwise use a private contact method listed on the [Misty4119 GitHub profile](https://github.com/Misty4119). If none is shown, request a private route without publishing the details, then send the report privately.
3. Redact session tokens, account identifiers, private server addresses, and full world data unless required for reproduction.

Include the affected commit/version, edition and Minecraft version, item/network form, minimal input, expected and observed behavior, impact, and environment. No response or remediation time is promised.

For ordinary conversion or API bugs, use the [public issue tracker](https://github.com/Misty4119/prismarine-item/issues) after removing confidential data.
