import { createApi, webHidPairing, RequestedBrowserTransport, TransportContext, LogLevel, IApi, IDevice, JabraError, IConfig } from '@gnaudio/jabra-js';
import { ButtonInteraction, createDeviceController, ButtonId, Color, LedMode, IButton } from '@gnaudio/jabra-js-button-customization';
import { IProperty, IPropertyFactory, IPropertyModule, PropertyModule } from '@gnaudio/jabra-js-properties';
import * as ui from './ui'
import propertiesDefinition from '@gnaudio/jabra-properties-definition/properties.json'

// Variables for general Jabra SDK instances
let jabraSdk: IApi
let propertyModule: IPropertyModule
let propertyFactory: IPropertyFactory

// Variables to hold button customization instances
let threeDotButtonTakeoverInstance: IButton

// Speech analytics states for the currently selected device
const speechAnalyticsState = {
  customerSpeaking: undefined as boolean | undefined,
  agentSpeaking: undefined as boolean | undefined,
  microphoneMuteState: undefined as boolean | undefined
};

// Initialize the demo app when the page has loaded
window.addEventListener('load', async () => {
  await initializeSdk();
  setupWebHidPermissionUI();
});

async function initializeSdk() {
  // Initialize Jabra core SDK library using a config object
  const sdkConfig: IConfig = {
    partnerKey: 'your-partner-key', // For production use, please obtain a partner key from developer.jabra.com
    transport: RequestedBrowserTransport.CHROME_EXTENSION_WITH_WEB_HID_FALLBACK, // For browser apps, you should **always** use CHROME_EXTENSION_WITH_WEB_HID_FALLBACK for transport. 
    appId: 'my-app-id', // Unique identifier for your application used in logging output
    appName: 'My app name', // end-user friendly name for your application
    logger: { // setup log level and handling for SDK log output
      write(logEvent) {
        if (logEvent.level == LogLevel.ERROR) {
          ui.writeOutput("Jabra SDK log " + logEvent.level + ": " + logEvent.message, { level: "error" });
          console.error("Jabra SDK log " + logEvent.level + ": " + logEvent.message, logEvent.layer);
        }
      }
    }
  };
  // Using createApi() instead of init() to avoid timing issue with SDK initialization.
  jabraSdk = await createApi(sdkConfig);
  // Subscribe to Jabra devices being attached/detected by the SDK.
  jabraSdk.deviceAdded.subscribe(handleDeviceAdded);
  // Initialize Jabra SDK PropertyModule.
  propertyModule = new PropertyModule();
  propertyFactory = await propertyModule.createPropertyFactory(propertiesDefinition);
  // Finalize initialization of the Jabra SDK core library. After this, the SDK will start detecting and connecting to devices.
  await jabraSdk.start();
}

/**
 * Handler for when a Jabra device is attached/detected by the SDK
 */
async function handleDeviceAdded(device: IDevice) {
  // Update UI with device information
  ui.writeOutput(`Device attached/detected: Product ID: ${device.productId}, Serial #: ${device.serialNumber}`, { deviceName: device.name });
  ui.setActiveHeadsetName(device.name);

  // For some device models, subscribe to audio telemetry events as well.
  if (["Jabra Engage 40", "Jabra Engage 50", "Jabra Engage 50 II"].includes(device.name)) {

    // Read a few properties from the device.
    await readProperties(device);

    // Subscribe to audio telemetry properties.
    await observeAudioTelemetry(device);

    // Set up input fields to read and modify selected device settings (properties)
    await setupSettingsInputFields(device);

    // Customize "three-dot button" and enable controls for it
    await customizeButton(device)
    ui.enableThreeDotButtonControls(async (color, mode) => {
      // Callback when color or mode is changed from the UI
      await threeDotButtonTakeoverInstance.setColor(color, mode);
    });
  }
}

/**
 * Add a button to the UI to allow the user to grant WebHID permission to the web app if needed.
 */
function setupWebHidPermissionUI() {
  // With the CHROME_EXTENSION_WITH_WEB_HID_FALLBACK transport, we may be using WebHID transport. If so, there are two ways to grant permission:
  // 1) The user has previously granted permission to the web app for the connected device(s). In this case, no action is needed.
  // 2) The user needs to explicitly grant permission using the browser WebHID permission prompt. This requires a user gesture such as a button click.
  // 3) A system administrator has set up enterprise policies to auto-grant WebHID permission to specific devices for specific web apps. In this case, no action is needed.
  // Therefore, we add a button to the UI that the user can click to start the WebHID permission flow if needed.
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

/**
 * Read selected properties (like settings and firmware version) from the device and print them to the UI.
 */
async function readProperties(device: IDevice) {
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

/**
 * Helper function to use the Jabra SDK Properties module to watch a property and handle incoming values and errors appropriately.
 */
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

/**
 * Helper function to use the Jabra SDK Properties module to update a property on the device and handle errors appropriately.
 */
async function updateProperty(device: IDevice, propertyName: string, value: any) {
  try {
    const propertyMap = await propertyFactory.createProperties(device, [propertyName]);
    await propertyMap.startTransaction().set(propertyName, value).commit();
    ui.writeOutput("Updated " + propertyName + " to " + value, { deviceName: device.name });
  } catch (error) {
    ui.writeOutput("Error writing properties: " + error, { level: "error", deviceName: device.name });
  }
}

/**
 * Using the Jabra SDK Properties Module, setup observation of audio telemetry properties from the device and print all changes received from
 * the device to the UI. Both as raw events and as interpreted values like "cross talk" etc. 
 */
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

  //Function to update the demo apps speech analytics state. This is needed to derive combined states like "crosstalk".
  function updateSpeechAnalyticsState(key: keyof typeof speechAnalyticsState, value: boolean | undefined) {
    speechAnalyticsState[key] = value;
    ui.updateSpeechAnalytics(speechAnalyticsState);
  }
}

/**
 * Using the Jabra SDK Properties Module, setup input fields for selected device settings. I.e. read the current value from the device and allow
 * the user to modify the value using the UI.
 */
async function setupSettingsInputFields(device: IDevice) {
  try {
    const propertyNames = [
      "sidetoneEnabled"
    ];
    const propertyMap = await propertyFactory.createProperties(device, propertyNames);

    //Read properties from device
    const sidetoneEnabledProperty = propertyMap.get("sidetoneEnabled");
    const sidetoneEnabled = await sidetoneEnabledProperty.get();

    // Setup UI to watch and modify sidetoneEnabled property
    ui.setSideTone(sidetoneEnabled.toString(), async (value) => {
      const newValue = (value === 'true');
      updateProperty(device, "sidetoneEnabled", newValue);
    });
  } catch (error) {
    ui.writeOutput("Error reading properties: " + error + ". This commonly happens if you try to read properties from a device that does not support WebHID transport for properties.", { level: "error", deviceName: device.name });
  }
}

/**
 * Using the Jabra SDK Button Customization Module, take over the "three-dot button" (a button with no default functionality) on the device to:
 * 1) Customize its' LED color and mode via the UI dropdowns.
 * 2) Setup subscriptions to log button down events to the UI.
 */
async function customizeButton(device: IDevice) {
  // Create a device controller for the device from the Jabra SDK Button Customization Module
  const deviceController = await createDeviceController(device);

  // Check if the device supports button customization. Not all devices do.
  if (!deviceController) {
    ui.writeOutput("Device controller could not be created for device. Device may not support button customization.", { level: "error", deviceName: device.name });
    throw Error("Device controller could not be created for device. Device may not support button customization: " + device.name);
  }

  // Take over the "three-dot button" on the device by creating a button instance for it. This needs to be persisted to be able to modify
  // color/mode and listen for events.
  threeDotButtonTakeoverInstance = await deviceController.getButton(ButtonId.threeDot);
  const threeDotButtonListener = await threeDotButtonTakeoverInstance.listenFor(ButtonInteraction.down); // Note other ButtonInteraction interaction like .up .tap, .doubleTap are also available.
  threeDotButtonListener.subscribe({
    next: () => {
      // Called when a button down event is received
      ui.writeOutput('Three-dot button down event detected', { deviceName: device.name });
    },
    error: (error: Error) => {
      // Called if an error occurs when listening for button events
      console.error(`Error listening for button down event: ${error}`, { level: "error", deviceName: device.name });
    },
    complete: () => {
      // Called when listening for button events is stopped
      ui.writeOutput('Stopped listening for button down event', { deviceName: device.name });
    }
  });

  // Set initial 3-dot button LED color and mode
  const color = Color.blue
  const mode = LedMode.on;
  await threeDotButtonTakeoverInstance.setColor(color, mode);
  ui.setThreeDotColorAndMode(color, mode);
}
