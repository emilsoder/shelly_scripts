let STEP = 10; // Brightness step percentage
let WHITE_CHANNEL_ID = 0; // Change if needed (check if your device uses a different ID)
function parseButtonState(data) {
  if (!data.button || data.button.length !== 4) return null;

  let buttonMap = [
    "btn_up_left",
    "btn_down_left",
    "btn_up_right",
    "btn_down_right",
  ];
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

  if (
    !result ||
    (result.button !== "btn_up_left" && result.button !== "btn_down_left")
  ) {
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
      if (button === "btn_up_left") {
        newBrightness = Math.min(newBrightness + STEP, 100);
      } else if (button === "btn_down_left") {
        newBrightness = Math.max(newBrightness - STEP, 0);
      }
    }

    // Apply brightness after all presses are processed
    if (button === "btn_up_left" && action === "long_press") {
      turnOn();
    } else if (button === "btn_down_left" && action === "long_press") {
      turnOff();
    } else if (button === "btn_up_left" || button === "btn_down_left") {
      setBrightness(newBrightness);
    }
  });
});


/*
IMPROVE THIS SCRIPT TO HANDLE THE FOLLOWING:
A TOTAL REMAKE OF THE EXISTING SCRIPT IS ALLOWED

if light is off, turn on on single press (btn_up_left)
if light is on, turn off on long press (btn_down_left)
if light is on, increase brightness on single press, double press, triple press (btn_up_left)
if light is on, decrease brightness on single press, double press, triple press (btn_down_left)
if light is on, turn off when brightness is 0 (btn_down_left)
if light is on, set brightness to 100 on long press (btn_up_left)
if light is off, turn on on long press (btn_down_left)
if light is off, turn on on single press (btn_down_left)

These are the brigness steps on single press: 3,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100
These are the brigness steps on double press: 3,5,10,20,30,40,50,60,70,80,90,100
These are the brigness steps on triple press: 3,25,50,75,100


Make it so that the script can be configured to also handle btn_up_right and btn_down_right to control a separate device and/or channel.

like: configureButtonUp("btn_up_right", "[DeviceId]", "[ChannelId]", "[deviceCommunicationType]", "deviceIpAddress" );
deviceIpAddress can be empty if deviceCommunicationType is "local"

deviceCommunicationType can be "local", "http"
local: use Shelly.call
http: use http request
*/