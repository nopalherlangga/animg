const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onReceiveImage: (callback) => {
        ipcRenderer.on('receive-image', (event, data) => callback(data));
    },
    requestImage: () => ipcRenderer.send('request-image'),
});