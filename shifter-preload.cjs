const { contextBridge, ipcRenderer } = require('electron');

const rideUrlArgument = '--oskiride-ride-url=';
const rideUrl = process.argv.find(argument => argument.startsWith(rideUrlArgument))?.slice(rideUrlArgument.length);

if (process.isMainFrame && rideUrl && window.location.href.split('#', 1)[0] === rideUrl) {
  contextBridge.exposeInMainWorld('oskiControllerPicker', {
    start: () => ipcRenderer.invoke('shifter:scan-start'),
    pick: id => typeof id === 'string' ? ipcRenderer.invoke('shifter:scan-pick', id) : Promise.resolve(false),
    stop: () => ipcRenderer.invoke('shifter:scan-stop'),
    subscribe(callback) {
      if (typeof callback !== 'function') throw new TypeError('Expected a device-list callback.');
      const receive = (_event, devices) => callback(devices);
      ipcRenderer.on('shifter:devices', receive);
      return () => ipcRenderer.removeListener('shifter:devices', receive);
    },
  });
}
