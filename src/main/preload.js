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
  loadProject: () => ipcRenderer.invoke('load-project'),
  
  // Screen recording
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  createRecordingPreview: () => ipcRenderer.invoke('create-recording-preview'),
  closeRecordingPreview: () => ipcRenderer.invoke('close-recording-preview'),
  saveRecordingBlob: (arrayBuffer) => ipcRenderer.invoke('save-recording-blob', { arrayBuffer }),
  convertRecording: (webmPath) => ipcRenderer.invoke('convert-recording', { webmPath }),
  
  // Webcam overlay window
  createWebcamOverlay: (config) => ipcRenderer.invoke('create-webcam-overlay', config),
  updateWebcamOverlayPosition: (x, y) => ipcRenderer.invoke('update-webcam-overlay-position', { x, y }),
  closeWebcamOverlay: () => ipcRenderer.invoke('close-webcam-overlay'),
  
  // Transcription
  transcribeVideo: (filePath) => ipcRenderer.invoke('transcribe-video', { filePath }),
  
  // Import overlay image
  importOverlayImage: () => ipcRenderer.invoke('import-overlay-image'),
  
  // AI Agent
  aiAgent: {
    sendMessage: (message, timelineClips) => ipcRenderer.invoke('ai-agent:send-message', { message, timelineClips }),
    getHistory: () => ipcRenderer.invoke('ai-agent:get-history'),
    clearHistory: () => ipcRenderer.invoke('ai-agent:clear-history'),
    getCacheStats: () => ipcRenderer.invoke('ai-agent:get-cache-stats'),
    clearCache: () => ipcRenderer.invoke('ai-agent:clear-cache'),
  },
  
  // Listen for AI agent responses
  onAgentResponse: (callback) => {
    ipcRenderer.on('ai-agent:response', (event, data) => callback(event, data));
    return () => ipcRenderer.removeAllListeners('ai-agent:response');
  }
});


