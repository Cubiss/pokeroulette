export function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h/30) % 12;
  const a = s * Math.min(l, 1-l);
  const f = n => l - a*Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)));
  return '#' + [f(0),f(8),f(4)].map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('');
}

export function openColorPicker(anchor, initialHex, onChange) {
  document.querySelector('.cp-popup')?.remove();

  let [h, s, l] = hexToHsl(initialHex);

  const popup = document.createElement('div');
  popup.className = 'cp-popup';

  const preview = document.createElement('div');
  preview.className = 'cp-preview';

  const makeSlider = (labelText, min, max, getValue, onInput, gradientFn) => {
    const wrap = document.createElement('div');
    wrap.className = 'cp-row';
    const lbl = document.createElement('label');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'cp-slider';
    slider.min = min; slider.max = max;
    slider.value = getValue();
    const updateTrack = () => { slider.style.background = gradientFn(); };
    slider.addEventListener('input', () => {
      onInput(parseInt(slider.value));
      updateTrack();
      syncAll();
    });
    lbl.append(document.createTextNode(labelText), document.createTextNode(''));
    wrap.append(lbl, slider);
    updateTrack();
    return { wrap, slider, updateTrack };
  };

  const hueSlider = makeSlider('Hue',        0, 360, () => h, v => { h = v; },
    () => `linear-gradient(to right,hsl(0,100%,50%),hsl(30,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))`);
  const satSlider = makeSlider('Saturation', 0, 100, () => s, v => { s = v; },
    () => `linear-gradient(to right,hsl(${h},0%,${l}%),hsl(${h},100%,${l}%))`);
  const litSlider = makeSlider('Lightness',  0, 100, () => l, v => { l = v; },
    () => `linear-gradient(to right,hsl(${h},${s}%,0%),hsl(${h},${s}%,50%),hsl(${h},${s}%,100%))`);

  const hexRow = document.createElement('div');
  hexRow.className = 'cp-hex-row';
  const hexInput = document.createElement('input');
  hexInput.className = 'online-input';
  hexInput.type = 'text';
  hexInput.maxLength = 7;
  hexInput.spellcheck = false;

  hexInput.addEventListener('input', () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      [h, s, l] = hexToHsl(v);
      hueSlider.slider.value = h;
      satSlider.slider.value = s;
      litSlider.slider.value = l;
      [hueSlider, satSlider, litSlider].forEach(x => x.updateTrack());
      syncAll(false);
    }
  });
  hexRow.appendChild(hexInput);

  function syncAll(updateHex = true) {
    const hex = hslToHex(h, s, l);
    preview.style.background = hex;
    if (updateHex) hexInput.value = hex;
    satSlider.updateTrack();
    litSlider.updateTrack();
    onChange(hex);
  }

  popup.append(preview, hueSlider.wrap, satSlider.wrap, litSlider.wrap, hexRow);
  document.body.appendChild(popup);
  syncAll();

  const rect = anchor.getBoundingClientRect();
  const pw = 218, ph = 210;
  let left = rect.left - pw - 8;
  if (left < 8) left = rect.right + 8;
  let top = rect.top;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  if (top < 8) top = 8;
  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';

  const close = (e) => {
    if (!popup.contains(e.target) && e.target !== anchor) {
      popup.remove();
      document.removeEventListener('pointerdown', close);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', close));
}
