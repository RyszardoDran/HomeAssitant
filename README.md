# Home Assistant MQTT and Zigbee2MQTT recovery

This repository stores the reproducible, sanitized parts of the Raspberry Pi repair for the Moes ZM-105-M bathroom dimmer.

## Contents

- [MQTT_ZIGBEE2MQTT_TROUBLESHOOTING.md](MQTT_ZIGBEE2MQTT_TROUBLESHOOTING.md) — complete recovery guide.
- `external_converters/moes_zm105m_dimmer.js` — working Zigbee2MQTT external converter.
- `examples/` — sanitized reference configurations; replace host-specific paths and never add secrets.

## Important paths on the Raspberry Pi

- Docker project: `/srv/homeassistant`
- Zigbee2MQTT data: `/srv/homeassistant/zigbee2mqtt`
- Home Assistant configuration: `/srv/homeassistant/config`
- Converter destination: `/srv/homeassistant/zigbee2mqtt/external_converters/`

Runtime databases, credentials, logs, backups, and Home Assistant storage are intentionally excluded. The guide should be read before applying any example configuration.
