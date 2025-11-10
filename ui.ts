/*********************************************************
 ** Logic for updating and managing the user interface. **
 ** NOT RELEVANT TO UNDERSTAND JABRA SDK USE.           **  
 ********************************************************/
import { Color, LedMode } from "@gnaudio/jabra-js-button-customization";

export function writeOutput(msg: any, meta: { level?: 'info' | 'warning' | 'error', deviceName?: string } = {}) {
  const { level = 'info', deviceName } = meta;
  const box = document.getElementById('outputBox') as HTMLDivElement;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + new Date().getMilliseconds().toString().padStart(3, '0');
  const timeText = deviceName ? `${timestamp} [${deviceName}]` : timestamp;

  const logElm = document.createElement('div');
  logElm.className = `log-item ${level}`;
  logElm.innerHTML = `<span class="timestamp">${timeText}</span><span class="log-item ${level}">${msg}</span>`;

  box.insertBefore(logElm, box.firstChild);
}

export function setActiveHeadsetName(name: string | undefined) {
  const el = document.getElementById('activeHeadsetName') as HTMLElement;
  el.textContent = (name) ? name : '(none)';
}

export function setAmbientNoise(value: number | undefined) {
  const el = document.getElementById('ambientNoiseValue') as HTMLInputElement;
  el.value = (value) ? value.toString() : 'n/a';
  let color = 'gray';
  if (value) {
    color = 'green'
    if (value > 65) { color = 'orange'; };
    if (value > 80) { color = 'red'; };
  }
  el.style.color = color;
}

export function setAudioExposure(value: number | undefined) {
  const el = document.getElementById('audioExposureValue') as HTMLInputElement;
  el.value = (value) ? value.toString() : 'n/a';
  let color = 'gray';
  if (value) {
    color = 'green'
    if (value > 65) { color = 'orange'; }
    if (value > 80) { color = 'red'; }
  }
  el.style.color = color;
}

export function setSpeechAnalytics(text?: string, color?: string) {
  const el = document.getElementById('speechAnalyticsValue') as HTMLInputElement;
  el.value = (text) ? text : 'n/a';
  el.style.color = (text && color) ? color : 'gray';

}

export function setMuteState(text?: string, color?: string) {
  const el = document.getElementById('muteStateValue') as HTMLInputElement;
  el.value = (text) ? text : 'n/a';
  el.style.color = (text && color) ? color : 'gray';
}

export function setSideTone(value?: string, handleChange?: (value: string) => void) {
  const el = document.getElementById('sideToneSelector') as HTMLSelectElement;
  if (value === undefined) {
    el.disabled = true;
    el.value = '';
  }
  else {
    el.disabled = false;
    el.value = value
  }

  if (handleChange) {
    el.addEventListener('change', (event) => handleChange((event.target as HTMLSelectElement).value));
  }
}

export function enableWebHidPermissionButton(handleDeviceAdded: () => void) {
  const webHidButton = document.getElementById('webHidButton') as HTMLButtonElement;

  webHidButton.disabled = false;
  webHidButton.addEventListener('click', handleDeviceAdded);
}

export function enableThreeDotButtonControls(handleChange: (color: Color, mode: LedMode) => void) {
  const elColor = document.getElementById('threeDotColorSelector') as HTMLSelectElement;
  const elMode = document.getElementById('threeDotModeSelector') as HTMLSelectElement;
  const elCustomColorInputs = document.getElementById('customColorInputs') as HTMLDivElement;
  const elCustomR = document.getElementById('customR') as HTMLInputElement;
  const elCustomG = document.getElementById('customG') as HTMLInputElement;
  const elCustomB = document.getElementById('customB') as HTMLInputElement;
  const elApplyCustomColorBtn = document.getElementById('applyCustomColorBtn') as HTMLButtonElement;

  elColor.disabled = false;
  elMode.disabled = false;

  elColor.addEventListener('change', notifyChange);
  elMode.addEventListener('change', notifyChange);
  elApplyCustomColorBtn.addEventListener('click', notifyChange);

  function notifyChange() {
    let mode = stringToLedMode(elMode.value);
    let color: Color;

    if (elColor.value == 'custom') {
      elCustomColorInputs.classList.remove('hidden');
      color = new Color(
        parseInt(elCustomR.value) || 0,
        parseInt(elCustomG.value) || 0,
        parseInt(elCustomB.value) || 0
      );
    }
    else {
      elCustomColorInputs.classList.add('hidden');
      color = stringToColor(elColor.value);
    }

    handleChange(color, mode)
  }
}

export function setThreeDotColorAndMode(color: Color, mode: LedMode) {
  const elColor = document.getElementById('threeDotColorSelector') as HTMLSelectElement;
  const elMode = document.getElementById('threeDotModeSelector') as HTMLSelectElement;

  if (color !== undefined && mode !== undefined) {
    elColor.disabled = false;
    elMode.disabled = false;
    elColor.value = colorToString(color);
    elMode.value = mode.name
  }
  else {
    elColor.disabled = true;
    elMode.disabled = true;
  }
}

export function updateSpeechAnalytics(speechAnalyticsState: { customerSpeaking?: boolean; agentSpeaking?: boolean; microphoneMuteState?: boolean; }) {
  if (speechAnalyticsState.customerSpeaking) {
    if (speechAnalyticsState.agentSpeaking) {
      setSpeechAnalytics("Crosstalk", "red");
    } else {
      setSpeechAnalytics("Customer speaking", "black");
    }
  } else if (speechAnalyticsState.agentSpeaking) {
    setSpeechAnalytics("Agent speaking", "black");
  } else {
    setSpeechAnalytics("Silence", "orange");
  }
  if (speechAnalyticsState.microphoneMuteState) {
    if (speechAnalyticsState.agentSpeaking) {
      setMuteState("Speaking while muted", "red");
    } else {
      setMuteState("Muted", "orange");
    }
  } else {
    setMuteState("Unmuted", "green");
  }
}

const colorMapping = {
  red: Color.red,
  green: Color.green,
  blue: Color.blue,
  yellow: Color.yellow,
  cyan: Color.cyan,
  magenta: Color.magenta,
  white: Color.white,
} as const;

const ledModeMapping = {
  SlowPulse: LedMode.slowPulse,
  FastPulse: LedMode.fastPulse,
  Off: LedMode.off,
  On: LedMode.on,
} as const;

function stringToColor(colorString: string): Color {
  return colorMapping[colorString as keyof typeof colorMapping] ?? new Color(0, 0, 0);
}

export function colorToString(color: Color): string {
  return Object.entries(colorMapping).find(([_, value]) => value === color)?.[0] ?? 'custom';
}

function stringToLedMode(modeString: string): LedMode {
  return ledModeMapping[modeString as keyof typeof ledModeMapping] ?? LedMode.on;
}

export function ledModeToString(mode: LedMode): string {
  return Object.entries(ledModeMapping).find(([_, value]) => value.name === mode.name)?.[0] ?? 'Unknown';
}

export function reset() {
  setActiveHeadsetName(undefined);
  setAmbientNoise(undefined);
  setAudioExposure(undefined);
  setSpeechAnalytics(undefined, undefined);
  setMuteState(undefined, undefined);
  setSideTone(undefined, undefined);
  updateSpeechAnalytics({ customerSpeaking: false, agentSpeaking: false, microphoneMuteState: false });
}