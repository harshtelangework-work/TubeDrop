const path = require("path");
const fs = require("fs");

/**
 * Resolves the bundled yt-dlp executable.
 *
 * - Packaged app: <resources>/ytdlp/yt-dlp.exe (see extraResources in package.json)
 * - Development:  <project root>/ytdlp/yt-dlp.exe
 *
 * Falls back to "yt-dlp" on the system PATH only as a last resort (e.g. a
 * developer running on macOS/Linux without the bundled Windows binary).
 */
function resolveYtdlpPath() {
    // TubeDrop only ships a Windows build, and the binary bundled under
    // /ytdlp is always the Windows executable, regardless of what platform
    // this code happens to be evaluated on.
    const filename = "yt-dlp.exe";

    if (process.resourcesPath) {
        const packagedPath = path.join(process.resourcesPath, "ytdlp", filename);
        if (fs.existsSync(packagedPath)) {
            return packagedPath;
        }
    }

    const devPath = path.join(__dirname, "..", "ytdlp", filename);
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    console.warn("[TubeDrop] Bundled yt-dlp not found. Falling back to system PATH.");
    return filename;
}

module.exports = { resolveYtdlpPath };
