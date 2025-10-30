import { ipcMain, dialog, app, desktopCapturer, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg';
import OpenAI from 'openai';
import { getAIAgent, TimelineClip } from './ai-agent';
import { getImageService } from './image-service';
import { getSettings } from './settings';

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
let previewWindow: BrowserWindow | null = null;
let webcamOverlayWindow: BrowserWindow | null = null;

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

  // Handle importing overlay image files
  ipcMain.handle('import-overlay-image', async () => {
    try {
      console.log('Opening overlay image dialog...');
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
          { name: 'PNG (Recommended)', extensions: ['png'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      console.log('Overlay image dialog result:', { canceled: result.canceled, files: result.filePaths?.length || 0 });

      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        
        // Validate file exists
        if (!fs.existsSync(filePath)) {
          return { success: false, error: 'File not found' };
        }

        // Validate it's an image file
        const ext = path.extname(filePath).toLowerCase();
        const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
        if (!validExtensions.includes(ext)) {
          return { success: false, error: 'Invalid image file type' };
        }

        console.log('Overlay image imported:', filePath);
        return { success: true, filePath };
      }
      return { success: false, canceled: true };
    } catch (error) {
      console.error('Error importing overlay image:', error);
      return { success: false, error: 'An error occurred while importing the image' };
    }
  });
  
  // Helper function to convert filter name to FFmpeg filter string
  const getFFmpegFilter = (filterName?: string): string => {
    if (!filterName) return '';
    
    switch (filterName) {
      case 'grayscale':
        return 'eq=saturation=0';
      case 'sepia':
        return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
      case 'vintage':
        return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=1.2';
      case 'xray':
        // X-ray: edge detection + inversion + contrast
        return 'edgedetect=low=0.1:high=0.4,eq=brightness=0.4:contrast=2.0';
      case 'blur':
        return 'boxblur=5:1';
      case 'bright':
        return 'eq=brightness=0.15';
      case 'dark':
        return 'eq=brightness=-0.15';
      case 'high-contrast':
        return 'eq=contrast=1.5';
      case 'flicker':
        // TV Static/Flicker effect: noise for static texture, brightness flicker, desaturation
        // Using geq for brightness flickering with time-based sine waves to create irregular pattern
        // The brightness flicker creates random-like variation using multiple sine wave frequencies
        // Format: noise (static) -> geq (brightness flicker) -> eq (desaturation)
        // Note: Scan lines would require additional overlay - keeping effect performant
        return 'noise=alls=25:allf=t+u,' + 
               'geq=lum="p(X,Y)*(0.5+0.5*sin(20*T)+0.3*sin(37*T)+0.2*sin(7*T))":cb="p(X,Y)":cr="p(X,Y)",' +
               'eq=saturation=0.7';
      default:
        return '';
    }
  };

  // Handle export request from renderer
  ipcMain.handle('export-request', async (event, { clips, outputPath, overlayVisible = true, track0Muted = false, track1Muted = false, resolution = '1080p' }) => {
    // clips format: [{ filePath, inTime, outTime, track, overlayPosition, overlaySize, overlayVisible, muted, videoFilter, overlayEffect }]
    if (!clips || clips.length === 0) {
      return { success: false, error: 'No clips to export' };
    }

    try {
      console.log('Export request:', { clips: clips.length, outputPath, track0Muted, track1Muted, resolution });
      
      // Get output dimensions based on resolution
      let outputWidth: number | null = null;
      let outputHeight: number | null = null;
      
      if (resolution === '720p') {
        outputWidth = 1280;
        outputHeight = 720;
      } else if (resolution === '1080p') {
        outputWidth = 1920;
        outputHeight = 1080;
      } else if (resolution === 'original') {
        // Probe first video file to get original dimensions
        try {
          const firstClipPath = clips[0].filePath;
          const metadata = await new Promise<any>((resolve, reject) => {
            ffmpeg.ffprobe(firstClipPath, (err, metadata) => {
              if (err) reject(err);
              else resolve(metadata);
            });
          });
          const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
          outputWidth = videoStream?.width || null;
          outputHeight = videoStream?.height || null;
          console.log('Original video dimensions:', outputWidth, 'x', outputHeight);
        } catch (error: any) {
          console.error('Error probing video dimensions:', error);
          // Fall back to 1080p if we can't probe
          outputWidth = 1920;
          outputHeight = 1080;
        }
      }
      
      // Helper function to add scale filter before final output
      const addScaleFilter = (filterComplex: string[], finalOutputStream: string, newOutputStream: string) => {
        if (outputWidth && outputHeight) {
          // Replace the final output stream with a scaled version
          // Find and replace the final stream reference
          for (let i = filterComplex.length - 1; i >= 0; i--) {
            if (filterComplex[i].includes(finalOutputStream)) {
              // Replace references to the final output stream
              filterComplex[i] = filterComplex[i].replace(new RegExp(finalOutputStream.replace(/[\[\]]/g, '\\$&'), 'g'), newOutputStream);
              break;
            }
          }
          // Add scale filter
          filterComplex.push(`${newOutputStream}scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2${finalOutputStream}`);
        }
      };
      
      // Separate clips by track
      const track0Clips = clips.filter((c: any) => (c.track ?? 0) === 0);
      const track1Clips = clips.filter((c: any) => (c.track ?? 0) === 1);
      
      console.log('Track 0 clips:', track0Clips.length, 'Track 1 clips:', track1Clips.length);

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

      // Validate all input files exist and timing values are valid before starting
      for (const clip of clips) {
        if (!fs.existsSync(clip.filePath)) {
          return { 
            success: false, 
            error: `Video file not found: ${clip.filePath}` 
          };
        }
        
        // Validate timing values
        const inTime = Number(clip.inTime);
        const outTime = Number(clip.outTime);
        const duration = outTime - inTime;
        
        if (isNaN(inTime) || isNaN(outTime) || isNaN(duration)) {
          return {
            success: false,
            error: `Invalid timing values for clip: inTime=${clip.inTime}, outTime=${clip.outTime}`
          };
        }
        
        if (inTime < 0 || outTime < 0 || duration <= 0) {
          return {
            success: false,
            error: `Invalid timing values for clip: inTime must be >= 0, outTime must be > inTime`
          };
        }
      }

      // Execute ffmpeg export
      await new Promise<void>((resolve, reject) => {
        let command: FfmpegCommand;
        let stderrOutput = '';
        
        // Case 1: Only Track 0 clips (no overlay)
        if (track1Clips.length === 0 || !overlayVisible) {
          console.log('Exporting Track 0 only (no overlay)');
          
          if (track0Clips.length === 1) {
            // Single clip - trim, apply filters, and overlay effects
            const clip = track0Clips[0];
            const isMuted = clip.muted || track0Muted;
            const videoFilter = getFFmpegFilter(clip.videoFilter);
            const hasOverlayEffects = clip.overlayEffects && clip.overlayEffects.length > 0 && clip.overlayEffects.every((o: any) => fs.existsSync(o.filePath));
            
            command = ffmpeg(clip.filePath);
            
            // Add overlay images as inputs if present
            if (hasOverlayEffects) {
              clip.overlayEffects.forEach((overlay: any) => {
                command = command.input(overlay.filePath);
              });
            }
            
            const filterComplex: string[] = [];
            
            // Trim and apply video filter
            const duration = clip.outTime - clip.inTime;
            let videoFilterChain = `[0:v]trim=start=${clip.inTime}:duration=${duration},setpts=PTS-STARTPTS`;
            if (videoFilter) {
              videoFilterChain += `,${videoFilter}`;
            }
            videoFilterChain += '[mainv]';
            filterComplex.push(videoFilterChain);
            
            // Handle audio
            if (isMuted) {
              filterComplex.push(`[0:a]atrim=start=${clip.inTime}:duration=${duration},asetpts=PTS-STARTPTS,volume=0[maina]`);
            } else {
              filterComplex.push(`[0:a]atrim=start=${clip.inTime}:duration=${duration},asetpts=PTS-STARTPTS[maina]`);
            }
            
            // Apply overlay effects if present (layer multiple overlays)
            if (hasOverlayEffects) {
              let currentVideoStream = '[mainv]';
              
              clip.overlayEffects.forEach((overlay: any, overlayIndex: number) => {
                const inputIndex = overlayIndex + 1; // Overlay inputs start at index 1
                
                // Validate and clamp overlay position and size
                let posX = overlay.position?.x || 0;
                let posY = overlay.position?.y || 0;
                let sizeWidth = overlay.size?.width || 25;
                let sizeHeight = overlay.size?.height || 25;
                let opacity = overlay.opacity ?? 1.0;
                
                posX = Math.max(0, Math.min(100, posX || 0));
                posY = Math.max(0, Math.min(100, posY || 0));
                sizeWidth = Math.max(1, Math.min(100, sizeWidth || 25));
                sizeHeight = Math.max(1, Math.min(100, sizeHeight || 25));
                opacity = Math.max(0, Math.min(1, opacity ?? 1.0));
                
                // Ensure no NaN values
                if (isNaN(posX) || isNaN(posY) || isNaN(sizeWidth) || isNaN(sizeHeight) || isNaN(opacity)) {
                  console.error('Invalid overlay effect values:', overlay);
                  return; // Skip this overlay
                }
                
                const xPos = `(main_w*${posX / 100})`;
                const yPos = `(main_h*${posY / 100})`;
                const overlayWidth = `iw*${sizeWidth / 100}`;
                const overlayHeight = `ih*${sizeHeight / 100}`;
                
                const outputStream = overlayIndex === clip.overlayEffects.length - 1 ? '[outv]' : `[v_tmp${overlayIndex}]`;
                
                filterComplex.push(`[${inputIndex}:v]scale=${overlayWidth}:${overlayHeight},format=rgba,colorchannelmixer=aa=${opacity}[overlayimg${overlayIndex}]`);
                filterComplex.push(`${currentVideoStream}[overlayimg${overlayIndex}]overlay=${xPos}:${yPos}${outputStream}`);
                
                currentVideoStream = outputStream;
              });
            } else {
              filterComplex.push(`[mainv]copy[outv]`);
            }
            
            // Add scale filter if resolution is specified
            if (outputWidth && outputHeight) {
              // Replace [outv] with a scaled version
              const lastFilterIndex = filterComplex.length - 1;
              const lastFilter = filterComplex[lastFilterIndex];
              filterComplex[lastFilterIndex] = lastFilter.replace('[outv]', '[outv_temp]');
              filterComplex.push(`[outv_temp]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2[outv]`);
            }
            
            command = command
              .complexFilter(filterComplex)
              .outputOptions(['-map', '[outv]', '-map', '[maina]'])
              .videoCodec('libx264')
              .outputOptions('-crf 23')
              .outputOptions('-preset medium')
              .audioCodec('aac')
              .audioBitrate('192k')
              .output(finalOutputPath);
          } else {
            // Multiple Track 0 clips - concatenate
            command = ffmpeg();
            
            track0Clips.forEach((clip: any) => {
              command = command.input(clip.filePath);
            });
            
            const filterComplex: string[] = [];
            
            track0Clips.forEach((clip: any, index: number) => {
              const duration = clip.outTime - clip.inTime;
              const isMuted = clip.muted || track0Muted;
              const videoFilter = getFFmpegFilter(clip.videoFilter);
              
              // Trim and apply video filter
              let videoFilterChain = `[${index}:v]trim=start=${clip.inTime}:duration=${duration},setpts=PTS-STARTPTS`;
              if (videoFilter) {
                videoFilterChain += `,${videoFilter}`;
              }
              videoFilterChain += `[v${index}]`;
              filterComplex.push(videoFilterChain);
              
              // Handle audio
              if (isMuted) {
                filterComplex.push(
                  `[${index}:a]atrim=start=${clip.inTime}:duration=${duration},asetpts=PTS-STARTPTS,volume=0[a${index}]`
                );
              } else {
                filterComplex.push(
                  `[${index}:a]atrim=start=${clip.inTime}:duration=${duration},asetpts=PTS-STARTPTS[a${index}]`
                );
              }
            });
            
            const concatInputs: string[] = [];
            track0Clips.forEach((clip: any, index: number) => {
              concatInputs.push(`[v${index}][a${index}]`);
            });
            
            filterComplex.push(
              `${concatInputs.join('')}concat=n=${track0Clips.length}:v=1:a=1[outv_temp][outa]`
            );
            
            // Add scale filter if resolution is specified
            if (outputWidth && outputHeight) {
              filterComplex.push(`[outv_temp]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2[outv]`);
            } else {
              filterComplex.push(`[outv_temp]copy[outv]`);
            }
            
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
        }
        // Case 2: Both Track 0 and Track 1 clips (overlay compositing)
        else {
          console.log('Exporting with overlay compositing');
          command = ffmpeg();
          
          // Add all Track 0 clips as inputs
          track0Clips.forEach((clip: any) => {
            command = command.input(clip.filePath);
          });
          
          // Add all Track 1 clips as inputs (offset by Track 0 count)
          track1Clips.forEach((clip: any) => {
            command = command.input(clip.filePath);
          });
          
          const filterComplex: string[] = [];
          const track0Count = track0Clips.length;
          
          // Process Track 0 clips
          track0Clips.forEach((clip: any, index: number) => {
            const duration = clip.outTime - clip.inTime;
            const isMuted = clip.muted || track0Muted;
            const videoFilter = getFFmpegFilter(clip.videoFilter);
            
            // Trim and apply video filter
            let videoFilterChain = `[${index}:v]trim=start=${clip.inTime}:duration=${duration},setpts=PTS-STARTPTS`;
            if (videoFilter) {
              videoFilterChain += `,${videoFilter}`;
            }
            videoFilterChain += `[v0_${index}]`;
            filterComplex.push(videoFilterChain);
            // Add volume=0 filter if clip or track is muted
            if (isMuted) {
              filterComplex.push(
                `[${index}:a]atrim=start=${clip.inTime}:duration=${duration},asetpts=PTS-STARTPTS,volume=0[a0_${index}]`
              );
            } else {
              filterComplex.push(
                `[${index}:a]atrim=start=${clip.inTime}:duration=${duration},asetpts=PTS-STARTPTS[a0_${index}]`
              );
            }
          });
          
          // Concat Track 0 clips if multiple
          if (track0Clips.length === 1) {
            filterComplex.push(`[v0_0]copy[mainv]`);
            filterComplex.push(`[a0_0]copy[maina]`);
          } else {
            const concat0Inputs = track0Clips.map((_: any, i: number) => `[v0_${i}][a0_${i}]`).join('');
            filterComplex.push(
              `${concat0Inputs}concat=n=${track0Clips.length}:v=1:a=1[mainv][maina]`
            );
          }
          
          // Process Track 1 clips (overlay)
          track1Clips.forEach((clip: any, index: number) => {
            const duration = clip.outTime - clip.inTime;
            const inputIndex = track0Count + index;
            const videoFilter = getFFmpegFilter(clip.videoFilter);
            
            // Trim and apply video filter
            let videoFilterChain = `[${inputIndex}:v]trim=start=${clip.inTime}:duration=${duration},setpts=PTS-STARTPTS`;
            if (videoFilter) {
              videoFilterChain += `,${videoFilter}`;
            }
            videoFilterChain += `[v1_${index}]`;
            filterComplex.push(videoFilterChain);
          });
          
          // Concat Track 1 clips if multiple
          let overlayStream = '[v1_0]';
          if (track1Clips.length > 1) {
            const concat1Inputs = track1Clips.map((_: any, i: number) => `[v1_${i}]`).join('');
            filterComplex.push(
              `${concat1Inputs}concat=n=${track1Clips.length}:v=1:a=0[overlayv]`
            );
            overlayStream = '[overlayv]';
          }
          
          // Scale overlay to desired size (default 25%)
          const firstOverlayClip = track1Clips[0];
          let overlayWidth = firstOverlayClip.overlaySize?.width || 25;
          let overlayHeight = firstOverlayClip.overlaySize?.height || 25;
          let overlayX = firstOverlayClip.overlayPosition?.x || 75;
          let overlayY = firstOverlayClip.overlayPosition?.y || 75;
          
          // Validate and clamp values to prevent invalid filter arguments
          overlayWidth = Math.max(1, Math.min(100, overlayWidth || 25));
          overlayHeight = Math.max(1, Math.min(100, overlayHeight || 25));
          overlayX = Math.max(0, Math.min(100, overlayX || 75));
          overlayY = Math.max(0, Math.min(100, overlayY || 75));
          
          // Ensure no NaN values
          if (isNaN(overlayWidth) || isNaN(overlayHeight) || isNaN(overlayX) || isNaN(overlayY)) {
            reject(new Error('Invalid overlay position or size values'));
            return;
          }
          
          // Calculate position (percentage to pixels will be done in FFmpeg)
          // Position: x% from left, y% from top
          // For bottom-right: x=75%, y=75% means the overlay starts at 75% from top/left
          const xPos = `(main_w*${overlayX / 100})`;
          const yPos = `(main_h*${overlayY / 100})`;
          
          filterComplex.push(
            `${overlayStream}scale=iw*${overlayWidth / 100}:ih*${overlayHeight / 100}[scaledoverlay]`
          );
          
          // Composite overlay onto main video
          filterComplex.push(
            `[mainv][scaledoverlay]overlay=${xPos}:${yPos}[outv_temp]`
          );
          
          // Add scale filter if resolution is specified
          if (outputWidth && outputHeight) {
            filterComplex.push(`[outv_temp]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2[outv]`);
          } else {
            filterComplex.push(`[outv_temp]copy[outv]`);
          }
          
          console.log('Overlay filter complex:', filterComplex);
          
          command = command
            .complexFilter(filterComplex)
            .outputOptions(['-map', '[outv]', '-map', '[maina]'])
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
          .on('error', (err, stdout, stderr) => {
            console.error('Export error:', err);
            console.error('FFmpeg stderr:', stderr);
            console.error('FFmpeg stdout:', stdout);
            
            // Build more detailed error message
            let errorMessage = err.message || 'Unknown export error';
            
            // Extract more details from stderr if available
            if (stderr) {
              // Look for common error patterns in stderr
              const stderrStr = stderr.toString();
              const errorMatch = stderrStr.match(/Error\s*:\s*(.+)/i) || 
                                stderrStr.match(/(Invalid\s+argument[^\n]*)/i) ||
                                stderrStr.match(/(No such file[^\n]*)/i);
              
              if (errorMatch) {
                errorMessage = `FFmpeg error: ${errorMatch[1]}`;
              } else if (stderrStr.length > 0) {
                // Get last few lines of stderr for context
                const lines = stderrStr.split('\n').filter(l => l.trim());
                const lastError = lines.slice(-3).join('; ');
                if (lastError) {
                  errorMessage = `FFmpeg error: ${lastError}`;
                }
              }
            }
            
            // Send error to renderer
            if (mainWindow) {
              mainWindow.webContents.send('export-error', { 
                message: errorMessage
              });
            }
            reject(new Error(errorMessage));
          });
          
          // Capture stderr for better error reporting
          command.on('stderr', (stderrLine) => {
            stderrOutput += stderrLine + '\n';
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
  
  // Handle get screen sources
  ipcMain.handle('get-screen-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 300, height: 200 }
      });
      console.log('Screen sources:', sources.length);
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    } catch (error) {
      console.error('Error getting screen sources:', error);
      return [];
    }
  });

  // Handle create recording preview window
  ipcMain.handle('create-recording-preview', async () => {
    try {
      // Create floating preview window
      if (previewWindow) {
        previewWindow.close();
      }

      previewWindow = new BrowserWindow({
        width: 320,
        height: 240,
        frame: false,
        alwaysOnTop: true,
        transparent: false,
        backgroundColor: '#000000',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Load preview HTML
      const previewHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              background: #000;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            #status {
              color: #fff;
              text-align: center;
            }
            .recording-indicator {
              width: 12px;
              height: 12px;
              background: #ff0000;
              border-radius: 50%;
              display: inline-block;
              animation: blink 1s infinite;
              margin-bottom: 8px;
            }
            @keyframes blink {
              0%, 50% { opacity: 1; }
              51%, 100% { opacity: 0.3; }
            }
            .time {
              font-size: 14px;
              margin-top: 4px;
            }
          </style>
        </head>
        <body>
          <div id="status">
            <div class="recording-indicator"></div>
            <div>Recording</div>
          </div>
        </body>
        </html>
      `;

      previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewHTML)}`);

      // Position preview in top-right corner
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      previewWindow.setPosition(width - 340, 20);

      return { success: true };
    } catch (error: any) {
      console.error('Error creating preview window:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle close recording preview window
  ipcMain.handle('close-recording-preview', async () => {
    try {
      if (previewWindow) {
        previewWindow.close();
        previewWindow = null;
      }
      return { success: true };
    } catch (error: any) {
      console.error('Error closing preview window:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle create webcam overlay window
  ipcMain.handle('create-webcam-overlay', async (event, { x, y, width, height, deviceId }) => {
    try {
      // Close existing overlay if any
      if (webcamOverlayWindow) {
        webcamOverlayWindow.close();
      }

      webcamOverlayWindow = new BrowserWindow({
        width: width,
        height: height,
        x: x,
        y: y,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        hasShadow: true,
        resizable: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          webSecurity: false // Allow getUserMedia in data URL
        }
      });

      // Set up permission handler for the overlay window
      webcamOverlayWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
          callback(true);
        } else {
          callback(false);
        }
      });
      
      // Also set permission check handler
      webcamOverlayWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (permission === 'media') {
          return true;
        }
        return false;
      });

      // Write HTML to a temporary file so getUserMedia works properly
      const overlayHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: transparent;
      -webkit-app-region: drag;
      cursor: move;
    }
    #container {
      width: 100%;
      height: 100%;
      border: 2px solid white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    #webcam {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    #error {
      display: none;
      color: white;
      text-align: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.8);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body>
  <div id="container">
    <video id="webcam" autoplay muted playsinline></video>
    <div id="error" style="display: none;">Unable to access webcam</div>
  </div>
  <script>
    const deviceId = '${deviceId}';
    const videoElement = document.getElementById('webcam');
    const errorElement = document.getElementById('error');
    
    // Use a small delay to ensure DOM is ready
    setTimeout(async () => {
      try {
        console.log('Attempting to access webcam...');
        console.log('navigator.mediaDevices:', navigator.mediaDevices);
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia API is not available');
        }
        
        let stream = null;
        
        if (deviceId && deviceId !== 'null' && deviceId !== 'undefined' && deviceId !== '') {
          try {
            console.log('Trying with exact device ID:', deviceId);
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              },
              audio: false
            });
            console.log('Success with exact device ID');
          } catch (exactError) {
            console.warn('Failed with exact device ID:', exactError);
            try {
              console.log('Trying with ideal device ID');
              stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  deviceId: { ideal: deviceId },
                  width: { ideal: 1280 },
                  height: { ideal: 720 }
                },
                audio: false
              });
              console.log('Success with ideal device ID');
            } catch (idealError) {
              console.warn('Failed with ideal device ID:', idealError);
            }
          }
        }
        
        if (!stream) {
          console.log('Trying with default camera');
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            },
            audio: false
          });
          console.log('Success with default camera');
        }
        
        videoElement.srcObject = stream;
        videoElement.style.display = 'block';
        errorElement.style.display = 'none';
        console.log('Webcam stream started successfully');
      } catch (error) {
        console.error('Error accessing webcam:', error);
        videoElement.style.display = 'none';
        errorElement.style.display = 'flex';
        errorElement.textContent = 'Unable to access webcam: ' + error.message;
      }
    }, 100);
  </script>
</body>
</html>
      `;
      
      // Write to temp file
      const tempPath = path.join(app.getPath('temp'), `webcam-overlay-${Date.now()}.html`);
      fs.writeFileSync(tempPath, overlayHTML);
      
      // Load from file:// URL which has full browser API support
      await webcamOverlayWindow.loadFile(tempPath);
      
      // Clean up temp file when window closes
      webcamOverlayWindow.once('closed', () => {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch (e) {
          console.error('Error cleaning up temp overlay file:', e);
        }
      });
      // Handle window close
      webcamOverlayWindow.on('closed', () => {
        webcamOverlayWindow = null;
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error creating webcam overlay window:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle update webcam overlay position
  ipcMain.handle('update-webcam-overlay-position', async (event, { x, y }) => {
    try {
      if (webcamOverlayWindow) {
        webcamOverlayWindow.setPosition(x, y);
      }
      return { success: true };
    } catch (error: any) {
      console.error('Error updating webcam overlay position:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle close webcam overlay window
  ipcMain.handle('close-webcam-overlay', async () => {
    try {
      if (webcamOverlayWindow) {
        webcamOverlayWindow.close();
        webcamOverlayWindow = null;
      }
      return { success: true };
    } catch (error: any) {
      console.error('Error closing webcam overlay window:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle save recording data (blob from renderer)
  ipcMain.handle('save-recording-blob', async (event, { arrayBuffer }) => {
    try {
      const tempPath = path.join(app.getPath('temp'), `recording_${Date.now()}.webm`);
      console.log('Saving recording to:', tempPath);
      
      fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));
      console.log('Recording saved successfully');
      
      return { success: true, tempPath };
    } catch (error: any) {
      console.error('Error saving recording:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle convert recording to MP4
  ipcMain.handle('convert-recording', async (event, { webmPath }) => {
    try {
      console.log('Converting recording:', webmPath);
      
      const outputPath = webmPath.replace('.webm', '.mp4');
      
      // Convert webm to mp4 with FFmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg(webmPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions('-crf 23')
          .outputOptions('-preset fast')
          .output(outputPath)
          .on('end', () => {
            console.log('Conversion complete:', outputPath);
            // Clean up webm file
            if (fs.existsSync(webmPath)) {
              fs.unlinkSync(webmPath);
              console.log('Temp webm file deleted');
            }
            resolve();
          })
          .on('error', (err) => {
            console.error('Conversion error:', err);
            reject(err);
          })
          .run();
      });

      // Extract metadata
      const metadata = await new Promise<any>((resolve, reject) => {
        ffmpeg.ffprobe(outputPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata);
        });
      });

      const duration = metadata.format.duration || 0;
      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      const width = videoStream?.width || 0;
      const height = videoStream?.height || 0;
      const codec = videoStream?.codec_name || 'unknown';

      // Generate thumbnail
      let thumbnailBase64: string | null = null;
      try {
        const thumbnailPath = path.join(app.getPath('temp'), `thumb_${Date.now()}.jpg`);
        
        await new Promise<void>((resolve, reject) => {
          ffmpeg(outputPath)
            .screenshots({
              timestamps: [1],
              filename: path.basename(thumbnailPath),
              folder: path.dirname(thumbnailPath),
              size: '300x300'
            })
            .on('end', () => {
              const imageBuffer = fs.readFileSync(thumbnailPath);
              thumbnailBase64 = imageBuffer.toString('base64');
              fs.unlinkSync(thumbnailPath);
              resolve();
            })
            .on('error', reject);
        });
      } catch (thumbError) {
        console.error('Thumbnail generation failed:', thumbError);
      }

      return {
        success: true,
        filePath: outputPath,
        fileName: path.basename(outputPath),
        duration,
        width,
        height,
        codec,
        thumbnail: thumbnailBase64 ? `data:image/jpeg;base64,${thumbnailBase64}` : null
      };
    } catch (error: any) {
      console.error('Error converting recording:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Handle transcribe video request
  ipcMain.handle('transcribe-video', async (event, { filePath }) => {
    try {
      console.log('Transcribing video:', filePath);
      
      // Check if OpenAI API key is available (from settings or env)
      const settings = getSettings();
      const apiKey = settings.getSetting('openaiApiKey') || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please set it in the Agent settings.');
      }
      
      const openai = new OpenAI({ apiKey });
      
      // Extract audio from video
      const audioPath = path.join(app.getPath('temp'), `audio_${Date.now()}.wav`);
      console.log('Extracting audio to:', audioPath);
      
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .output(audioPath)
          .noVideo()
          .audioCodec('pcm_s16le')
          .audioFrequency(16000)
          .audioChannels(1)
          .on('end', () => {
            console.log('Audio extraction complete');
            resolve();
          })
          .on('error', (err) => {
            console.error('Audio extraction error:', err);
            reject(err);
          })
          .run();
      });
      
      // Check audio file size (OpenAI limit is 25MB)
      const stats = fs.statSync(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log('Audio file size:', fileSizeMB.toFixed(2), 'MB');
      
      if (fileSizeMB > 25) {
        // Clean up
        fs.unlinkSync(audioPath);
        throw new Error(`Audio file too large (${fileSizeMB.toFixed(2)}MB). OpenAI limit is 25MB.`);
      }
      
      // Send to OpenAI Whisper API
      console.log('Uploading to OpenAI Whisper API...');
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word']
      });
      
      // Clean up audio file
      fs.unlinkSync(audioPath);
      console.log('Audio file cleaned up');
      
      // Post-process: Extract word-level timestamps
      const words = transcription.words || [];
      
      // Post-process: Identify filler words
      const fillerPatterns = [
        'um', 'uh', 'ah', 'er', 'hmm', 'like', 'actually', 'basically',
        'you know', 'i mean', 'sort of', 'kind of'
      ];
      
      const processedWords = words.map((word: any) => {
        const wordText = word.word.toLowerCase().trim();
        const isFiller = fillerPatterns.some(pattern => 
          wordText === pattern || wordText.includes(pattern)
        );
        
        return {
          start: word.start,
          end: word.end,
          text: word.word,
          isFiller
        };
      });
      
      // Post-process: Identify silences (gaps > 0.3 seconds)
      const silences: any[] = [];
      for (let i = 0; i < processedWords.length - 1; i++) {
        const currentWord = processedWords[i];
        const nextWord = processedWords[i + 1];
        const gap = nextWord.start - currentWord.end;
        
        if (gap > 0.3) {
          silences.push({
            start: currentWord.end,
            end: nextWord.start,
            duration: gap
          });
        }
      }
      
      // Create segments (group words into sentences/phrases)
      const segments: any[] = [];
      let currentSegment: any = null;
      
      for (const word of processedWords) {
        if (!currentSegment) {
          currentSegment = {
            start: word.start,
            end: word.end,
            text: word.text,
            words: [word]
          };
        } else {
          // Check if there's a significant pause or punctuation
          const gap = word.start - currentSegment.end;
          if (gap > 1.0 || word.text.match(/[.!?]$/)) {
            segments.push(currentSegment);
            currentSegment = {
              start: word.start,
              end: word.end,
              text: word.text,
              words: [word]
            };
          } else {
            currentSegment.end = word.end;
            currentSegment.text += ' ' + word.text;
            currentSegment.words.push(word);
          }
        }
      }
      
      if (currentSegment) {
        segments.push(currentSegment);
      }
      
      // Extract all filler words
      const fillerWords = processedWords.filter((word: any) => word.isFiller);
      
      // Calculate summary
      const fillerWordCount = fillerWords.length;
      const totalSilenceDuration = silences.reduce((sum, s) => sum + s.duration, 0);
      
      // Get duration from transcription or calculate from words
      const duration = transcription.duration || (processedWords.length > 0 
        ? processedWords[processedWords.length - 1].end 
        : 0);
      
      const result = {
        segments,
        fullText: transcription.text,
        duration,
        fillerWords,
        silences,
        summary: {
          fillerWordCount,
          totalSilenceDuration
        }
      };
      
      console.log('Transcription complete:', {
        segments: segments.length,
        fillerWords: fillerWordCount,
        silences: silences.length,
        duration
      });
      
      return { success: true, transcript: result };
    } catch (error: any) {
      console.error('Transcription error:', error);
      return { 
        success: false, 
        error: error.message || 'Transcription failed' 
      };
    }
  });

  // ============ AI AGENT HANDLERS ============
  
  // Send message to AI agent
  ipcMain.handle('ai-agent:send-message', async (event, data: { message: string; timelineClips: TimelineClip[] }) => {
    try {
      const agent = getAIAgent();
      
      // Update agent's timeline state
      agent.updateTimelineState(data.timelineClips);
      
      // Process the message
      const responses: any[] = [];
      
      await agent.processMessage(data.message, (response) => {
        // Send each response to renderer as it comes in
        if (mainWindow) {
          mainWindow.webContents.send('ai-agent:response', response);
        }
        responses.push(response);
      });
      
      return { success: true, responses };
    } catch (error: any) {
      console.error('Error processing AI agent message:', error);
      return {
        success: false,
        error: error.message || 'Failed to process message',
      };
    }
  });
  
  // Get AI agent chat history
  ipcMain.handle('ai-agent:get-history', async () => {
    try {
      const agent = getAIAgent();
      const history = agent.getHistory();
      
      return { success: true, history };
    } catch (error: any) {
      console.error('Error getting AI agent history:', error);
      return {
        success: false,
        error: error.message || 'Failed to get history',
      };
    }
  });
  
  // Clear AI agent chat history
  ipcMain.handle('ai-agent:clear-history', async () => {
    try {
      const agent = getAIAgent();
      agent.clearHistory();
      
      return { success: true };
    } catch (error: any) {
      console.error('Error clearing AI agent history:', error);
      return {
        success: false,
        error: error.message || 'Failed to clear history',
      };
    }
  });
  
  // Get API settings
  ipcMain.handle('ai-agent:get-settings', async () => {
    try {
      const settings = getSettings();
      return {
        success: true,
        settings: {
          hasOpenAIKey: !!settings.getSetting('openaiApiKey'),
          hasPixabayKey: !!settings.getSetting('pixabayApiKey'),
          // Don't return actual keys for security
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get settings',
      };
    }
  });

  // Set API keys
  ipcMain.handle('ai-agent:set-api-keys', async (event, data: { openaiApiKey?: string; pixabayApiKey?: string }) => {
    try {
      const settings = getSettings();
      
      if (data.openaiApiKey !== undefined) {
        settings.setSetting('openaiApiKey', data.openaiApiKey);
        // Update agent instance if it exists
        try {
          const agent = getAIAgent();
          if (data.openaiApiKey) {
            agent.updateApiKey(data.openaiApiKey);
          }
        } catch (error) {
          // Agent might not be initialized yet, that's ok
          console.log('Agent not initialized yet, will use key when created');
        }
      }
      
      if (data.pixabayApiKey !== undefined) {
        settings.setSetting('pixabayApiKey', data.pixabayApiKey);
        // Update image service instance
        const imageService = getImageService();
        if (data.pixabayApiKey) {
          imageService.updateApiKey(data.pixabayApiKey);
        }
      }
      
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to set API keys',
      };
    }
  });

  // Get image cache stats
  ipcMain.handle('ai-agent:get-cache-stats', async () => {
    try {
      const imageService = getImageService();
      const stats = imageService.getCacheStats();
      
      return { success: true, stats };
    } catch (error: any) {
      console.error('Error getting cache stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to get cache stats',
      };
    }
  });
  
  // Clear image cache
  ipcMain.handle('ai-agent:clear-cache', async () => {
    try {
      const imageService = getImageService();
      imageService.clearCache();
      
      return { success: true };
    } catch (error: any) {
      console.error('Error clearing cache:', error);
      return {
        success: false,
        error: error.message || 'Failed to clear cache',
      };
    }
  });
  
  console.log('IPC handlers initialized (including AI agent handlers)');
}

