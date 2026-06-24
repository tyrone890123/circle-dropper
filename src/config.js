// config.js — single source of truth for tunable parameters.
//
// The CONFIG_SCHEMA drives three things at once: the default config, the slider
// panel (see panel.js), and JSON import/export. Add a control here and it shows
// up everywhere automatically — no HTML or parsing changes needed.

export const CONFIG_SCHEMA = [
  {
    group: 'Arena',
    controls: [
      {
        key: 'shape', label: 'Shape', type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' },
        ],
        default: 'circle',
      },
      {
        key: 'viewMode', label: 'View', type: 'select',
        options: [
          { value: 'fit',  label: 'Fit (one screen)' },
          { value: 'zoom', label: 'Zoom out on break' },
        ],
        default: 'fit',
      },
      { key: 'ringCount',   label: 'Wall count',   type: 'range', min: 1,  max: 60,  step: 1,   default: 5 },
      { key: 'ringSpacing', label: 'Wall spacing', type: 'range', min: 12, max: 90,  step: 1,   default: 46 },
      { key: 'innerRadius', label: 'Inner size',   type: 'range', min: 30, max: 160, step: 1,   default: 70 },
      { key: 'thickness',   label: 'Wall width',   type: 'range', min: 2,  max: 22,  step: 1,   default: 8 },
      { key: 'gapWidth',    label: 'Gap size (°)', type: 'range', min: 10, max: 150, step: 1,   default: 60 },
    ],
  },
  {
    group: 'Motion',
    controls: [
      { key: 'rotationSpeed', label: 'Spin speed',  type: 'range', min: 0,   max: 3,   step: 0.01, default: 0.7 },
      { key: 'alternateSpin', label: 'Alt. spin direction', type: 'checkbox', default: true },
      { key: 'gravity',       label: 'Gravity',     type: 'range', min: 0,   max: 2200, step: 10,  default: 900 },
      { key: 'bounciness',    label: 'Bounciness',  type: 'range', min: 0.5, max: 1.3, step: 0.01, default: 1.0 },
    ],
  },
  {
    group: 'Balls',
    controls: [
      { key: 'ballCount',     label: 'Ball count',  type: 'range', min: 1,   max: 30,  step: 1,   default: 1 },
      { key: 'ballSpeed',     label: 'Launch speed',type: 'range', min: 0,   max: 900, step: 10,  default: 320 },
      { key: 'ballRadius',    label: 'Ball size',   type: 'range', min: 4,   max: 30,  step: 1,   default: 10 },
      { key: 'growOnBounce',  label: 'Grow on bounce', type: 'checkbox', default: false },
      { key: 'growAmount',    label: 'Grow amount', type: 'range', min: 0.05, max: 2, step: 0.05, default: 0.4 },
    ],
  },
  {
    group: 'Neon / FX',
    controls: [
      { key: 'hue',          label: 'Base hue',     type: 'range', min: 0,   max: 360, step: 1,   default: 285 },
      { key: 'hueCycle',     label: 'Hue drift',    type: 'range', min: 0,   max: 60,  step: 1,   default: 12 },
      { key: 'glow',         label: 'Glow',         type: 'range', min: 0,   max: 40,  step: 1,   default: 22 },
      { key: 'trail',        label: 'Trail',        type: 'range', min: 0,   max: 0.4, step: 0.01, default: 0.16 },
      { key: 'shake',        label: 'Screen shake', type: 'range', min: 0,   max: 30,  step: 1,   default: 12 },
      { key: 'particles',    label: 'Particle burst', type: 'checkbox', default: true },
    ],
  },
  {
    group: 'Sound',
    controls: [
      { key: 'sound',    label: 'Sound on',  type: 'checkbox', default: true },
      { key: 'volume',   label: 'Volume',    type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      {
        key: 'waveform', label: 'Tone', type: 'select',
        options: [
          { value: 'sine',     label: 'Sine' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'square',   label: 'Square' },
          { value: 'sawtooth', label: 'Saw' },
        ],
        default: 'triangle',
      },
      {
        key: 'scale', label: 'Built-in scale', type: 'select',
        options: [
          { value: 'pentatonic', label: 'Pentatonic' },
          { value: 'major',      label: 'Major' },
          { value: 'minor',      label: 'Minor' },
          { value: 'chromatic',  label: 'Chromatic' },
        ],
        default: 'pentatonic',
      },
    ],
  },
];

// Flatten the schema into a plain { key: defaultValue } object.
export function defaultConfig() {
  const cfg = {};
  for (const section of CONFIG_SCHEMA) {
    for (const control of section.controls) {
      cfg[control.key] = control.default;
    }
  }
  return cfg;
}

// Coerce a possibly-dirty value (from JSON import) into the right type and
// clamp ranges so a bad import can never crash the sim.
export function coerceConfig(raw) {
  const cfg = defaultConfig();
  if (!raw || typeof raw !== 'object') return cfg;
  for (const section of CONFIG_SCHEMA) {
    for (const c of section.controls) {
      if (!(c.key in raw)) continue;
      let v = raw[c.key];
      if (c.type === 'range') {
        v = Number(v);
        if (Number.isNaN(v)) continue;
        v = Math.min(c.max, Math.max(c.min, v));
      } else if (c.type === 'checkbox') {
        v = Boolean(v);
      } else if (c.type === 'select') {
        if (!c.options.some((o) => o.value === v)) continue;
      }
      cfg[c.key] = v;
    }
  }
  return cfg;
}
