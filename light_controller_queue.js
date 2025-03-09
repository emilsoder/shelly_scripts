// --- Light Controller with Queue ---
// This script is an extension of the Light Controller script that uses a queue to process button events.
// It handles multiple button presses in quick succession by processing each event in order.
// When deviceCommunicationType is "local", the local API is used via Shelly.call("Light.Set", ...)
// Otherwise, the remote API is used via HTTP calls.

// --- Button Configurations ---
const BLEEventComponentName = "script:1";

// --- Configuration Section ---

var brightnessStepsMapping = {
  1: [0, 3, 5, 10, 25, 50, 75, 100],
  2: [0, 3, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  3: [
    0, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
    95, 100,
  ],
};
const defaultMinimumBrightness = 3;
let buttonConfigurations = {};

// --- Queue Variables ---
let eventQueue = [];
let queueHead = 0;
let isProcessing = false;

// --- Button Configuration ---
function configureButton(
  button,
  deviceId,
  channelId,
  deviceCommunicationType,
  deviceIpAddress
) {
  buttonConfigurations[button] = {
    deviceId: deviceId,
    channelId: channelId,
    deviceCommunicationType: deviceCommunicationType,
    deviceIpAddress: deviceIpAddress || "",
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
  for (var i = 0; i < steps.length; i++) {
    if (steps[i] > current) {
      return steps[i];
    }
  }
  return steps[steps.length - 1];
}

function nextLower(current, steps) {
  for (var i = steps.length - 1; i >= 0; i--) {
    if (steps[i] < current) {
      return steps[i];
    }
  }
  return 0;
}

// --- Helper for Sending Commands ---
function sendLightCommand(config, params) {
  if (config.deviceCommunicationType === "local") {
    // Use local API
    var args = { id: config.channelId };
    if (typeof params.brightness !== "undefined") {
      args.brightness = params.brightness;
    }
    // Convert the on/off param to a boolean if needed.
    args.on = params.on === "true" || params.on === true;
    Shelly.call("Light.Set", args, null);
    print("Called local Light.Set with args: " + JSON.stringify(args));
  } else {
    // Use HTTP API
    var url =
      "http://" + config.deviceIpAddress + "/rpc/Light.Set?on=" + params.on;
    if (typeof params.brightness !== "undefined") {
      url += "&brightness=" + params.brightness;
    }
    url += "&id=" + config.channelId;
    Shelly.call("HTTP.GET", { url: url }, null);
    print("Called: " + url);
  }
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
  if (config.deviceCommunicationType === "local") {
    // Use local API call to get status
    var args = { id: config.channelId };
    Shelly.call("Light.GetStatus", args, function (response, error) {
      if (error) {
        print("Local Light.GetStatus Error: " + error);
        if (typeof onComplete === "function") {
          onComplete();
        }
        return;
      }
      print("Called local Light.GetStatus with args: " + JSON.stringify(args));
      var res = safeJsonParse(response.body);
      var currentBrightness = res && res.brightness ? res.brightness : 0;
      var isOn = res && res.output;
      handleBrightnessAdjustment(
        config,
        currentBrightness,
        isOn,
        action,
        buttonType
      );
      if (typeof onComplete === "function") {
        onComplete();
      }
    });
  } else {
    // Use HTTP API
    var url =
      "http://" +
      config.deviceIpAddress +
      "/rpc/Light.GetStatus?id=" +
      config.channelId;
    Shelly.call("HTTP.GET", { url: url }, function (response, error) {
      if (error) {
        print("HTTP Error getting status: " + error);
        if (typeof onComplete === "function") {
          onComplete();
        }
        return;
      }
      print("Called: " + url);
      var res = safeJsonParse(response.body);
      var currentBrightness = res && res.brightness ? res.brightness : 0;
      var isOn = res && res.output;
      handleBrightnessAdjustment(
        config,
        currentBrightness,
        isOn,
        action,
        buttonType
      );
      if (typeof onComplete === "function") {
        onComplete();
      }
    });
  }
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
var BUTTON_MAP = [
  "btn_up_left",
  "btn_down_left",
  "btn_up_right",
  "btn_down_right",
];
var STATE_MAP = { 1: 1, 2: 2, 3: 3, 4: "long_press" };

function parseButtonState(data) {
  if (!data.button || data.button.length !== 4) return null;
  for (var i = 0; i < 4; i++) {
    var state = data.button[i];
    // Skip 0 and 254 values (which indicate no press or release)
    if (state && state !== 254 && STATE_MAP[state]) {
      return { button: BUTTON_MAP[i], action: STATE_MAP[state] };
    }
  }
  return null;
}

// --- Helper to Schedule Next Queue Processing ---
function scheduleNext() {
  // Use Timer.set(delay, repeat, callback)
  Timer.set(0, false, function () {
    processQueue();
  });
}

// --- Queue Processing ---
function processQueue() {
  if (queueHead >= eventQueue.length) {
    // Reset queue when done.
    eventQueue = [];
    queueHead = 0;
    isProcessing = false;
    return;
  }
  isProcessing = true;

  var queuedItem = eventQueue[queueHead];
  queueHead++;

  var eventData = queuedItem.data;
  var parsed = parseButtonState(eventData);
  if (!parsed) {
    // No valid button press found; schedule next event.
    scheduleNext();
    return;
  }
  var config = buttonConfigurations[parsed.button];
  if (!config) {
    scheduleNext();
    return;
  }
  var buttonType = parsed.button.indexOf("up") !== -1 ? "up" : "down";
  deviceGetLightStatus(config, parsed.action, buttonType, function () {
    scheduleNext();
  });
}

// --- Event Handler ---
Shelly.addEventHandler(function (event) {
  if (event.component !== BLEEventComponentName) return;
  var eventData = safeJsonParse(event.info.data);
  if (!eventData) return;

  // Enqueue the event data.
  eventQueue.push({ data: eventData });

  // Start processing if not already in progress.
  if (!isProcessing) {
    processQueue();
  }
});

// --- Button Configurations ---
// For devices using the local API, set the communication type to "local" and leave the IP empty.

configureButton("btn_up_left", "LeftDevice", 0, "http", "192.168.0.12");
configureButton("btn_down_left", "LeftDevice", 0, "http", "192.168.0.12");
configureButton("btn_up_right", "RightDevice", 0, "http", "192.168.0.178");
configureButton("btn_down_right", "RightDevice", 0, "http", "192.168.0.178");
