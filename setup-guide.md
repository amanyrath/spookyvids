# ClipForge PR 1 Setup Guide

## Required Files to Create

### Configuration Files

#### 1. **package.json** scripts
After `npm install`, add these scripts to `package.json`:

```json
{
  "main": "dist/main.js",
  "scripts": {
    "start": "npm run build && electron .",
    "build": "tsc && webpack",
    "build:main": "tsc -p tsconfig.json",
    "build:renderer": "webpack",
    "package": "electron-builder"
  }
}
```

#### 2. **tsconfig.json** (for main process)
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src/main",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  },
  "include": ["src/main/**/*"]
}
```

#### 3. **tsconfig.renderer.json** (for renderer process)
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "esnext",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/renderer/**/*"]
}
```

#### 4. **webpack.config.js**
```javascript
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/renderer/index.tsx',
  target: 'electron-renderer',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html'
    })
  ]
};
```

Install webpack loaders:
```bash
npm install --save-dev webpack webpack-cli ts-loader style-loader css-loader html-webpack-plugin
```

#### 5. **tailwind.config.js**
```javascript
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,jsx,js}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

#### 6. **postcss.config.js**
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### Electron Main Process Files

#### 7. **src/main/main.ts**
```typescript
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

#### 8. **src/main/ipc-handlers.ts**
```typescript
import { ipcMain } from 'electron';

export function setupIpcHandlers() {
  // Define IPC channels here
  // Will be implemented in PR 2-5
  
  console.log('IPC handlers initialized');
}
```

#### 9. **src/main/preload.js**
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Will add methods as we implement IPC channels
});
```

### React Renderer Files

#### 10. **src/renderer/index.html**
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ClipForge</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>
```

#### 11. **src/renderer/index.tsx**
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

#### 12. **src/renderer/index.css**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### 13. **src/renderer/App.tsx**
```typescript
import React from 'react';
import ImportArea from './components/ImportArea';
import PreviewPlayer from './components/PreviewPlayer';
import Timeline from './components/Timeline';

function App() {
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Import Area */}
      <ImportArea />
      
      {/* Preview Player */}
      <PreviewPlayer />
      
      {/* Timeline */}
      <Timeline />
    </div>
  );
}

export default App;
```

#### 14. **src/renderer/components/ImportArea.tsx**
```typescript
import React from 'react';

function ImportArea() {
  return (
    <div className="flex-1 bg-gray-800 border-b border-gray-700 p-8 flex items-center justify-center">
      <div className="text-center">
        <p className="text-xl mb-4">Drag and drop a video file here</p>
        <p className="text-gray-400 text-sm">MP4 or MOV formats supported</p>
      </div>
    </div>
  );
}

export default ImportArea;
```

#### 15. **src/renderer/components/PreviewPlayer.tsx**
```typescript
import React from 'react';

function PreviewPlayer() {
  return (
    <div className="flex-1 bg-black flex items-center justify-center">
      <div className="text-gray-600">No video loaded</div>
    </div>
  );
}

export default PreviewPlayer;
```

#### 16. **src/renderer/components/Timeline.tsx**
```typescript
import React from 'react';

function Timeline() {
  return (
    <div className="h-48 bg-gray-800 border-t border-gray-700 p-4">
      <div className="h-full bg-gray-700 rounded">
        <p className="text-gray-400 text-sm p-4">Timeline will appear here</p>
      </div>
    </div>
  );
}

export default Timeline;
```

### Additional Files

#### 17. **.gitignore**
```
node_modules/
dist/
*.log
.DS_Store
```

## Installation Order

1. Run: `npm init -y`
2. Install all dependencies (Step 2 command above)
3. Create all the files listed above
4. Run: `npm start`

## Expected Result

After completing these steps:
- ✅ AC1: Application launches successfully
- ✅ AC2: No console errors/warnings  
- ✅ AC3: Layout panels are visually distinct (three gray panels visible)

## Next: PR 2

Once you've verified PR 1 works, we'll implement the drag-and-drop functionality and file handling.


