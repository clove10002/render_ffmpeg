const express = require('express');
const fileUpload = require('express-fileupload');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Get ffmpeg path dynamically
try {
  const ffmpegPath = execSync('which ffmpeg').toString().trim();
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('[INFO] FFmpeg path:', ffmpegPath);
} catch (err) {
  console.error('[ERROR] FFmpeg not found');
}

app.use(fileUpload());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.send('🟢 FFmpeg API is online');
});

// Clip video
app.post('/api/clip', async (req, res) => {
  const { start, duration, format } = req.body;
  if (!req.files || !req.files.video) return res.status(400).send('No video uploaded');

  const inputPath = path.join(__dirname, 'input.mp4');
  const outputExt = format || 'mp4';
  const outputPath = path.join(__dirname, `output.${outputExt}`);

  try {
    await req.files.video.mv(inputPath);
    ffmpeg(inputPath)
      .setStartTime(start || 0)
      .setDuration(duration || 5)
      .toFormat(outputExt)
      .output(outputPath)
      .on('start', cmd => console.log('[FFmpeg]', cmd))
      .on('stderr', line => console.log('[FFmpeg]', line))
      .on('end', () => {
        res.setHeader('Content-Type', 'video/mp4');
        const readStream = fs.createReadStream(outputPath);
        readStream.pipe(res);
        readStream.on('close', () => {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        });
      })
      .on('error', err => {
        console.error('[FFmpeg Error]', err);
        res.status(500).send('Video processing failed');
      })
      .run();
  } catch (err) {
    console.error('[Server Error]', err);
    res.status(500).send('Internal error');
  }
});

// convert mpd to mp4
app.post('/api/mpd-to-mp4', async (req, res) => {
  const { url } = req.body;
  const outputPath = path.join(__dirname, 'output.mp4');

  if (!url) return res.status(400).send('Missing URL');

  try {
    ffmpeg(url)
      .outputOptions('-c copy')
      .on('start', cmd => console.log('[FFmpeg]', cmd))
      .on('stderr', line => console.log('[FFmpeg]', line))
      .on('end', () => {
        const readStream = fs.createReadStream(outputPath);
        res.setHeader('Content-Type', 'video/mp4');
        readStream.pipe(res);
        readStream.on('close', () => {
          fs.unlinkSync(outputPath);
        });
      })
      .on('error', err => {
        console.error('[FFmpeg Error]', err);
        res.status(500).send('Failed to fetch video');
      })
      .save(outputPath);
  } catch (err) {
    console.error('[Server Error]', err);
    res.status(500).send('Internal server error');
  }
});

// reframe video and add text on top
// Add text with white background at the top of the video

app.post('/api/add-text-on-top', async (req, res) => {
  if (
    !req.files || 
    !req.files.video ||
    !req.body.textcolor || 
    !req.body.height || 
    !req.body.drawtextFilters
  ) {
    return res.status(400).send('Missing Params');
  }

  const uploadedVideo = req.files.video;
  const drawtextFilters = req.body.drawtextFilters;
  const textColor = req.body.textcolor;
  const height = req.body.height;
  const inputPath = path.join(__dirname, 'input.mp4');
  const outputPath = path.join(__dirname, 'output.mp4');

  await uploadedVideo.mv(inputPath);

  let ffmpegLogs = '';
  ffmpeg(inputPath)
    .videoFilters([
      `drawbox=x=0:y=0:w=iw:h=${height}:color=${textColor}:t=fill`,
      `${drawtextFilters}`
    ])
    .on('stderr', line => {
      console.log('[FFmpeg]', line);
      ffmpegLogs += line + '\n';
    })
    .on('end', () => {
      res.download(outputPath, 'video_with_text.mp4', err => {
        if (err) console.error('Download error:', err);
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      });
    })
    .on('error', err => {
      console.error('FFmpeg error:', err);
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      res.status(500).send(`Failed to add text to video:\n${ffmpegLogs.slice(0, 500)}`);
    })
    .save(outputPath);
});



// Clean files every 15 min
setInterval(() => {
  for (const file of ['input.mp4', 'output.mp4']) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}, 15 * 60 * 1000);

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
