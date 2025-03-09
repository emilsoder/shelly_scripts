// --- Configuration Section ---

// Define brightness steps for different press types
const brightnessStepsMapping = {
  1: [
    3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
    95, 100,
  ],
  2: [3, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  3: [3, 25, 50, 75, 100],
};

// Global configuration object to store settings for each button
let buttonConfigurations = {};

// Functions to explicitly configure buttons
function configureButtonUp(
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

function configureButtonDown(
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

// Calculate next higher brightness level from the current brightness given an array of steps
function nextHigher(current, steps) {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] > current) return steps[i];
  }
  return current; // Already at or above highest step (usually 100)
}

// Calculate next lower brightness level from the current brightness given an array of steps
function nextLower(current, steps) {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] < current) return steps[i];
  }
  return 0; // None found, return 0 to indicate light should be off
}

// Generic device control functions supporting local and http communication
function deviceGetLightStatus(config, callback) {
  if (config.deviceCommunicationType === "local") {
    Shelly.call(
      "Light.GetStatus",
      { id: config.channelId },
      function (res, error_code, error_message) {
        if (error_code !== 0 || !res) {
          print("Error getting light status: " + error_message);
          callback(0, false);
          return;
        }
        let brightness = res.brightness || 0;
        let isOn = res.ison || false;
        callback(brightness, isOn);
      }
    );
  } else if (config.deviceCommunicationType === "http") {
    let url =
      "http://" +
      config.deviceIpAddress +
      "/rpc/Light.GetStatus?id=" +
      config.channelId;
    Shelly.call("HTTP.GET", { url: url }, function (response, error) {
      if (error) {
        print("HTTP Error getting status: " + error);
        callback(0, false);
        return;
      }
      let res = JSON.parse(response);
      let brightness = res.brightness || 0;
      let isOn = res.ison || false;
      callback(brightness, isOn);
    });
  }
}

function deviceSetBrightness(config, value) {
  if (config.deviceCommunicationType === "local") {
    Shelly.call("Light.Set", { id: config.channelId, brightness: value });
  } else if (config.deviceCommunicationType === "http") {
    let url =
      "http://" +
      config.deviceIpAddress +
      "/rpc/Light.Set?brightness=" +
      value +
      "&id=" +
      config.channelId;
    Shelly.call("HTTP.GET", { url: url }, function (response, error) {
      if (error) {
        print("HTTP Error setting brightness: " + error);
      }
    });
  }
}

function deviceTurnOn(config) {
  if (config.deviceCommunicationType === "local") {
    Shelly.call("Light.Set", { id: config.channelId, on: true });
  } else if (config.deviceCommunicationType === "http") {
    let url =
      "http://" +
      config.deviceIpAddress +
      "/rpc/Light.Set?on=true&id=" +
      config.channelId;
    Shelly.call("HTTP.GET", { url: url }, function (response, error) {
      if (error) {
        print("HTTP Error turning on light: " + error);
      }
    });
  }
}

function deviceTurnOff(config) {
  if (config.deviceCommunicationType === "local") {
    Shelly.call("Light.Set", { id: config.channelId, on: false });
  } else if (config.deviceCommunicationType === "http") {
    let url =
      "http://" +
      config.deviceIpAddress +
      "/rpc/Light.Set?on=false&id=" +
      config.channelId;
    Shelly.call("HTTP.GET", { url: url }, function (response, error) {
      if (error) {
        print("HTTP Error turning off light: " + error);
      }
    });
  }
}

// --- Button Event Parsing ---

// Parse BLE button data to determine which button was pressed and the type of action.
// Button map order: up_left, down_left, up_right, down_right
// State mapping: 1 = Single Press, 2 = Double Press, 3 = Triple Press, 4 = Long Press
function parseButtonState(data) {
  if (!data.button || data.button.length !== 4) return null;

  let buttonMap = [
    "btn_up_left",
    "btn_down_left",
    "btn_up_right",
    "btn_down_right",
  ];
  let stateMap = { 1: 1, 2: 2, 3: 3, 4: "long_press" };

  for (let i = 0; i < 4; i++) {
    let state = data.button[i];

    // Ignore '254' (button is still being held)
    if (state === 254) {
      print("Ignoring button hold event.");
      return null;
    }

    if (stateMap[state]) {
      return { button: buttonMap[i], action: stateMap[state] };
    } else if (state !== 0) {
      print("Unrecognized button state: " + state);
    }
  }
  return null;
}


// --- Main Event Handler ---

Shelly.addEventHandler(function (event) {
  print(JSON.stringify(event));
  if (event.component !== "script:1") return;
  let result = parseButtonState(event.info.data);
  if (!result) {
    print("No valid button press detected.");
    return;
  }

  let config = buttonConfigurations[result.button];
  if (!config) {
    print("No configuration found for button: " + result.button);
    return;
  }

  deviceGetLightStatus(config, function (currentBrightness, isOn) {
    // Process "up" buttons (increase brightness or turn on)
    if (result.button.indexOf("up") !== -1) {
      if (isOn) {
        if (result.action === "long_press") {
          // Light is on, long press sets brightness to 100.
          deviceSetBrightness(config, 100);
        } else {
          // Increase brightness for single, double, triple presses.
          let steps =
            brightnessStepsMapping[result.action] || brightnessStepsMapping[1];
          let newBrightness = nextHigher(currentBrightness, steps);
          deviceSetBrightness(config, newBrightness);
        }
      } else {
        // Light is off. Turn it on at the lowest brightness step.
        let steps =
          brightnessStepsMapping[result.action] || brightnessStepsMapping[1];
        deviceSetBrightness(config, steps[0]);
        deviceTurnOn(config);
      }
    }
    // Process "down" buttons (decrease brightness or turn off)
    else if (result.button.indexOf("down") !== -1) {
      if (isOn) {
        if (result.action === "long_press") {
          // Long press: turn off the light.
          deviceTurnOff(config);
        } else {
          // Decrease brightness.
          let steps =
            brightnessStepsMapping[result.action] || brightnessStepsMapping[1];
          let newBrightness = nextLower(currentBrightness, steps);
          if (newBrightness <= 0) {
            // Turn off if brightness reaches 0.
            deviceTurnOff(config);
          } else {
            deviceSetBrightness(config, newBrightness);
          }
        }
      } else {
        // Light is off. Turn it on at the lowest brightness step.
        let steps =
          brightnessStepsMapping[result.action] || brightnessStepsMapping[1];
        deviceSetBrightness(config, steps[0]);
        deviceTurnOn(config);
      }
    }
  });
});

// --- Explicit Button Configuration ---
configureButtonUp("btn_up_left", "LeftDevice", 0, "http", "192.168.0.12");
configureButtonDown("btn_down_left", "LeftDevice", 0, "http", "192.168.0.12");

configureButtonUp("btn_up_right", "RightDevice", 0, "http", "192.168.0.178");
configureButtonDown(
  "btn_down_right",
  "RightDevice",
  0,
  "http",
  "192.168.0.178"
);
