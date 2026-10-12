'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wellnessStorage', {
  loadEntries: () => ipcRenderer.invoke('wellness:loadEntries'),
  saveEntries: entries => ipcRenderer.invoke('wellness:saveEntries', entries),
});
