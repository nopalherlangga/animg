const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onReceiveImage: (callback) => {
        ipcRenderer.on('receive-image', (event, data) => callback(data));
    },
    requestImage: (id) => ipcRenderer.send('request-image', id),
    onReceiveFiles: (callback) => {
        ipcRenderer.on('receive-files', (event, data) => callback(data));
    },
    requestFiles: () => ipcRenderer.send('request-files'),
    rescaleImage: (id, scale) => ipcRenderer.send('rescale-image', id, scale),
    requestConfig: (id) => ipcRenderer.send('request-config', id),
    onReceiveConfig: (callback) => {
        ipcRenderer.on('receive-config', (event, data) => callback(data));
    },
    toggleActive: (id, isActive) => ipcRenderer.send('toggle-active', id, isActive),
    selectFile: () => ipcRenderer.send('select-file'),
    onStoreFileError: (callback) => ipcRenderer.on('store-file-error', (event, message) => callback(message)),
    onNewFileStored: (callback) => ipcRenderer.on('new-file-stored', (event, file) => callback(file)),
    deleteFile: (id) => ipcRenderer.send('delete-file', id),
    fileDeleted: (callback) => ipcRenderer.on('file-deleted', (event, id) => callback(id)),
});