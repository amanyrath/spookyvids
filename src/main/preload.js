const { contextBridge, ipcRenderer } = require('electron');
const { webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Open file dialog (returns array of file paths)
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  
  // Send file path from renderer to main process
  sendFilePath: (filePath) => ipcRenderer.invoke('file-dropped', filePath),
  
  // Get file path from File object (for drag-and-drop)
  getFilePath: (file) => {
    return webUtils.getPathForFile(file);
  },
  
  // Listen for validation response
  onFileValidated: (callback) => {
    ipcRenderer.on('file-validated', (event, data) => callback(event, data));
    return () => ipcRenderer.removeAllListeners('file-validated');
  },
  
  // Listen for validation errors
  onFileError: (callback) => {
    ipcRenderer.on('file-error', (event, error) => callback(event, error));
    return () => ipcRenderer.removeAllListeners('file-error');
  },
  
  // Export video with trim settings
  exportVideo: (data) => ipcRenderer.invoke('export-request', data),
  
  // Listen for export progress
  onExportProgress: (callback) => {
    ipcRenderer.on('export-progress', (event, data) => callback(event, data));
    return () => ipcRenderer.removeAllListeners('export-progress');
  },
  
  // Listen for export completion
  onExportComplete: (callback) => {
    ipcRenderer.on('export-complete', (event, data) => callback(event, data));
    return () => ipcRenderer.removeAllListeners('export-complete');
  },
  
  // Listen for export errors
  onExportError: (callback) => {
    ipcRenderer.on('export-error', (event, data) => callback(event, data));
    return () => ipcRenderer.removeAllListeners('export-error');
  },
  
  // Save project
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  
  // Load project
  loadProject: () => ipcRenderer.invoke('load-project')
});


