export function writeOutput(...msg) {
  const box = document.getElementById('outputBox');
  if (box) {
    box.value += msg.join(' ') + '\n';
    box.scrollTop = box.scrollHeight;
  }
}

export function setActiveHeadsetName(name) {
  const el = document.getElementById('activeHeadsetName');
  if (el) { el.textContent = name; }
}

export function setAmbientNoise(value) {
  const el = document.getElementById('ambientNoiseValue');
  el.value = value;
  el.style.color = 'green';
  if (value > 65) { el.style.color = 'orange'; };
  if (value > 80) { el.style.color = 'red'; };
}

export function setAudioExposure(value) {
  const el = document.getElementById('audioExposureValue');
  el.value = value;
  el.style.color = 'green';
  if (value > 65) { el.style.color = 'orange'; };
  if (value > 80) { el.style.color = 'red'; };
}

export function setSpeechAnalytics(text, color) {
  const el = document.getElementById('speechAnalyticsValue');
  el.value = (text);
  el.style.color = color;

}

export function setMuteState(text, color) {
  const el = document.getElementById('muteStateValue');
  el.value = (text);
  el.style.color = color;
}