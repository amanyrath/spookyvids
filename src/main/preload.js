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
  },
  
  // Listen for validation errors
  onFileError: (callback) => {
    ipcRenderer.on('file-error', (event, error) => callback(event, error));
  }
});


