// --- Configuration Section ---

const brightnessStepsMapping = {
    1: [0, 3, 10, 25, 50, 75, 100],
    2: [0, 3, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    3: [0, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]
  };
  const defaultMinimumBrightness = 3;
  let buttonConfigurations = {};
  
  function configureButton(button, deviceId, channelId, deviceCommunicationType, deviceIpAddress) {
    buttonConfigurations[button] = {
      deviceId: deviceId,
      channelId: channelId,
      deviceCommunicationType: deviceCommunicationType,
      deviceIpAddress: deviceIpAddress || ""
    };
  }
  
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
      if (steps[i] > current) return steps[i];
    }
    return steps[steps.length - 1];
  }
  
  function nextLower(current, steps) {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i] < current) return steps[i];
    }
    return 0;
  }
  
  function deviceGetLightStatus(config, action, buttonType) {
    let url =
      "http://" +
      config.deviceIpAddress +
      "/rpc/Light.GetStatus?id=" +
      config.channelId;
  
    Shelly.call("HTTP.GET", { url: url }, function (response, error) {
      if (error) {
        print("HTTP Error getting status: " + error);
        return;
      }
  
      let res = safeJsonParse(response.body);
      let currentBrightness = res && res.brightness ? res.brightness : 0;
      let isOn = res && res.output;
  
      handleBrightnessAdjustment(config, currentBrightness, isOn, action, buttonType);
    });
  }
  
  function handleBrightnessAdjustment(config, currentBrightness, isOn, action, buttonType) {
    let steps = brightnessStepsMapping[action] || brightnessStepsMapping[1];
  
    if (buttonType === "up") {
      if (isOn) {
        let newBrightness = action === "long_press" ? 100 : nextHigher(currentBrightness, steps);
        deviceSetBrightness(config, newBrightness);
      } else {
        // deviceSetBrightness(config, steps[0]);
        deviceTurnOn(config);
      }
    } else if (buttonType === "down") {
      if (isOn) {
        if (action === "long_press") {
          deviceTurnOff(config);
        } else {
          let newBrightness = nextLower(currentBrightness, steps);
          if (newBrightness <= 0) deviceTurnOff(config);
          else deviceSetBrightness(config, newBrightness);
        }
      } else {
        if(currentBrightness < defaultMinimumBrightness){
           deviceSetBrightness(config, defaultMinimumBrightness); 
        } else deviceTurnOn(config);
      }
    }
  }
  
  function deviceSetBrightness(config, value) {
    let url =
      "http://" +
      config.deviceIpAddress +
      "/rpc/Light.Set?on=" +
      (value !== 0).toString() +
      "&brightness=" +
      value +
      "&id=" +
      config.channelId;
  
    Shelly.call("HTTP.GET", { url: url }, null);
  }
  
  function deviceTurnOn(config) {
    let url = "http://" + config.deviceIpAddress + "/rpc/Light.Set?on=true&id=" + config.channelId;
    Shelly.call("HTTP.GET", { url: url }, null);
  }
  
  function deviceTurnOff(config) {
    let url = "http://" + config.deviceIpAddress + "/rpc/Light.Set?on=false&id=" + config.channelId;
    Shelly.call("HTTP.GET", { url: url }, null);
  }
  
  function parseButtonState(data) {
    if (!data.button || data.button.length !== 4) return null;
  
    let buttonMap = ["btn_up_left", "btn_down_left", "btn_up_right", "btn_down_right"];
    let stateMap = { 1: 1, 2: 2, 3: 3, 4: "long_press" };
  
    for (let i = 0; i < 4; i++) {
      let state = data.button[i];
      if (state === 254) return null;
      if (stateMap[state]) return { button: buttonMap[i], action: stateMap[state] };
    }
  
    return null;
  }
  
  Shelly.addEventHandler(function (event) {
    if (event.component !== "script:1") return;
  
    let eventData = safeJsonParse(event.info.data);
    if (!eventData) return;
  
    let result = parseButtonState(eventData);
    if (!result) return;
  
    let config = buttonConfigurations[result.button];
    if (!config) return;
  
    let buttonType = result.button.indexOf("up") !== -1 ? "up" : "down";
    deviceGetLightStatus(config, result.action, buttonType);
  });
  
  configureButton("btn_up_left", "LeftDevice", 0, "http", "192.168.0.12");
  configureButton("btn_down_left", "LeftDevice", 0, "http", "192.168.0.12");
  configureButton("btn_up_right", "RightDevice", 0, "http", "192.168.0.178");
  configureButton("btn_down_right", "RightDevice", 0, "http", "192.168.0.178");