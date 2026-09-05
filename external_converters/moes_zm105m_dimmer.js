const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const tuya = require('zigbee-herdsman-converters/lib/tuya');

const e = exposes.presets;
const ea = exposes.access;

const definition = {
    fingerprint: [{modelID: 'TS0601', manufacturerName: '_TZE200_dcnsggvz'}],
    model: 'ZM-105-M',
    vendor: 'Moes',
    description: 'Smart dimmer module',
    extend: [tuya.modernExtend.tuyaBase({dp: true})],
    exposes: [
        tuya.exposes.lightBrightnessWithMinMax(),
        tuya.exposes.countdown(),
        tuya.exposes.switchType(),
        e.power_on_behavior().withAccess(ea.STATE_SET),
    ],
    meta: {
        tuyaDatapoints: [
            [1, 'state', tuya.valueConverter.onOff, {skip: tuya.skip.stateOnAndBrightnessPresent}],
            [2, 'brightness', tuya.valueConverter.scale0_254to0_1000],
            [3, 'min_brightness', tuya.valueConverter.scale0_254to0_1000],
            [4, 'switch_type', tuya.valueConverter.switchType2],
            [5, 'max_brightness', tuya.valueConverter.scale0_254to0_1000],
            [6, 'countdown', tuya.valueConverter.countdown],
            [14, 'power_on_behavior', tuya.valueConverter.powerOnBehaviorEnum],
        ],
    },
};

module.exports = definition;
