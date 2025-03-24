// --- Light Controller with Queue ---
// This script is an extension of the Light Controller script that uses a queue to process button events.
// It handles multiple button presses in quick succession by processing each event in order.
// Uses the local API via Shelly.call("Light.Set", ...)
// Only processes button events from configured BLE devices.

// --- Button Configurations ---
const BLEEventComponentName = "script:1";

// --- Configurable Button Array ---
// Update this array to change which buttons are configured and how.
const BUTTON_CONFIGS = [
  {
    button: "btn_up_left",
    deviceId: "LeftDevice",
    channelId: 0,
  },
  {
    button: "btn_down_left",
    deviceId: "LeftDevice",
    channelId: 0,
  },
  {
    button: "btn_up_right",
    deviceId: "RightDevice",
    channelId: 1,
  },
  {
    button: "btn_down_right",
    deviceId: "RightDevice",
    channelId: 1,
  },
];

// --- Configuration Section ---
const brightnessStepsMapping = {
  1: [0, 3, 5, 10, 25, 50, 75, 100],
  2: [0, 3, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  3: [0, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
};
const defaultMinimumBrightness = 3;
const MAX_QUEUE_SIZE = 100; // Prevent queue from growing too large
const PROCESSING_DELAY_MS = 50; // Delay between processing queue items

// --- State Management ---
let buttonConfigurations = {};
let eventQueue = [];
let queueHead = 0;
let isProcessing = false;
let lastProcessedTime = 0;

// --- Button Configuration ---
function configureButton(button, deviceId, channelId) {
  if (!button || !deviceId || typeof channelId !== 'number') {
    print("Error: Invalid button configuration");
    return;
  }
  buttonConfigurations[button] = {
    deviceId: deviceId,
    channelId: channelId,
  };
}

// --- Utility Functions ---
function safeJsonParse(input) {
  try {
    return typeof input === "string" ? JSON.parse(input) : input;
  } catch (error) {
    print("JSON Parsing Error: " + error.message);
    print("Raw Data: " + JSON.stringify(input));
    return null;
  }
}

function nextHigher(current, steps) {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] > current) {
      return steps[i];
    }
  }
  return steps[steps.length - 1];
}

function nextLower(current, steps) {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] < current) {
      return steps[i];
    }
  }
  return 0;
}

// --- Helper for Sending Commands ---
function sendLightCommand(config, params) {
  if (!config || typeof config.channelId !== 'number') {
    print("Error: Invalid config for light command");
    return;
  }

  const args = { id: config.channelId };
  if (typeof params.brightness !== "undefined") {
    args.brightness = params.brightness;
  }
  args.on = params.on === "true" || params.on === true;
  
  Shelly.call("Light.Set", args, function(response, error) {
    if (error) {
      print("Error sending light command: " + error);
    } else {
      print("Successfully sent light command with args: " + JSON.stringify(args));
    }
  });
}

function deviceSetBrightness(config, value) {
  sendLightCommand(config, { on: (value !== 0).toString(), brightness: value });
}

function deviceTurnOn(config) {
  sendLightCommand(config, { on: "true" });
}

function deviceTurnOff(config) {
  sendLightCommand(config, { on: "false" });
}

// --- Device Status and Brightness Handling ---
function deviceGetLightStatus(config, action, buttonType, onComplete) {
  if (!config || typeof config.channelId !== 'number') {
    print("Error: Invalid config for getting light status");
    if (typeof onComplete === "function") onComplete();
    return;
  }

  const args = { id: config.channelId };
  print("Getting light status for channel: " + config.channelId);
  
  Shelly.call("Light.GetStatus", args, function(response, error) {
    if (error) {
      print("Error getting light status: " + error);
      if (typeof onComplete === "function") onComplete();
      return;
    }

    print("Raw Light.GetStatus response: " + JSON.stringify(response));
    
    const res = safeJsonParse(response.body);
    if (!res) {
      print("Error: Invalid response from Light.GetStatus");
      print("Response body: " + JSON.stringify(response.body));
      if (typeof onComplete === "function") onComplete();
      return;
    }

    print("Parsed light status: " + JSON.stringify(res));
    
    const currentBrightness = res.brightness || 0;
    const isOn = res.output || false;
    
    handleBrightnessAdjustment(config, currentBrightness, isOn, action, buttonType);
    if (typeof onComplete === "function") onComplete();
  });
}

function handleBrightnessAdjustment(
  config,
  currentBrightness,
  isOn,
  action,
  buttonType
) {
  var steps = brightnessStepsMapping[action] || brightnessStepsMapping[1];
  if (buttonType === "up") {
    if (isOn) {
      var newBrightness =
        action === "long_press" ? 100 : nextHigher(currentBrightness, steps);
      deviceSetBrightness(config, newBrightness);
    } else {
      deviceTurnOn(config);
    }
  } else if (buttonType === "down") {
    if (isOn) {
      if (action === "long_press") {
        deviceTurnOff(config);
      } else {
        var newBrightness = nextLower(currentBrightness, steps);
        if (newBrightness <= 0) {
          deviceTurnOff(config);
        } else {
          deviceSetBrightness(config, newBrightness);
        }
      }
    } else {
      if (currentBrightness < defaultMinimumBrightness) {
        deviceSetBrightness(config, defaultMinimumBrightness);
      } else {
        deviceTurnOn(config);
      }
    }
  }
}

// --- Button State Parsing ---
// Define static maps outside of the function.
const BUTTON_MAP = [
  "btn_up_left",
  "btn_down_left",
  "btn_up_right",
  "btn_down_right",
];
const STATE_MAP = { 1: 1, 2: 2, 3: 3, 4: "long_press" };

function parseButtonState(data) {
  print("Received button data: " + JSON.stringify(data));
  
  // Handle case where data is a string
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      print("Error parsing string data: " + e);
      return null;
    }
  }
  
  // Handle case where data is already parsed
  if (typeof data !== 'object' || data === null) {
    print("Error: Data is not an object");
    return null;
  }

  // Handle case where button data is directly in the data object
  if (typeof data.button === 'number') {
    // Single button press
    const buttonIndex = data.button - 1; // Convert 1-based to 0-based index
    if (buttonIndex >= 0 && buttonIndex < BUTTON_MAP.length) {
      const result = { 
        button: BUTTON_MAP[buttonIndex], 
        action: 1 // Default to single press
      };
      print("Found single button press: " + JSON.stringify(result));
      return result;
    }
    print("Error: Invalid button index: " + data.button);
    return null;
  }
  
  // Handle case where button data is an array
  if (Array.isArray(data.button)) {
    if (data.button.length !== 4) {
      print("Error: Button array length is not 4, got: " + data.button.length);
      return null;
    }

    for (let i = 0; i < 4; i++) {
      const state = data.button[i];
      print("Checking button " + i + " state: " + state);
      
      // Skip 0 and 254 values (which indicate no press or release)
      if (state && state !== 254 && STATE_MAP[state]) {
        const result = { button: BUTTON_MAP[i], action: STATE_MAP[state] };
        print("Found valid button press: " + JSON.stringify(result));
        return result;
      }
    }
  }
  
  print("No valid button press found in data: " + JSON.stringify(data));
  return null;
}

// --- Queue Processing ---
function scheduleNext() {
  const now = Date.now();
  const timeSinceLastProcess = now - lastProcessedTime;
  
  // Ensure minimum delay between processing items
  const delay = Math.max(0, PROCESSING_DELAY_MS - timeSinceLastProcess);
  
  Timer.set(delay, false, function() {
    processQueue();
  });
}

function processQueue() {
  if (queueHead >= eventQueue.length) {
    // Reset queue when done
    eventQueue = [];
    queueHead = 0;
    isProcessing = false;
    return;
  }

  isProcessing = true;
  lastProcessedTime = Date.now();

  const queuedItem = eventQueue[queueHead];
  queueHead++;

  const eventData = queuedItem.data;
  const parsed = parseButtonState(eventData);
  
  if (!parsed) {
    print("Warning: No valid button press found in event data");
    scheduleNext();
    return;
  }

  const config = buttonConfigurations[parsed.button];
  if (!config) {
    print("Warning: No configuration found for button: " + parsed.button);
    scheduleNext();
    return;
  }

  const buttonType = parsed.button.indexOf("up") !== -1 ? "up" : "down";
  deviceGetLightStatus(config, parsed.action, buttonType, scheduleNext);
}

// --- Event Handler ---
Shelly.addEventHandler(function(event) {
  print("Received event: " + JSON.stringify(event));
  
  // Only process events from our BLE event component
  if (event.component !== BLEEventComponentName) {
    print("Ignoring event from component: " + event.component);
    return;
  }
  
  const eventData = safeJsonParse(event.info.data);
  if (!eventData) {
    print("Error: Failed to parse event data");
    return;
  }

  print("Parsed event data: " + JSON.stringify(eventData));

  // Only process events that contain button data
  if (!eventData.button) {
    print("Ignoring event without button data");
    return;
  }

  // Prevent queue from growing too large
  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    print("Warning: Queue full, dropping event");
    return;
  }

  // Enqueue the event data
  eventQueue.push({ data: eventData });
  print("Added event to queue. Queue length: " + eventQueue.length);

  // Start processing if not already in progress
  if (!isProcessing) {
    processQueue();
  }
});

// --- Initialize Button Configurations ---
for (const cfg of BUTTON_CONFIGS) {
  configureButton(cfg.button, cfg.deviceId, cfg.channelId);
}


