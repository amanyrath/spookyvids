import { ipcMain, dialog, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg';

// Set ffmpeg path - use bundled ffmpeg if available, otherwise use system ffmpeg
const possiblePaths = [
  // Bundled ffmpeg (in packaged app)
  path.join(process.resourcesPath || '', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
  // System ffmpeg locations
  ...(process.platform === 'darwin' ? [
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/bin/ffmpeg'
  ] : []),
  ...(process.platform === 'win32' ? [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'ffmpeg.exe'
  ] : [])
];

for (const ffmpegPath of possiblePaths) {
  if (fs.existsSync(ffmpegPath)) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log('Set ffmpeg path to:', ffmpegPath);
    break;
  }
}

let currentFilePath: string | null = null;
let mainWindow: any = null;

export function setMainWindow(window: any) {
  mainWindow = window;
}

export function setupIpcHandlers() {
  // Handle opening file dialog (allow multiple files)
  ipcMain.handle('open-file-dialog', async () => {
    try {
      console.log('Opening file dialog...');
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Videos', extensions: ['mp4', 'mov'] }
        ]
      });

      console.log('Dialog result:', { canceled: result.canceled, files: result.filePaths?.length || 0 });

      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        return result.filePaths;  // Return array of file paths
      }
      return [];
    } catch (error) {
      console.error('Error opening file dialog:', error);
      return [];
    }
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
  
  // Handle export request from renderer
  ipcMain.handle('export-request', async (event, { clips, outputPath }) => {
    // clips format: [{ filePath, inTime, outTime }]
    if (!clips || clips.length === 0) {
      return { success: false, error: 'No clips to export' };
    }

    try {
      console.log('Export request:', { clips: clips.length, outputPath });

      // If no output path provided, show save dialog
      let finalOutputPath = outputPath;
      if (!finalOutputPath) {
        const result = await dialog.showSaveDialog(mainWindow, {
          defaultPath: 'exported-video.mp4',
          filters: [
            { name: 'Videos', extensions: ['mp4'] }
          ]
        });

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true };
        }

        finalOutputPath = result.filePath;
      }

      // Ensure .mp4 extension
      if (!finalOutputPath.endsWith('.mp4')) {
        finalOutputPath += '.mp4';
      }

      console.log('Starting export to:', finalOutputPath);

      // Calculate total duration for progress tracking
      const totalDuration = clips.reduce((sum: number, clip: any) => sum + (clip.outTime - clip.inTime), 0);
      console.log('Total duration:', totalDuration);

      // Execute ffmpeg export
      await new Promise<void>((resolve, reject) => {
        // Create concat filter for multiple clips
        let command: FfmpegCommand;
        
        if (clips.length === 1) {
          // Single clip - simple trim
          command = ffmpeg(clips[0].filePath)
            .seek(clips[0].inTime)
            .duration(clips[0].outTime - clips[0].inTime)
            .videoCodec('libx264')
            .outputOptions('-crf 23')
            .outputOptions('-preset medium')
            .audioCodec('aac')
            .audioBitrate('192k')
            .output(finalOutputPath);
        } else {
          // Multiple clips - trim each and concatenate using complex filter
          command = ffmpeg();
          
          // Add all clips as inputs
          clips.forEach((clip: any) => {
            command = command.input(clip.filePath);
          });
          
          // Build complex filter: trim each input, then concatenate
          const filterComplex: string[] = [];
          
          // Add trim filters for each input
          clips.forEach((clip: any, index: number) => {
            const duration = clip.outTime - clip.inTime;
            filterComplex.push(
              `[${index}:v]trim=start=${clip.inTime}:duration=${duration},setpts=PTS-STARTPTS[v${index}]`
            );
            filterComplex.push(
              `[${index}:a]atrim=start=${clip.inTime}:duration=${duration},asetpts=PTS-STARTPTS[a${index}]`
            );
          });
          
          // Build concat input string
          const concatInputs: string[] = [];
          clips.forEach((clip: any, index: number) => {
            concatInputs.push(`[v${index}][a${index}]`);
          });
          
          // Add concat filter
          filterComplex.push(
            `${concatInputs.join('')}concat=n=${clips.length}:v=1:a=1[outv][outa]`
          );
          
          console.log('Complex filters:', filterComplex);
          
          command = command
            .complexFilter(filterComplex)
            .outputOptions(['-map', '[outv]', '-map', '[outa]'])
            .videoCodec('libx264')
            .outputOptions('-crf 23')
            .outputOptions('-preset fast')
            .audioCodec('aac')
            .audioBitrate('192k')
            .output(finalOutputPath);
        }

        command
          .on('start', (commandLine) => {
            console.log('FFmpeg command:', commandLine);
          })
          .on('progress', (progress) => {
            let percent = progress.percent || 0;
            // Cap progress at 100% (complex filters can report over 100%)
            percent = Math.min(100, Math.max(0, percent));
            console.log('Export progress:', percent.toFixed(1) + '%');
            // Send progress to renderer
            if (mainWindow) {
              mainWindow.webContents.send('export-progress', { percent });
            }
          })
          .on('end', () => {
            console.log('Export completed successfully');
            // Send success to renderer
            if (mainWindow) {
              mainWindow.webContents.send('export-complete', { 
                outputPath: finalOutputPath 
              });
            }
            resolve();
          })
          .on('error', (err) => {
            console.error('Export error:', err);
            // Send error to renderer
            if (mainWindow) {
              mainWindow.webContents.send('export-error', { 
                message: err.message 
              });
            }
            reject(err);
          });

        command.run();
      });

      return { 
        success: true, 
        outputPath: finalOutputPath,
        duration: totalDuration
      };
    } catch (error: any) {
      console.error('Export failed:', error);
      return { 
        success: false, 
        error: error.message || 'Export failed' 
      };
    }
  });
  
  // Handle save project request
  ipcMain.handle('save-project', async (event, { clips, libraryClips }) => {
    try {
      console.log('Save project request:', { timelineClips: clips?.length, libraryClips: libraryClips?.length });
      
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: 'project.json',
        filters: [
          { name: 'Project Files', extensions: ['json'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      const projectData = {
        version: '1.0',
        timelineClips: clips || [],
        libraryClips: libraryClips || []
      };

      fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2), 'utf-8');
      
      console.log('Project saved successfully to:', result.filePath);
      return { success: true, filePath: result.filePath };
    } catch (error: any) {
      console.error('Error saving project:', error);
      return { success: false, error: error.message || 'Failed to save project' };
    }
  });
  
  // Handle load project request
  ipcMain.handle('load-project', async () => {
    try {
      console.log('Load project request');
      
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Project Files', extensions: ['json'] }
        ]
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const projectData = JSON.parse(fileContent);
      
      console.log('Project loaded successfully from:', filePath);
      console.log('Project data:', { 
        timelineClips: projectData.timelineClips?.length,
        libraryClips: projectData.libraryClips?.length
      });
      
      return { success: true, data: projectData, filePath };
    } catch (error: any) {
      console.error('Error loading project:', error);
      return { success: false, error: error.message || 'Failed to load project' };
    }
  });
  
  console.log('IPC handlers initialized');
}

