const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const platform = process.platform;

// Find ffmpeg on the system
let ffmpegPath = null;

if (platform === 'darwin') {
  // Try common macOS locations
  const possiblePaths = [
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/bin/ffmpeg'
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      ffmpegPath = p;
      break;
    }
  }
} else if (platform === 'win32') {
  try {
    // Try to find ffmpeg in PATH
    const output = execSync('where ffmpeg', { encoding: 'utf-8' });
    ffmpegPath = output.split('\n')[0].trim();
  } catch (e) {
    // FFmpeg not in PATH, try common locations
    const possiblePaths = [
      'C:\\ffmpeg\\bin\\ffmpeg.exe'
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        ffmpegPath = p;
        break;
      }
    }
  }
}

if (!ffmpegPath) {
  console.error('FFmpeg not found. Please install ffmpeg.');
  process.exit(1);
}

console.log('FFmpeg found at:', ffmpegPath);

// Create resources directory in build folder
const resourcesDir = path.join(__dirname, '..', 'build', 'ffmpeg');
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Copy ffmpeg to build folder
const destPath = path.join(resourcesDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

try {
  fs.copyFileSync(ffmpegPath, destPath);
  console.log('FFmpeg bundled successfully to:', destPath);
} catch (error) {
  console.error('Error copying ffmpeg:', error.message);
  process.exit(1);
}
