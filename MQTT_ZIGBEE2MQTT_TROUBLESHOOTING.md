# Home Assistant MQTT and Zigbee2MQTT Recovery Guide

## Purpose

This guide documents how to restore control of the bathroom dimmer in the Home Assistant installation running on the Raspberry Pi. It is intended for an agent or administrator working on the Raspberry Pi over SSH.

The bathroom device is a Moes ZM-105-M dimmer using a Tuya TS0601 device definition. The important distinction is:

- Mosquitto is the MQTT broker.
- Zigbee2MQTT translates MQTT commands into Zigbee commands.
- Home Assistant is the user interface and MQTT Discovery client.
- A Home Assistant entity can exist even when Zigbee2MQTT cannot control the physical device.

Always test the Zigbee2MQTT command path before changing the Home Assistant dashboard.

## Installation layout

The Docker project is located at:

```text
/srv/homeassistant
```

Important paths:

```text
/srv/homeassistant/docker-compose.yml
/srv/homeassistant/config
/srv/homeassistant/config/configuration.yaml
/srv/homeassistant/config/automations.yaml
/srv/homeassistant/zigbee2mqtt
/srv/homeassistant/zigbee2mqtt/configuration.yaml
/srv/homeassistant/zigbee2mqtt/database.db
/srv/homeassistant/zigbee2mqtt/database.db.bak-before-remove
/srv/homeassistant/zigbee2mqtt/external_converters/moes_zm105m_dimmer.js
```

Expected containers:

```text
homeassistant
zigbee2mqtt
mosquitto
```

## Device identification

Bathroom dimmer:

```text
Friendly name: Łazienka
IEEE address: 0x4c5bb3fffe2f0f7e
Manufacturer: _TZE200_dcnsggvz
Model ID: TS0601
Converter model: ZM-105-M
```

Coordinator:

```text
0xbc8d7efffefd2d7f
```

Do not re-pair the device or change the Zigbee channel unless the device is genuinely missing from the network. The problem documented here was a converter and entity configuration problem, not a coordinator problem.

## Step 1: Check container status

Run:

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'homeassistant|zigbee2mqtt|mosquitto'
```

All three containers should be running.

Check Mosquitto:

```bash
docker logs --tail 100 mosquitto
```

Mosquitto normally listens on port `1883` and is available to Zigbee2MQTT at:

```text
mqtt://172.18.0.2:1883
```

Mosquitto is not the likely root cause when Zigbee2MQTT receives the MQTT command but rejects the device property.

## Step 2: Validate Zigbee2MQTT configuration

The relevant part of `/srv/homeassistant/zigbee2mqtt/configuration.yaml` should be:

```yaml
homeassistant:
  enabled: true
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://172.18.0.2:1883
serial:
  port: /dev/ttyUSB0
  adapter: ezsp
external_converters:
  - moes_zm105m_dimmer.js
```

The bathroom device key must be quoted because it starts with `0x`:

```yaml
devices:
  "0x4c5bb3fffe2f0f7e":
    friendly_name: Łazienka
```

Unquoted hexadecimal-looking YAML keys can be interpreted as numbers and cause Zigbee2MQTT configuration validation errors.

## Step 3: Verify the external converter location

For Zigbee2MQTT 2.7.x, the converter must be inside the external converter directory:

```text
/srv/homeassistant/zigbee2mqtt/external_converters/moes_zm105m_dimmer.js
```

The file should export one definition or an array of definitions. The current working definition exports one definition and uses an exact fingerprint:

```javascript
const definition = {
    fingerprint: [{modelID: 'TS0601', manufacturerName: '_TZE200_dcnsggvz'}],
    model: 'ZM-105-M',
    vendor: 'Moes',
    description: 'Smart dimmer module',
    // extend, exposes and tuyaDatapoints follow here
};

module.exports = definition;
```

Do not place the only copy in the root data directory. The loader scans the `external_converters` subdirectory.

Restart Zigbee2MQTT:

```bash
docker restart zigbee2mqtt
```

Confirm that the converter is loaded:

```bash
docker logs --since 2m zigbee2mqtt 2>&1 | grep -a -E "Loaded external converter|ZM-105-M|Not supported|No converter"
```

Expected message:

```text
Loaded external converter 'moes_zm105m_dimmer.js'.
```

The candidate list for the bathroom device should contain:

```text
ZM-105-M/Moes
```

If the device is reported as only `Not supported`, the external converter was not loaded or the fingerprint does not match.

## Step 4: Test Zigbee2MQTT directly

Always test the physical command path directly through MQTT before troubleshooting Home Assistant.

Turn on:

```bash
docker exec mosquitto mosquitto_pub \
  -h 127.0.0.1 \
  -t 'zigbee2mqtt/Łazienka/set' \
  -m '{"state":"ON"}'
```

Turn off:

```bash
docker exec mosquitto mosquitto_pub \
  -h 127.0.0.1 \
  -t 'zigbee2mqtt/Łazienka/set' \
  -m '{"state":"OFF"}'
```

Set brightness. The current converter uses a 0–1000 brightness scale:

```bash
docker exec mosquitto mosquitto_pub \
  -h 127.0.0.1 \
  -t 'zigbee2mqtt/Łazienka/set' \
  -m '{"brightness":500}'
```

Monitor the device state:

```bash
docker exec mosquitto mosquitto_sub \
  -h 127.0.0.1 \
  -t 'zigbee2mqtt/Łazienka' \
  -v
```

This error means the converter is not active:

```text
No converter available for 'state' on 'Łazienka'
```

Do not attempt to fix this by creating more Home Assistant entities. Fix the Zigbee2MQTT converter first.

A successful command should produce a log similar to:

```text
Publishing 'set' 'state' to 'Łazienka'
```

## Step 5: MQTT Discovery cleanup

Zigbee2MQTT publishes the correct light discovery topic here:

```text
homeassistant/light/0x4c5bb3fffe2f0f7e/light/config
```

A manually created duplicate discovery topic caused conflicts in the past:

```text
homeassistant/light/0x4c5bb3fffe2f0f7e/config
```

If that duplicate exists, delete only the duplicate retained message:

```bash
docker exec mosquitto mosquitto_pub \
  -h 127.0.0.1 \
  -t 'homeassistant/light/0x4c5bb3fffe2f0f7e/config' \
  -r -n
```

Do not delete the Zigbee2MQTT topic ending in `/light/config`.

Inspect all bathroom discovery topics:

```bash
docker exec mosquitto mosquitto_sub \
  -h 127.0.0.1 \
  -t 'homeassistant/#' \
  -C 1000 -W 5 -v | grep -a -i 'Łazienka\|lazienka\|4c5bb3fffe2f0f7e'
```

## Step 6: Preserve the old Home Assistant entity name

The old dashboard and automations use:

```text
light.lazienka
```

The MQTT Discovery entity may internally be registered as:

```text
light.lazienka_2
```

This happens because the old template entity already owns the original object ID. Do not break existing automations by blindly renaming every reference.

The compatibility template in `/srv/homeassistant/config/configuration.yaml` should use the MQTT entity as its backend:

```yaml
      - name: Łazienka
        unique_id: template_light_lazienka
        optimistic: true
        state: "{{ is_state('light.lazienka_2', 'on') }}"
        turn_on:
          - action: light.turn_on
            target:
              entity_id: light.lazienka_2
        turn_off:
          - action: light.turn_off
            target:
              entity_id: light.lazienka_2
```

This keeps the old public entity name while using the working Zigbee2MQTT entity underneath.

If entity names are changed in the future, update the dashboard and all automations together. Do not leave a stale `switch.lazienka` template pointing to the old Supla device.

## Step 7: Check automations

### Ignore very short ON pulses

If a bathroom ON event may be caused by contact bounce or a transient message, require the state to remain ON before an automation reacts:

```yaml
triggers:
  - trigger: state
    entity_id: light.lazienka
    to: 'on'
    for:
      milliseconds: 200
```

The `for` condition filters the automation trigger; impulses shorter than 200 milliseconds do not trigger the automation. It does not prevent a physical relay or a direct integration command from changing state. Use the integration or device firmware settings when the relay itself must ignore electrical contact bounce. The corridor currently has no Home Assistant automation trigger in this installation, so its source event must be identified before adding an equivalent filter.

Find stale device references:

```bash
grep -n -i -E 'lazienka|Łazienka|6ca1819b|9bda0358' \
  /srv/homeassistant/config/automations.yaml
```

Validate Home Assistant configuration:

```bash
docker exec homeassistant python -m homeassistant --script check_config -c /config
```

Errors such as this indicate an obsolete device trigger:

```text
Unknown device '6ca1819b...'
```

Remove the obsolete automation or replace the trigger with a stable entity/state trigger. For example:

```yaml
triggers:
  - trigger: state
    entity_id: light.lazienka
    to: 'on'
```

Do not use a deleted device ID merely because it appears in an old backup.

## Step 8: Restart and verify

After configuration changes:

```bash
docker exec homeassistant python -m homeassistant --script check_config -c /config
docker restart homeassistant
```

Then inspect logs:

```bash
docker logs --since 2m homeassistant 2>&1 | grep -a -E 'ERROR|Invalid config|Unknown device|lazienka|Łazienka'
```

Finally test:

1. `light.lazienka` from the Home Assistant dashboard.
2. `light.lazienka_2` if the compatibility alias is unavailable.
3. Direct MQTT `ON`, `OFF`, and brightness commands.
4. The physical wall control, if paired and supported by the device.

## File permissions

The Home Assistant files are owned by `root` on the Raspberry Pi. A normal VS Code Remote SSH user may be able to read but not save them. Check ownership:

```bash
ls -l /srv/homeassistant/config/configuration.yaml
ls -l /srv/homeassistant/config/automations.yaml
```

If saving fails with `Permission denied`, edit through an administrative shell or change ownership deliberately. Before changing ownership, make a backup:

```bash
sudo cp /srv/homeassistant/config/configuration.yaml \
  /srv/homeassistant/config/configuration.yaml.backup.$(date +%Y%m%d-%H%M%S)

sudo cp /srv/homeassistant/config/automations.yaml \
  /srv/homeassistant/config/automations.yaml.backup.$(date +%Y%m%d-%H%M%S)
```

Do not use a text editor on the host while Home Assistant is simultaneously rewriting the same file. Make one change, validate it, and restart only after validation succeeds.

## Recovery checklist

- [ ] Mosquitto container is running.
- [ ] Zigbee2MQTT container is running.
- [ ] Home Assistant container is running.
- [ ] Bathroom device key is quoted in Zigbee2MQTT YAML.
- [ ] Converter is in `external_converters/`.
- [ ] Converter uses fingerprint `TS0601` + `_TZE200_dcnsggvz`.
- [ ] Logs show `Loaded external converter`.
- [ ] Candidate list contains `ZM-105-M/Moes`.
- [ ] Direct MQTT `state` command does not report `No converter available`.
- [ ] Duplicate manual Discovery topic is removed.
- [ ] Old `light.lazienka` compatibility alias points to `light.lazienka_2`.
- [ ] Home Assistant `check_config` completes without unknown-device errors.
- [ ] Dashboard control and physical control have both been tested.
