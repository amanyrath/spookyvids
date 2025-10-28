import { ipcMain, dialog, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

let currentFilePath: string | null = null;
let mainWindow: any = null;

export function setMainWindow(window: any) {
  mainWindow = window;
}

export function setupIpcHandlers() {
  // Handle opening file dialog (allow multiple files)
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Videos', extensions: ['mp4', 'mov'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths;  // Return array of file paths
    }
    return [];
  });

  // Handle file dropped from renderer
  ipcMain.handle('file-dropped', async (event, filePath) => {
    try {
      console.log('File dropped:', filePath);
      
      // Validate file extension
      const ext = path.extname(filePath).toLowerCase();
      const validExtensions = ['.mp4', '.mov'];
      
      if (!validExtensions.includes(ext)) {
        console.log('Invalid file extension:', ext);
        // Send error to renderer
        if (mainWindow) {
          mainWindow.webContents.send('file-error', {
            message: 'Invalid file type. Please use MP4 or MOV files.'
          });
        }
        return { valid: false, reason: 'Invalid file extension' };
      }
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log('File does not exist:', filePath);
        if (mainWindow) {
          mainWindow.webContents.send('file-error', {
            message: 'File not found.'
          });
        }
        return { valid: false, reason: 'File not found' };
      }
      
      // Store file path
      currentFilePath = filePath;
      console.log('Valid file accepted:', filePath);
      
      // Extract metadata using ffprobe
      try {
        const metadata = await new Promise<any>((resolve, reject) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata);
          });
        });
        
        // Extract duration and video dimensions
        const duration = metadata.format.duration || 0;
        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
        const width = videoStream?.width || 0;
        const height = videoStream?.height || 0;
        const codec = videoStream?.codec_name || 'unknown';
        
        console.log('Video metadata:', { duration, width, height, codec });
        
        // Generate thumbnail (extract frame at 1 second)
        let thumbnailBase64: string | null = null;
        try {
          const thumbnailPath = path.join(app.getPath('temp'), `thumb_${Date.now()}.jpg`);
          
          await new Promise<void>((resolve, reject) => {
            ffmpeg(filePath)
              .screenshots({
                timestamps: [1],
                filename: path.basename(thumbnailPath),
                folder: path.dirname(thumbnailPath),
                size: '300x300'
              })
              .on('end', () => {
                // Read the generated thumbnail
                const fs = require('fs');
                const imageBuffer = fs.readFileSync(thumbnailPath);
                thumbnailBase64 = imageBuffer.toString('base64');
                
                // Clean up temp file
                fs.unlinkSync(thumbnailPath);
                
                console.log('Thumbnail generated successfully');
                resolve();
              })
              .on('error', (err: any) => {
                console.error('Error generating thumbnail:', err);
                reject(err);
              });
          });
        } catch (thumbError) {
          console.error('Thumbnail generation failed:', thumbError);
          // Continue without thumbnail
        }
        
        // Send success response with metadata to renderer
        if (mainWindow) {
          mainWindow.webContents.send('file-validated', {
            filePath: filePath,
            duration: duration,
            width: width,
            height: height,
            codec: codec,
            thumbnail: thumbnailBase64 ? `data:image/jpeg;base64,${thumbnailBase64}` : null
          });
        }
        
        return { 
          valid: true, 
          filePath: filePath,
          duration: duration,
          width: width,
          height: height
        };
      } catch (metadataError) {
        console.error('Error extracting metadata:', metadataError);
        // Still return success even if metadata fails
        if (mainWindow) {
          mainWindow.webContents.send('file-validated', {
            filePath: filePath
          });
        }
        return { valid: true, filePath: filePath };
      }
    } catch (error) {
      console.error('Error handling file:', error);
      if (mainWindow) {
        mainWindow.webContents.send('file-error', {
          message: 'An error occurred while processing the file.'
        });
      }
      return { valid: false, reason: 'Error processing file' };
    }
  });
  
  console.log('IPC handlers initialized');
}

