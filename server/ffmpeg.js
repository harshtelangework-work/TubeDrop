const path = require("path");
const fs = require("fs");

/**
 * Resolves the bundled FFmpeg executable.
 *
 * - Packaged app: <resources>/ffmpeg/ffmpeg.exe (see extraResources in package.json)
 * - Development:  <project root>/ffmpeg/ffmpeg.exe
 *
 * Returns null (never throws) if FFmpeg can't be found, so callers can decide
 * how to degrade instead of crashing the whole app.
 */
function resolveFfmpegPath() {
    // TubeDrop only ships a Windows build, and the binary bundled under
    // /ffmpeg is always the Windows executable, regardless of what platform
    // this code happens to be evaluated on (e.g. a developer testing on
    // macOS/Linux still has an .exe on disk, not a native ffmpeg).
    const filename = "ffmpeg.exe";

    if (process.resourcesPath) {
        const packagedPath = path.join(process.resourcesPath, "ffmpeg", filename);
        if (fs.existsSync(packagedPath)) {
            return packagedPath;
        }
    }

    const devPath = path.join(__dirname, "..", "ffmpeg", filename);
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    console.warn("[TubeDrop] Bundled FFmpeg not found. Falling back to system PATH.");
    return null;
}

module.exports = { resolveFfmpegPath };
