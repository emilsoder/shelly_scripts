let doorBlock = false;

// Helper function to compare two arrays for equality
function arraysEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function setLights(state) {
  Shelly.call("Light.SetAll", { brightness: 100, on: state });
}

Shelly.addEventHandler(function (event) {
  if(!event || !event.info || !event.info.data) return;
  
  let data = event.info.data;
  // Handle button events from the Shelly Blu Wall Switch 4
  if (data && data.button) {
    if (data.button[1] === 1 || data.button[3] === 1) {
      setLights(true);
    } else if (
      data.button[0] === 1 ||
      data.button[2] === 1
    ) {
      // Button DOWN pressed: turn lights OFF across all channels and block door-triggered activation for 2 minutes
      setLights(false);
      Timer.clear();
      doorBlock = true;
      // Clear the block after 2 minutes (120000 ms)
      Timer.set(120000, false, function () {
        doorBlock = false;
        Timer.clear()
      });
    }
  }

  // Handle door sensor events from the Shelly Blu Door/Window sensor
  // Assuming that data.window === 1 indicates the door is open
  if (data && data.window !== undefined && data.window === 1) {
    // Only trigger if no recent button down press is blocking it
    if (!doorBlock) {
      setLights(true);
    }
  }
});