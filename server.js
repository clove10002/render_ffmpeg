const express = require('express');
const fileUpload = require('express-fileupload');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

try {
  const ffmpegPath = execSync('which ffmpeg').toString().trim();
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('[INFO] FFmpeg found at:', ffmpegPath);
} catch (err) {
  console.error('[ERROR] FFmpeg not found.');
}

app.use(fileUpload());
app.use(express.json());

app.post('/api/clip', async (req, res) => {
  const { start, duration, format } = req.body;
  if (!req.files || !req.files.video) return res.status(400).send('No video uploaded.');

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
        res.download(outputPath, () => {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        });
      })
      .on('error', err => {
        console.error('[FFmpeg Error]', err);
        res.status(500).send('Video processing failed.');
      })
      .run();
  } catch (err) {
    console.error('[Server Error]', err);
    res.status(500).send('Internal server error.');
  }
});

app.listen(PORT, () => console.log(`🎬 Server running on port ${PORT}`));
