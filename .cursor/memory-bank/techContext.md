# Tech Context: ClipForge

## Technology Stack

### Core Technologies

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Desktop Framework** | Electron | ^39.0.0 | Desktop app runtime with Node.js |
| **Media Processing** | fluent-ffmpeg | ^2.1.3 | FFmpeg wrapper for video processing |
| **UI Framework** | React | ^19.2.0 | Frontend UI rendering |
| **Language** | TypeScript | ^5.9.3 | Type-safe JavaScript |
| **Styling** | Tailwind CSS | ^3.4.18 | Utility-first CSS framework |
| **Build Tool** | webpack | ^5.102.1 | Bundle renderer code |
| **Packager** | electron-builder | ^26.0.12 | Create native executables |
| **Video Playback** | HTML5 `<video>` | Native | Video preview in renderer |

### Required System Dependencies

- **FFmpeg** - Must be available in system PATH
  - Mac: Install via Homebrew (`brew install ffmpeg`)
  - Windows: Download from ffmpeg.org and add to PATH

### Package Dependencies (package.json)

```json
{
  "name": "clipforge",
  "version": "1.0.0",
  "main": "main.js",
  "dependencies": {
    "electron": "^latest",
    "fluent-ffmpeg": "^latest",
    "react": "^latest", // or vue/svelte
    "react-dom": "^latest"
  },
  "devDependencies": {
    "electron-builder": "^latest"
  },
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  }
}
```

## Development Setup

### Initial Setup Steps

1. **Install Node.js**
   - Ensure Node.js (v16+) is installed
   - npm or yarn package manager available

2. **Install FFmpeg**
   ```bash
   # Mac
   brew install ffmpeg
   
   # Windows
   # Download from https://ffmpeg.org/download.html
   # Add to system PATH
   ```

3. **Initialize Project**
   ```bash
   npm init -y
   npm install electron fluent-ffmpeg [ui-framework]
   npm install -D electron-builder
   ```

4. **Create Main Entry Point**
   - Create `main.js` for Electron main process
   - Create `index.html` and UI files for renderer

### Project Structure

```
spookyvids/
├── dist/                   # Compiled output
│   ├── main.js            # Compiled main process
│   ├── ipc-handlers.js     # IPC handlers
│   ├── preload.js          # Preload script
│   └── index.html          # Built HTML
├── src/
│   ├── main/
│   │   ├── main.ts         # Electron main process
│   │   ├── ipc-handlers.ts # IPC handler setup
│   │   └── preload.js      # Context bridge
│   └── renderer/
│       ├── App.tsx         # Main React component
│       ├── index.tsx        # React entry point
│       ├── index.html       # HTML template
│       ├── index.css        # Tailwind styles
│       └── components/
│           ├── ImportArea.tsx
│           ├── PreviewPlayer.tsx
│           └── Timeline.tsx
├── package.json
├── tsconfig.json           # Main process TS config
├── tsconfig.renderer.json  # Renderer TS config
├── webpack.config.js       # Webpack bundling
├── tailwind.config.js      # Tailwind config
└── postcss.config.js       # PostCSS config
```

## Technical Constraints

### File Format Support
- **Input:** MP4, MOV only
- **Output:** MP4 only
- **Codec:** H.264 (libx264) for output
- **Quality:** Fixed CRF 23 (good quality, fast encode)

### Platform Support
- **Mac:** macOS 10.13+ (High Sierra or later)
- **Windows:** Windows 10+

### Resource Constraints
- Single video file in memory at a time
- No background processing of multiple files
- No media library/cache storage

## Development Workflow

### Development Mode
```bash
npm start
```
Runs Electron in development mode with hot reload.

### Build for Production
```bash
npm run build
```
Creates native executable for current platform.

### Testing Workflow

1. **Develop:** Work on features in development mode
2. **Test Manually:** Import file, trim, export
3. **Build:** Create executable
4. **Test Executable:** Launch built app, verify all features
5. **Document:** Note any issues or improvements

### FFmpeg Command Pattern

```javascript
// Example export command structure
ffmpeg()
  .input(sourcePath)
  .seek(inTime)                    // Start at in point
  .duration(outTime - inTime)      // Export duration
  .videoCodec('libx264')
  .outputOptions('-crf 23')        // Quality setting
  .output(outputPath)
  .on('progress', (progress) => {
    // Report progress percentage
  })
  .on('end', () => {
    // Export complete
  })
  .run();
```

## IPC Implementation Details

### Main Process (main.js)

```javascript
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const ffmpeg = require('fluent-ffmpeg');

// Listen for file dropped
ipcMain.on('file-dropped', (event, filePath) => {
  // Validate file
  // Extract metadata
  // Send metadata back
});

// Listen for export request
ipcMain.on('export-request', (event, { inTime, outTime, sourcePath }) => {
  // Show save dialog
  // Construct FFmpeg command
  // Execute and report progress
});
```

### Renderer Process (renderer.js)

```javascript
const { ipcRenderer } = require('electron');

// Send file path
ipcRenderer.send('file-dropped', filePath);

// Listen for metadata
ipcRenderer.on('metadata-response', (event, { duration, width, height }) => {
  // Update state
});

// Listen for export progress
ipcRenderer.on('export-progress', (event, percentage) => {
  // Update progress indicator
});
```

## Browser APIs Used

### Renderer Process HTML5 APIs
- **Drag and Drop API:** `dragover`, `drop` events
- **File API:** File path handling from drag events
- **Media Element API:** `<video>` element currentTime control
- **Native Browser APIs:** No additional libraries needed

### Electron APIs Used
- **dialog module:** Show save file dialog
- **BrowserWindow:** Main window management
- **IPC modules:** ipcMain and ipcRenderer for communication
- **nativeImage:** Not used in MVP

## Build Configuration

### electron-builder Config

```json
{
  "build": {
    "appId": "com.clipforge.app",
    "productName": "ClipForge",
    "files": [
      "main.js",
      "index.html",
      "src/**/*"
    ],
    "mac": {
      "target": "dmg"
    },
    "win": {
      "target": "nsis"
    }
  }
}
```

## Deployment Considerations

- FFmpeg must be bundled or available in system PATH
- Consider using `@ffmpeg-installer/ffmpeg` for automatic bundling
- Native dependencies for video processing
- Large binary size due to Electron runtime + dependencies

