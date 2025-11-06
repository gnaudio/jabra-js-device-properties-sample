import { init, webHidPairing, RequestedBrowserTransport, TransportContext, LogLevel } from '@gnaudio/jabra-js';
import { ButtonInteraction, createDeviceController, ButtonId, Color, LedMode } from '@gnaudio/jabra-js-button-customization';
import { PropertyModule } from '@gnaudio/jabra-js-properties';

// 3-dot button
/** @type {import('@gnaudio/jabra-js-button-customization').IButton} */
let threeDotButton;
/** @type {import('@gnaudio/jabra-js-properties').IPropertyModule} */
let propertyModule;
/** @type {import('@gnaudio/jabra-js-properties').IPropertyFactory} */
let propertyFactory;

let propertiesModuleReady = false;

// Global vars to hold speech analytics states
let customerSpeaking = false;
let agentSpeaking = false;
let microphoneMuteState = false;

// Output helper to write to the outputBox textarea
function writeOutput(...msg) {
  const box = document.getElementById('outputBox');
  if (box) {
    box.value += msg.join(' ') + '\n';
    box.scrollTop = box.scrollHeight;
  }
}

// For browser apps, you should always use CHROME_EXTENSION_WITH_WEB_HID_FALLBACK for transport. 
/** @type {import('@gnaudio/jabra-js').IConfig} */
const config = {
  partnerKey: 'your-partner-key', // We recommend initializing with a proper Partner Key.
  transport: RequestedBrowserTransport.CHROME_EXTENSION_WITH_WEB_HID_FALLBACK,
  appId: 'my-app-id', // may contain a combination of letters (A-Z, a-z), numbers (123), underscores (_), and hyphens (-)
  appName: 'My app name', // end-user friendly name for your application
  logger: {
    write(logEvent) {
      if (logEvent.level == LogLevel.ERROR) {
        console.error("Jabra SDK log " + logEvent.level + ": " + logEvent.message, logEvent.layer);
      }
    }
  }
};

// Load properties definition JSON
const propertiesDefinition = await loadPropertiesDefinition();

// NOTE: Timing wise we need to load the properties definition before initializing the SDK
// as the PropertyModule needs it during initialization. Also, we want to set up the deviceAdded subscription
// immediately after initializing the SDK to avoid missing any devices.
// INTERNAL NOTE: Feature request to update init: 982357

// Initialize Jabra library using the config object
const jabraSdk = await init(config);
// (...) setup device added/removed events (see below)

if (jabraSdk.transportContext === TransportContext.WEB_HID) {
  writeOutput("Jabra SDK initialized using WebHID transport. Properties will only work on devices that support WebHID fully such as Jabra Engage 40, 50, 50 II. If you need to use properties with other devices, try using the Chrome Extension transport instead.");
  writeOutput("For first time use, please click the 'Add Jabra headset' button to add a device using WebHID.");
  const webHidButton = document.getElementById('webHidButton');
  webHidButton.disabled = false;
  webHidButton.addEventListener('click', async () => {
    writeOutput('Adding Jabra device using WebHID');
    await webHidPairing();
    // If user added a device, the deviceAdded and deviceList subscriptions 
    // will trigger and you should handle the device interaction there.
  });
} else {
  writeOutput("Jabra SDK initialized using Chrome Extension transport. Properties should work on all supported devices.");
}

// Subscribe to Jabra devices being attached/detected by the SDK
jabraSdk.deviceAdded.subscribe(async (/**@type {import('@gnaudio/jabra-js').IDevice} */ device) => {
  writeOutput(`Device attached/detected: ${device.name} (Product ID: ${device.productId}, Serial #: ${device.serialNumber})`);

  // Update active headset name field
  setActiveHeadsetName(device.name);

  // Use Properties module to read common properties
  readCommonProperties(device);

  // Customize 3-dot button if supported by device
  // Currently supported on Jabra Engage 40/50/50 II only
  // For same device models, subscribe to relevant audio telemetry events as well.   
  if ((device.name == "Jabra Engage 40") || (device.name == "Jabra Engage 50") || (device.name == "Jabra Engage 50 II")) {
    // Enable dropdowns for LED customization
    if (colorSelector) colorSelector.disabled = false;
    if (ledModeSelector) ledModeSelector.disabled = false;

    // Customize 3-dot button

    if (await customizeButton(device)) {
      writeOutput("3-dot button customization set up for device " + device.name +
        " - tap the button to see events in the log");
    } else {
      writeOutput("Failed to set up 3-dot button customization for device " + device.name);
    }

    // Subscribe to audio telemetry properties
    await observeAudioTelemetry(device);

    // Initial UI setup for telemetry values
    updateSpeechAnalytics();

    // Read initial sideToneEnabled property state and update UI
    await setupSideToneDropdown(device);

  }
});

async function observeAudioTelemetry(device) {
  try {
    // Initialize the SDK's properties module if needed
    if (!propertiesModuleReady) { await initPropertyModule(); }
    // List the properties to use
    const propertyNames = [
      "backgroundNoiseLevel",
      "audioExposure",
      "customerSpeaking",
      "agentSpeaking",
      "microphoneMuteState"
    ];
    const propertyMap = await propertyFactory.createProperties(device, propertyNames);
    if (propertyMap) {
      writeOutput("Property map for audio telemetry properties created for device " + device.name);
      // Create Properties from device
      const backgroundNoiseLevelProperty = propertyMap.get("backgroundNoiseLevel");
      const audioExposureProperty = propertyMap.get("audioExposure");
      const customerSpeakingProperty = propertyMap.get("customerSpeaking");
      const agentSpeakingProperty = propertyMap.get("agentSpeaking");
      const microphoneMuteStateProperty = propertyMap.get("microphoneMuteState");
      // Subscribe to properties
      attachPropertySubscription(device, backgroundNoiseLevelProperty);
      attachPropertySubscription(device, audioExposureProperty);
      attachPropertySubscription(device, customerSpeakingProperty);
      attachPropertySubscription(device, agentSpeakingProperty);
      attachPropertySubscription(device, microphoneMuteStateProperty);
    }
  } catch (err) {
    console.error('Error observing audio telemetry:', err);
  }
}

/**
 * Generic property subscription helper.
 * @template T
 * @param {import('@gnaudio/jabra-js').IDevice} device
 * @param {*} propertyObj - Property object returned from factory (must have watch())
 */
function attachPropertySubscription(device, propertyObj) {
  propertyObj.watch().subscribe({
    next(value) {
      writeOutput(`${propertyObj.name} for ${device.name}:`, value);
      switch (propertyObj.name) {
        case 'backgroundNoiseLevel':
          setAmbientNoise(value);
          break;
        case 'audioExposure':
          setAudioExposure(value);
          break;
        case 'customerSpeaking':
          customerSpeaking = value;
          updateSpeechAnalytics();
          break;
        case 'agentSpeaking':
          agentSpeaking = value;
          updateSpeechAnalytics();
          break;
        case 'microphoneMuteState':
          microphoneMuteState = value;
          updateSpeechAnalytics();
          break;
      }
    },
    error(e) {
      if (typeof jabra !== 'undefined' && e instanceof jabra.JabraError) {
        console.warn(`Could not subscribe to ${propertyName}. It may not be supported by ${device.name}`);
      } else {
        console.warn(`Failed monitoring ${propertyName} on ${device.name}`, e);
      }
    },
    complete() {
      writeOutput(`Completed observing ${propertyName} for ${device.name}`);
    }
  });
}

function updateSpeechAnalytics() {
  if (customerSpeaking) {
    if (agentSpeaking) {
      setSpeechAnalytics("Crosstalk", "red");
    } else {
      setSpeechAnalytics("Customer speaking", "black");
    }
  } else if (agentSpeaking) {
    setSpeechAnalytics("Agent speaking", "black");
  } else {
    setSpeechAnalytics("Silence", "orange");
  }
  if (microphoneMuteState) {
    if (agentSpeaking) {
      setMuteState("Speaking while muted", "red");
    } else {
      setMuteState("Muted", "orange");
    }
  } else {
    setMuteState("Unmuted", "green");
  }
}

async function readCommonProperties(device) {
  try {
    // Initialize the SDK's properties module if needed
    if (!propertiesModuleReady) { await initPropertyModule(); }
    const propertyNames = [
      "firmwareVersion"
    ];

    const propertyMap = await propertyFactory.createProperties(device, propertyNames);
    if (propertyMap) {
      writeOutput("Property map created for device " + device.name);
      //Read properties from device
      const firmwareVersionProperty = propertyMap.get("firmwareVersion");
      const firmwareVersion = await firmwareVersionProperty.get();
      writeOutput("Firmware version for " + device.name + ": " + firmwareVersion);
    }
  } catch (error) {
    // This commonly happens if you try to read properties from a device that does not support WebHID transport for properties. 
    writeOutput("Error reading properties for device " + device.name + ": " + error);
    writeOutput("This commonly happens if you try to read properties from a device that does not support WebHID transport for properties.");
  }
}

async function setupSideToneDropdown(device) {
  try {
    // Initialize the SDK's properties module if needed
    if (!propertiesModuleReady) { await initPropertyModule(); }
    const propertyNames = [
      "sidetoneEnabled"
    ];

    const propertyMap = await propertyFactory.createProperties(device, propertyNames);
    if (propertyMap) {
      writeOutput("Property map created for device " + device.name);
      //Read properties from device
      const sidetoneEnabledProperty = propertyMap.get("sidetoneEnabled");
      const sidetoneEnabled = await sidetoneEnabledProperty.get();
      writeOutput("Side Tone enabled for " + device.name + ": " + sidetoneEnabled);
      if (sideToneSelector) {
        sideToneSelector.value = sidetoneEnabled;
        sideToneSelector.disabled = false;
        // Set up change listener
        sideToneSelector.addEventListener('change', async () => {
          const newValueString = sideToneSelector.value;
          let newValue = newValueString == "true";
          await propertyMap.startTransaction().set(sidetoneEnabledProperty.name, newValue).commit();
          writeOutput("Set sidetoneEnabled to " + newValue + " for " + device.name);
        });
      }
    }
  } catch (error) {
    // This commonly happens if you try to read properties from a device that does not support WebHID transport for properties. 
    writeOutput("Error reading properties for device " + device.name + ": " + error);
    writeOutput("This commonly happens if you try to read properties from a device that does not support WebHID transport for properties.");
  }
}

async function initPropertyModule() {
  propertyModule = new PropertyModule(jabraSdk);
  propertyFactory = await propertyModule.createPropertyFactory(propertiesDefinition);
  propertiesModuleReady = true;
}

// Customize button function if supported by headset
async function customizeButton(device) {
  try {
    const deviceController = await createDeviceController(device);
    if (deviceController) {
      threeDotButton = await deviceController.getButton(ButtonId.threeDot);
      const threeDotButtonListener = await threeDotButton.listenFor(ButtonInteraction.tap);

      /**
       * @type {import('rxjs').Observer<any>}
       */
      const observer = {
        next: () => {
          writeOutput('Button tapped');
        },
        error: (err) => {
          console.error('Error listening for button tap:', err);
        },
        complete: () => {
          writeOutput('Stopped listening for button tap');
        }
      };
      threeDotButtonListener.subscribe(observer);
      await setInitialThreeDotColor();
      // Successfully set up customization - return true
      return true;
    } else { return false; }

  } catch (error) {
    console.error('Error customizing button:', error);
    return false;
  }
}



const colorSelector = document.getElementById('colorSelector');
const ledModeSelector = document.getElementById('ledModeSelector');

const customColorInputs = document.getElementById('customColorInputs');
const customR = document.getElementById('customR');
const customG = document.getElementById('customG');
const customB = document.getElementById('customB');
const applyCustomColorBtn = document.getElementById('applyCustomColorBtn');

const sideToneSelector = document.getElementById('sideToneSelector');

// Show/hide RGB inputs based on color selection
if (colorSelector && customColorInputs) {
  colorSelector.addEventListener('change', () => {
    if (colorSelector.value === 'custom') {
      customColorInputs.classList.remove('hidden');
    } else {
      customColorInputs.classList.add('hidden');
    }
  });
}

function getLedModeEnum(modeValue) {
  switch (modeValue) {
    case 'on':
      return LedMode.on;
    case 'slowPulse':
      return LedMode.slowPulse;
    case 'fastPulse':
      return LedMode.fastPulse;
    case 'off':
      return LedMode.off;
    default:
      return LedMode.on;
  }
}

function getColorValue() {
  if (colorSelector.value === 'custom' && customR && customG && customB) {
    // Clamp values to 0-255
    const r = Math.max(0, Math.min(255, parseInt(customR.value, 10) || 0));
    const g = Math.max(0, Math.min(255, parseInt(customG.value, 10) || 0));
    const b = Math.max(0, Math.min(255, parseInt(customB.value, 10) || 0));
    return { r, g, b, isCustom: true };
  }
  switch (colorSelector.value) {
    case 'blue':
      return { colorEnum: Color.blue, isCustom: false };
    case 'red':
      return { colorEnum: Color.red, isCustom: false };
    case 'green':
      return { colorEnum: Color.green, isCustom: false };
    case 'yellow':
      return { colorEnum: Color.yellow, isCustom: false };
    default:
      return { colorEnum: Color.blue, isCustom: false };
  }
}

// Set color or mode on dropdown change
function updateThreeDotButtonLed() {
  if (threeDotButton && colorSelector && ledModeSelector) {
    const color = getColorValue();
    const modeEnum = getLedModeEnum(ledModeSelector.value);
    if (color.isCustom) {
      // Only set color when Apply button is pressed
      return;
    } else {
      threeDotButton.setColor(color.colorEnum, modeEnum);
      writeOutput(`Set 3-dot button LED to ${colorSelector.value}, mode: ${ledModeSelector.value}`);
    }
  }
}

if (colorSelector) colorSelector.addEventListener('change', updateThreeDotButtonLed);
if (ledModeSelector) {
  ledModeSelector.addEventListener('change', () => {
    if (colorSelector && colorSelector.value === 'custom' && applyCustomColorBtn) {
      // If custom, apply immediately
      applyCustomColorBtn.click();
    } else {
      updateThreeDotButtonLed();
    }
  });
}

if (applyCustomColorBtn) {
  applyCustomColorBtn.addEventListener('click', () => {
    if (threeDotButton && colorSelector && ledModeSelector && colorSelector.value === 'custom') {
      const color = getColorValue();
      const modeEnum = getLedModeEnum(ledModeSelector.value);
      threeDotButton.setColor(new Color(color.r, color.g, color.b), modeEnum);
      writeOutput(`Set 3-dot button LED to custom RGB (${color.r},${color.g},${color.b}), mode: ${ledModeSelector.value}`);
    }
  });
}

// Set color and mode on page load/device attach
async function setInitialThreeDotColor() {
  if (threeDotButton && colorSelector && ledModeSelector) {
    const color = getColorValue();
    const modeEnum = getLedModeEnum(ledModeSelector.value);
    if (color.isCustom) {
      await threeDotButton.setColor({ r: color.r, g: color.g, b: color.b }, modeEnum);
      writeOutput(`Set 3-dot button LED to custom RGB (${color.r},${color.g},${color.b}), mode: ${ledModeSelector.value} (initial)`);
    } else {
      await threeDotButton.setColor(color.colorEnum, modeEnum);
      writeOutput(`Set 3-dot button LED to ${colorSelector.value}, mode: ${ledModeSelector.value} (initial)`);
    }
  }
}

async function loadPropertiesDefinition() {
  writeOutput("Loading properties definition...");
  return (
    await fetch(
      "node_modules/@gnaudio/jabra-properties-definition/properties.json"
    )
  ).json();
}

// ===== UI helper functions for right-hand telemetry panel =====
/**
 * Set the active headset name text.
 * @param {string} name 
 */
function setActiveHeadsetName(name) {
  const el = document.getElementById('activeHeadsetName');
  if (el) { el.textContent = name; }
}

/**
 * Update ambient noise value in dB. 
 * @param {number|null|undefined} value
 */
function setAmbientNoise(value) {
  const el = document.getElementById('ambientNoiseValue');
  el.value = value;
  el.style.color = 'green';
  if (value > 65) { el.style.color = 'orange'; };
  if (value > 80) { el.style.color = 'red'; };
}

/**
 * Update audio exposure value in dB.
 * @param {number|null|undefined} value
 */
function setAudioExposure(value) {
  const el = document.getElementById('audioExposureValue');
  el.value = value;
  el.style.color = 'green';
  if (value > 65) { el.style.color = 'orange'; };
  if (value > 80) { el.style.color = 'red'; };
}

/**
 * Set speech analytics text.
 * @param {string} text
 * @param {string} color
 */
function setSpeechAnalytics(text, color) {
  const el = document.getElementById('speechAnalyticsValue');
  el.value = (text);
  el.style.color = color;

}

function setMuteState(text, color) {
  const el = document.getElementById('muteStateValue');
  el.value = (text);
  el.style.color = color;
}

