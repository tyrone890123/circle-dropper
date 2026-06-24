// panel.js — builds the control panel from CONFIG_SCHEMA and keeps a live
// config object in sync. Also wires JSON import/export. The schema is the only
// place controls are declared, so this file never needs editing to add a knob.

import { CONFIG_SCHEMA, defaultConfig, coerceConfig } from './config.js';

export class Panel {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;        // (config, key) => void
    this.config = defaultConfig();
    this.inputs = {};                // key -> element
    this.valueLabels = {};           // key -> span
    this._build();
  }

  _build() {
    for (const section of CONFIG_SCHEMA) {
      const group = document.createElement('div');
      group.className = 'group';
      const h = document.createElement('h3');
      h.textContent = section.group;
      group.appendChild(h);

      for (const c of section.controls) {
        group.appendChild(this._control(c));
      }
      this.root.appendChild(group);
    }
  }

  _control(c) {
    const row = document.createElement('label');
    row.className = 'ctl ctl-' + c.type;

    const name = document.createElement('span');
    name.className = 'ctl-label';
    name.textContent = c.label;

    let input;
    if (c.type === 'range') {
      input = document.createElement('input');
      input.type = 'range';
      input.min = c.min; input.max = c.max; input.step = c.step;
      input.value = c.default;
      const val = document.createElement('span');
      val.className = 'ctl-val';
      val.textContent = fmt(c.default);
      this.valueLabels[c.key] = val;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        this.config[c.key] = v;
        val.textContent = fmt(v);
        this.onChange(this.config, c.key);
      });
      name.appendChild(val);
      row.appendChild(name);
      row.appendChild(input);
    } else if (c.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = c.default;
      input.addEventListener('change', () => {
        this.config[c.key] = input.checked;
        this.onChange(this.config, c.key);
      });
      row.appendChild(input);
      row.appendChild(name);
    } else if (c.type === 'select') {
      input = document.createElement('select');
      for (const o of c.options) {
        const opt = document.createElement('option');
        opt.value = o.value; opt.textContent = o.label;
        input.appendChild(opt);
      }
      input.value = c.default;
      input.addEventListener('change', () => {
        this.config[c.key] = input.value;
        this.onChange(this.config, c.key);
      });
      row.appendChild(name);
      row.appendChild(input);
    }

    this.inputs[c.key] = input;
    return row;
  }

  // Push a full config object into both the live state and the controls.
  setConfig(raw) {
    this.config = coerceConfig(raw);
    for (const section of CONFIG_SCHEMA) {
      for (const c of section.controls) {
        const el = this.inputs[c.key];
        const v = this.config[c.key];
        if (c.type === 'checkbox') el.checked = v;
        else el.value = v;
        if (this.valueLabels[c.key]) this.valueLabels[c.key].textContent = fmt(v);
      }
    }
    this.onChange(this.config, null);
  }

  toJSON() {
    return JSON.stringify(this.config, null, 2);
  }

  fromJSON(text) {
    const obj = JSON.parse(text); // caller handles throw
    this.setConfig(obj);
  }
}

function fmt(v) {
  if (typeof v !== 'number') return String(v);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
