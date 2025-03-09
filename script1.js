let STEP = 10; // Brightness step percentage
let WHITE_CHANNEL_ID = 0; // Change if needed (check if your device uses a different ID)
function parseButtonState(data) {
  if (!data.button || data.button.length !== 4) return null;

  let buttonMap = ["btn_up", "btn_down", "btn_right_up", "btn_right_down"];
  let stateMap = { 1: 1, 2: 2, 3: 3, 4: "long_press" };
  // 1 = Single Press, 2 = Double Press (treated as two singles), 3 = Triple Press (treated as three singles), 4 = Long Press

  for (let i = 0; i < 4; i++) {
    let state = data.button[i];
    if (stateMap[state]) {
      return { button: buttonMap[i], action: stateMap[state] };
    }
  }
  return null;
}

// Function to get current brightness and power state
function getLightStatus(callback) {
  Shelly.call(
    "Light.GetStatus",
    { id: WHITE_CHANNEL_ID },
    function (res, error_code, error_message) {
      if (error_code !== 0 || !res) {
        print("Error getting light status: " + error_message);
        callback(0, false); // Default values to prevent crashes
        return;
      }
      let brightness = res.brightness || 0;
      let isOn = res.ison || false;
      print("brightness: " + brightness);
      callback(brightness, isOn);
    }
  );
}

// Function to set brightness for white mode
function setBrightness(value) {
  Shelly.call("Light.Set", { id: WHITE_CHANNEL_ID, brightness: value });
}

// Function to turn on the light
function turnOn() {
  Shelly.call("Light.Set", { id: WHITE_CHANNEL_ID, on: true });
}

// Function to turn off the light
function turnOff() {
  Shelly.call("Light.Set", { id: WHITE_CHANNEL_ID, on: false });
}

// Event handler for BLE button events
Shelly.addEventHandler(function (event) {
  if (event.component !== "script:2") return;

  let result = parseButtonState(event.info.data);

  if (!result) {
    print("No valid button press detected.");
    return; // Avoid error by ensuring result is not null
  }

  let button = result.button;
  let action = result.action;

  getLightStatus(function (currentBrightness, isOn) {
    let newBrightness = currentBrightness;

    // If action is 1, 2, or 3, we treat it as multiple single presses
    let pressCount = typeof action === "number" ? action : 1;

    for (let i = 0; i < pressCount; i++) {
      if (button === "btn_up") {
        newBrightness = Math.min(newBrightness + STEP, 100);
      } else if (button === "btn_down") {
        newBrightness = Math.max(newBrightness - STEP, 0);
      }
    }

    // Apply brightness after all presses are processed
    if (button === "btn_up" && action === "long_press") {
      turnOn();
    } else if (button === "btn_down" && action === "long_press") {
      turnOff();
    } else if (button === "btn_up" || button === "btn_down") {
      setBrightness(newBrightness);
    }
  });
});
