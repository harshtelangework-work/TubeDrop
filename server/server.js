// ==========================================
// 1. MODULE IMPORTS
// ==========================================
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const { exec } = require("child_process");
const youtubedl = require("yt-dlp-exec");

// ==========================================
// 2. CONFIGURATION & APP INITIALIZATION
// ==========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// FFmpeg dependency path.
// Prefer FFMPEG_PATH env var, fall back to the original dev machine's
// known install location, and only use it if the file actually exists.
// Otherwise leave it undefined so yt-dlp falls back to ffmpeg on PATH,
// instead of silently failing on every machine that isn't harsh's.
const DEV_MACHINE_FFMPEG =
    "C:\\Users\\harsh\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";

function resolveFfmpegLocation() {
    const candidates = [process.env.FFMPEG_PATH, DEV_MACHINE_FFMPEG].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

const FFMPEG_LOCATION = resolveFfmpegLocation();

if (!FFMPEG_LOCATION) {
    console.warn("⚠️  No local ffmpeg found (checked FFMPEG_PATH and the default dev path). Falling back to ffmpeg on PATH.");
}

// Global tracking state for the active download process
let currentDownload = null;

// ==========================================
// 3. MIDDLEWARE LAYER
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// 4. PROGRESS PARSING
// ==========================================

/**
 * Parses a single yt-dlp stdout/stderr line into a structured progress
 * object. Returns null for lines that aren't a "[download] xx.x% ..."
 * progress line (playlist headers, merge/postprocess messages, etc).
 */
function parseProgressLine(text) {
    if (!text.includes("[download]")) return null;

    const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
    if (!percentMatch) return null;

    const percent = Math.min(100, Math.max(0, parseFloat(percentMatch[1])));

    // e.g. "of 128.50MiB" or "of ~10.00MiB"
    const sizeMatch = text.match(/of\s+~?\s*([\d.]+)\s*(B|[KMGT]iB)/i);
    // e.g. "at 5.32MiB/s"
    const speedMatch = text.match(/at\s+([\d.]+\s*(?:B|[KMGT]iB)\/s)/i);
    // e.g. "ETA 00:12"
    const etaMatch = text.match(/ETA\s+([\d:]+)/i);

    let downloaded = "--";
    let total = "--";

    if (sizeMatch) {
        const totalValue = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2];
        const downloadedValue = (percent / 100) * totalValue;

        downloaded = `${downloadedValue.toFixed(2)} ${unit}`;
        total = `${totalValue.toFixed(2)} ${unit}`;
    }

    return {
        percent,
        downloaded,
        total,
        speed: speedMatch ? speedMatch[1] : "--",
        eta: etaMatch ? etaMatch[1] : "--:--"
    };
}

// ==========================================
// 5. HTTP ROUTE HANDLERS
// ==========================================

/**
 * Health Check Route
 */
app.get("/", (req, res) => {
    res.send("TubeDrop server is running!");
});

/**
 * Route: Analyze video formats from a target URL
 */
app.post("/analyze", async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: "No URL provided" });
    }

    try {
        const info = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            skipDownload: true
        });

        const formats = [];
        for (const format of info.formats) {
            // Skip entries missing both video and audio streams
            if (!format.vcodec && !format.acodec) continue;

            formats.push({
                formatId: format.format_id,
                quality: format.height ? `${format.height}p` : "Audio Only",
                ext: format.ext,
                size: format.filesize || format.filesize_approx || 0,
                width: format.width || 0,
                height: format.height || 0,
                fps: format.fps || 0,
                videoCodec: format.vcodec,
                audioCodec: format.acodec
            });
        }

        // De-duplicate by (quality + extension)
        const uniqueFormats = [];
        const seen = new Set();

        for (const format of formats) {
            const key = `${format.quality}-${format.ext}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueFormats.push(format);
            }
        }

        uniqueFormats.sort((a, b) => b.height - a.height);

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, "0")}`,
            channel: info.uploader,
            formats: uniqueFormats
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to analyze video" });
    }
});

/**
 * Route: Download the selected format. Honors downloadType so "Audio"
 * downloads actually extract audio instead of always producing an mp4.
 */
app.post("/download", async (req, res) => {
    const { url, formatId, downloadFolder, downloadType } = req.body;

    if (!url || !formatId || !downloadFolder) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        console.log("Download folder:", downloadFolder);
        console.log("Format ID:", formatId);
        console.log("Download type:", downloadType);

        const isAudio = downloadType === "audio";

        const options = {
            output: path.join(downloadFolder, "%(title)s.%(ext)s")
        };

        if (FFMPEG_LOCATION) {
            options.ffmpegLocation = FFMPEG_LOCATION;
        }

        if (isAudio) {
            // Audio-only: extract and transcode to mp3, don't try to merge
            // an audio-only stream with "+bestaudio" (that's only valid
            // when combining a video stream with an audio stream).
            options.format = formatId || "bestaudio/best";
            options.extractAudio = true;
            options.audioFormat = "mp3";
        } else {
            options.format = `${formatId}+bestaudio/best`;
            options.mergeOutputFormat = "mp4";
        }

        currentDownload = youtubedl.exec(url, options);

        console.log("PID:", currentDownload.pid);

        const sendProgress = (data) => {
            const text = data.toString();
            console.log(text);

            const progress = parseProgressLine(text);
            if (progress) {
                io.emit("download-progress", progress);
            }
        };

        currentDownload.stdout.on("data", sendProgress);
        currentDownload.stderr.on("data", sendProgress);

        await currentDownload;
        currentDownload = null;

        return res.json({ success: true });

    } catch (err) {
        currentDownload = null;

        console.error(err.stdout);
        console.error(err.stderr);

        return res.status(500).json({ error: err.message });
    }
});

/**
 * Route: Cancel the active download, cross-platform.
 */
app.post("/cancel", (req, res) => {
    if (currentDownload && currentDownload.pid) {
        console.log("❌ Cancelling download...");

        if (process.platform === "win32") {
            exec(`taskkill /PID ${currentDownload.pid} /T /F`, (err) => {
                if (err) console.error(err);
            });
        } else {
            try {
                process.kill(currentDownload.pid, "SIGKILL");
            } catch (err) {
                console.error(err);
            }
        }

        currentDownload = null;
    }

    res.json({ success: true });
});

// ==========================================
// 6. REAL-TIME SOCKET CONNECTION & LIFECYCLE
// ==========================================
io.on("connection", () => {
    console.log("🟢 Electron connected");
});

server.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
});
