import { init, webHidPairing, RequestedBrowserTransport, TransportContext, LogLevel, IApi, IDevice, JabraError, IConfig } from '@gnaudio/jabra-js';
import { ButtonInteraction, createDeviceController, ButtonId, Color, LedMode, IButton } from '@gnaudio/jabra-js-button-customization';
import { IProperty, IPropertyFactory, IPropertyModule, PropertyModule } from '@gnaudio/jabra-js-properties';
import * as ui from './ui'
import propertiesDefinition from '@gnaudio/jabra-properties-definition/properties.json'

// Variables for general Jabra SDK instances
let jabraSdk: IApi
let propertyModule: IPropertyModule
let propertyFactory: IPropertyFactory

//TODO: Basic timing workaround. Document
let sdkInitializationCompleted: () => void;
const isSdkInitializationCompleted = new Promise<void>((resolve) => { sdkInitializationCompleted = resolve; });

// Variables for button customization on specific device
let threeDotButtonTakeover: IButton

// Speech analytics states for the currently selected device
const speechAnalyticsState = {
  customerSpeaking: false,
  agentSpeaking: false,
  microphoneMuteState: false
};

// Initialize the demo app when the page has loaded
window.addEventListener('load', async () => {
  await initializeSdk();
  await setupWebHidPermissionUI();
});

function updateSpeechAnalyticsState(key: keyof typeof speechAnalyticsState, value: boolean) {
  speechAnalyticsState[key] = value;
  ui.updateSpeechAnalytics(speechAnalyticsState);
}

async function initializeSdk() {
  const config: IConfig = {
    partnerKey: 'your-partner-key', // We recommend initializing with a proper Partner Key.
    transport: RequestedBrowserTransport.CHROME_EXTENSION_WITH_WEB_HID_FALLBACK, // For browser apps, you should **always** use CHROME_EXTENSION_WITH_WEB_HID_FALLBACK for transport. 
    appId: 'my-app-id', // may contain a combination of letters (A-Z, a-z), numbers (123), underscores (_), and hyphens (-)
    appName: 'My app name', // end-user friendly name for your application
    logger: {
      write(logEvent) {
        if (logEvent.level == LogLevel.ERROR) {
          ui.writeOutput("Jabra SDK log " + logEvent.level + ": " + logEvent.message, { level: "error" });
          console.error("Jabra SDK log " + logEvent.level + ": " + logEvent.message, logEvent.layer);
        }
      }
    }
  };

  // Initialize Jabra library using the config object
  jabraSdk = await init(config);

  // Subscribe to Jabra devices being attached/detected by the SDK
  // NOTE: Timing wise we need to load the properties definition before initializing the SDK
  // as the PropertyModule needs it during initialization. Also, we want to set up the deviceAdded subscription
  // immediately after initializing the SDK to avoid missing any devices.
  // INTERNAL NOTE: Feature request to update init: 982357
  //TODO: Has the feature been implemented? If so, update the comment accordingly.
  jabraSdk.deviceAdded.subscribe(handleDeviceAdded);

  // Initialize PropertyModule.
  propertyModule = new PropertyModule();
  propertyFactory = await propertyModule.createPropertyFactory(propertiesDefinition);

  // Notify that SDK initialization is completed
  sdkInitializationCompleted();
}


async function handleDeviceAdded(device: IDevice) {
  await isSdkInitializationCompleted;

  ui.writeOutput(`Device attached/detected: Product ID: ${device.productId}, Serial #: ${device.serialNumber}`, { deviceName: device.name });

  // Update active headset name field
  ui.setActiveHeadsetName(device.name);

  // Use Properties module to read properties
  readDemoProperties(device);

  // For some device models, subscribe to audio telemetry events as well.
  if (["Jabra Engage 40", "Jabra Engage 50", "Jabra Engage 50 II"].includes(device.name)) {
    ui.reset()

    // Subscribe to audio telemetry properties
    await observeAudioTelemetry(device);

    // Read selected settings from device and set up input fields to modify them
    await setupSettingsInputFields(device);

    // Customize three-dot button and enable controls for it
    await customizeButton(device)
    ui.enableThreeDotButtonControls(async (color, mode) => {
      // Callback when color or mode is changed from the UI
      await threeDotButtonTakeover.setColor(color, mode);
    });
  }
}

function setupWebHidPermissionUI() {
  if (jabraSdk.transportContext === TransportContext.WEB_HID) {
    ui.writeOutput("Jabra SDK initialized using WebHID transport. Properties will only work on devices that support WebHID fully such as Jabra Engage 40, 50, 50 II. If you need to use properties with other devices, try using the Chrome Extension transport instead.");
    ui.writeOutput("For first time use, please click the 'Add Jabra headset' button to add a device using WebHID.");
    ui.enableWebHidPermissionButton(async () => {
      // When the user clicks the button, start the browser WebHID pairing flow. Note that calling `webHidPairing()` requires a user gesture such as a button click due to browser security restrictions.
      await webHidPairing();
    });
  } else {
    ui.writeOutput("Jabra SDK initialized using Chrome Extension transport. Properties should work on all supported devices.");
  }
}

async function observeAudioTelemetry(device: IDevice) {
  // List the Jabra device properties and prepare them for use on the device
  const propertyNames = [
    "backgroundNoiseLevel",
    "audioExposure",
    "customerSpeaking",
    "agentSpeaking",
    "microphoneMuteState"
  ];
  const propertyMap = await propertyFactory.createProperties(device, propertyNames);

  ui.writeOutput("Property map for audio telemetry properties created", { deviceName: device.name });

  // Subscribe to `watch()` observable properties. Note that not all properties support `watch()`.
  watchProperty(device, propertyMap.get("backgroundNoiseLevel"), value => {
    ui.setAmbientNoise(value);
  })
  watchProperty(device, propertyMap.get("audioExposure"), value => {
    ui.setAudioExposure(value);
  })
  watchProperty(device, propertyMap.get("customerSpeaking"), value => {
    updateSpeechAnalyticsState("customerSpeaking", value);
  })
  watchProperty(device, propertyMap.get("agentSpeaking"), value => {
    updateSpeechAnalyticsState("agentSpeaking", value);
  })
  watchProperty(device, propertyMap.get("microphoneMuteState"), value => {
    updateSpeechAnalyticsState("microphoneMuteState", value);
  })
}

async function setupSettingsInputFields(device: IDevice) {
  try {
    const propertyNames = [
      "sidetoneEnabled"
    ];
    const propertyMap = await propertyFactory.createProperties(device, propertyNames);

    //Read properties from device
    const sidetoneEnabledProperty = propertyMap.get("sidetoneEnabled");
    const sidetoneEnabled = await sidetoneEnabledProperty.get();

    ui.setSideTone(sidetoneEnabled.toString(), async (value) => {
      const newValue = (value === 'true');
      updateProperty(device, "sidetoneEnabled", newValue);
    });
  } catch (error) {
    ui.writeOutput("Error reading properties: " + error + ". This commonly happens if you try to read properties from a device that does not support WebHID transport for properties.", { level: "error", deviceName: device.name });
  }
}

async function customizeButton(device: IDevice) {
  try {
    const deviceController = await createDeviceController(device);

    if (!deviceController) {
      ui.writeOutput("Device controller could not be created for device. Device may not support button customization.", { level: "error", deviceName: device.name });
      throw Error("Device controller could not be created for device. Device may not support button customization: " + device.name);
    }

    threeDotButtonTakeover = await deviceController.getButton(ButtonId.threeDot);
    const threeDotButtonListener = await threeDotButtonTakeover.listenFor(ButtonInteraction.down);
    threeDotButtonListener.subscribe({
      next: () => {
        ui.writeOutput('Three-dot button down event detected', { deviceName: device.name });
      },
      error: (error: Error) => {
        console.error(`Error listening for button down event: ${error}`, { level: "error", deviceName: device.name });
      },
      complete: () => {
        ui.writeOutput('Stopped listening for button down event', { deviceName: device.name });
      }
    });

    // Set initial 3-dot button LED color and mode
    const color = Color.blue
    const mode = LedMode.on;
    await threeDotButtonTakeover.setColor(color, mode);
    ui.setThreeDotColorAndMode(color, mode);
  } catch (error) {
    console.error('Error customizing button:', error);
  }
}

async function readDemoProperties(device: IDevice) {
  try {
    // List the Jabra device properties and prepare them for use on the device
    const propertyNames = [
      "firmwareVersion",
    ];
    const propertyMap = await propertyFactory.createProperties(device, propertyNames);
    ui.writeOutput("Property map created", { deviceName: device.name });

    //Read properties from device
    const firmwareVersion = await propertyMap.get("firmwareVersion").get();
    ui.writeOutput("Firmware version: " + firmwareVersion, { deviceName: device.name });

  } catch (error) {
    ui.writeOutput("Error reading properties: " + error + ". Common error reasons are: (1) Reading properties not supported by this device. (2) Reading properties from a device that does not support WebHID transport for properties.", { level: "error", deviceName: device.name });
  }
}

function watchProperty(device: IDevice, property: IProperty, handleValue: (value: any) => void) {
  ui.writeOutput(`Subscribing to watch changes of ${property.name}`, { deviceName: device.name });
  property.watch().subscribe({
    next(value) {
      // When a new value is received
      ui.writeOutput(`${property.name}: ${value}`, { deviceName: device.name });
      handleValue(value);
    },
    error(e) {
      // When an error occurs when setting up or running the watch
      if (e instanceof JabraError) {
        ui.writeOutput(`Could not subscribe to ${property.name}. It may not be supported by device`, { level: "warning", deviceName: device.name });
      } else {
        ui.writeOutput(`Failed monitoring ${property.name}: ${e}`, { level: "error", deviceName: device.name });
      }
    },
    complete() {
      // When the watch is ended. E.g. when the device is disconnected
      ui.writeOutput(`Completed observing ${property.name}`, { deviceName: device.name });
    }
  });
}

async function updateProperty(device: IDevice, propertyName: string, value: any) {
  try {
    const propertyMap = await propertyFactory.createProperties(device, [propertyName]);
    await propertyMap.startTransaction().set(propertyName, value).commit();
    ui.writeOutput("Updated " + propertyName + " to " + value, { deviceName: device.name });
  } catch (error) {
    ui.writeOutput("Error writing properties: " + error, { level: "error", deviceName: device.name });
  }
}
