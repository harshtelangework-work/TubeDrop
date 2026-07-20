const path = require("path");
const { exec } = require("child_process");
const { runYtdlp } = require("./ytdlp-runner");

// ==========================================
// Helpers
// ==========================================

function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Turns a raw yt-dlp error message into something a normal person can
 * understand, instead of a wall of Python-style traceback text.
 */
function toFriendlyError(rawMessage = "") {
    const msg = rawMessage.toLowerCase();

    if (msg.includes("private video")) {
        return "This video is private and can't be downloaded.";
    }
    if (msg.includes("video unavailable") || msg.includes("has been removed")) {
        return "This video is unavailable or has been removed.";
    }
    if (msg.includes("age") && (msg.includes("confirm") || msg.includes("restrict"))) {
        return "This video is age-restricted and can't be downloaded.";
    }
    if (msg.includes("getaddrinfo") || msg.includes("enotfound") || msg.includes("network") || msg.includes("timed out")) {
        return "Couldn't reach the internet. Check your connection and try again.";
    }
    if (msg.includes("429") || msg.includes("too many requests")) {
        return "YouTube is rate-limiting requests right now. Please wait a bit and try again.";
    }
    if (msg.includes("unsupported url") || msg.includes("is not a valid url")) {
        return "That doesn't look like a valid YouTube URL.";
    }
    if (msg.includes("ffmpeg not found") || msg.includes("unable to find ffmpeg") || msg.includes("errno 2")) {
        return "FFmpeg is missing. Please reinstall TubeDrop.";
    }
    if (msg.includes("no such file or directory") && msg.includes("yt-dlp")) {
        return "The download engine is missing. Please reinstall TubeDrop.";
    }

    return rawMessage || "Something went wrong. Please try again.";
}

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
// Backend factory
// ==========================================

/**
 * Creates the analyze/download/cancel API, bound to a specific bundled
 * yt-dlp binary and (optional) bundled FFmpeg location. Used identically by
 * Electron's IPC handlers and the Express HTTP routes, so there is exactly
 * one implementation of the download pipeline.
 */
function createBackend({ ytdlpPath, ffmpegLocation }) {
    let activeDownload = null;

    async function analyze(url) {
        if (!url || !isValidUrl(url)) {
            throw new Error("Please enter a valid video URL.");
        }

        const args = [
            "--dump-single-json",
            "--no-warnings",
            "--no-call-home",
            "--skip-download",
            "--no-playlist",
            url
        ];

        let result;
        try {
            result = await runYtdlp(ytdlpPath, args).done;
        } catch (err) {
            throw new Error(toFriendlyError(err.stderr || err.message));
        }

        let info;
        try {
            info = JSON.parse(result.stdout);
        } catch {
            throw new Error("Failed to read video information.");
        }

        const formats = [];

        for (const format of info.formats || []) {
            // Skip entries missing both video and audio streams
            if (!format.vcodec && !format.acodec) continue;
            if (format.vcodec === "none" && format.acodec === "none") continue;

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

        const duration = Number.isFinite(info.duration)
            ? `${Math.floor(info.duration / 60)}:${String(Math.floor(info.duration % 60)).padStart(2, "0")}`
            : "--:--";

        return {
            title: info.title,
            thumbnail: info.thumbnail,
            duration,
            channel: info.uploader,
            formats: uniqueFormats
        };
    }

    /**
     * @param {object} data
     * @param {(progress: object) => void} [onProgress]
     */
    async function download({ url, formatId, downloadFolder, downloadType }, onProgress) {
        if (!url || !formatId || !downloadFolder) {
            throw new Error("Missing required download details.");
        }
        if (!isValidUrl(url)) {
            throw new Error("Please enter a valid video URL.");
        }

        const isAudio = downloadType === "audio";
        const outputTemplate = path.join(downloadFolder, "%(title)s.%(ext)s");

        const args = ["--no-warnings", "--newline", "--no-playlist", "-o", outputTemplate];

        if (ffmpegLocation) {
            args.push("--ffmpeg-location", ffmpegLocation);
        }

        if (isAudio) {
            // Audio-only: extract and transcode to mp3, don't try to merge an
            // audio-only stream with "+bestaudio" (only valid when combining
            // a video stream with a separate audio stream).
            args.push("-f", formatId || "bestaudio/best", "--extract-audio", "--audio-format", "mp3");
        } else {
            args.push("-f", `${formatId}+bestaudio/best`, "--merge-output-format", "mp4");
        }

        args.push(url);

        const { child, done } = runYtdlp(ytdlpPath, args, {
            onOutput: (text) => {
                const progress = parseProgressLine(text);
                if (progress && onProgress) onProgress(progress);
            }
        });

        activeDownload = child;

        try {
            await done;
        } catch (err) {
            throw new Error(toFriendlyError(err.stderr || err.message));
        } finally {
            activeDownload = null;
        }

        return { success: true };
    }

    function cancelDownload() {
        if (!activeDownload || !activeDownload.pid) return;

        if (process.platform === "win32") {
            exec(`taskkill /PID ${activeDownload.pid} /T /F`, (err) => {
                if (err) console.error(err);
            });
        } else {
            try {
                process.kill(activeDownload.pid, "SIGKILL");
            } catch (err) {
                console.error(err);
            }
        }

        activeDownload = null;
    }

    return { analyze, download, cancelDownload };
}

module.exports = { createBackend };
