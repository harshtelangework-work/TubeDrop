const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const { createBackend } = require("./backend");
const { resolveFfmpegPath } = require("./ffmpeg");
const { resolveYtdlpPath } = require("./ytdlp");

const PORT = 3000;

/**
 * Creates (but does not start) the local HTTP + Socket.IO server that powers
 * TubeDrop. This runs inside the Electron main process itself -- there is no
 * separate Node process to spawn or manage, and no separate package.json /
 * node_modules for "the server". It also keeps listening on
 * http://localhost:3000 so the TubeDrop browser extension keeps working.
 */
function createServer() {
    const app = express();
    const httpServer = http.createServer(app);
    const io = new Server(httpServer, { cors: { origin: "*" } });

    const ffmpegLocation = resolveFfmpegPath();
    const ytdlpPath = resolveYtdlpPath();

    console.log("[TubeDrop] FFmpeg:", ffmpegLocation || "(not found, relying on system PATH)");
    console.log("[TubeDrop] yt-dlp:", ytdlpPath);

    const backend = createBackend({ ytdlpPath, ffmpegLocation });

    app.use(cors());
    app.use(express.json());

    app.get("/", (req, res) => {
        res.send("TubeDrop server is running!");
    });

    app.post("/analyze", async (req, res) => {
        try {
            const result = await backend.analyze(req.body.url);
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    app.post("/download", async (req, res) => {
        try {
            const result = await backend.download(req.body, (progress) => {
                io.emit("download-progress", progress);
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/cancel", (req, res) => {
        backend.cancelDownload();
        res.json({ success: true });
    });

    io.on("connection", (socket) => {
        console.log("[TubeDrop] client connected:", socket.id);
    });

    return {
        app,
        io,
        backend,

        start() {
            return new Promise((resolve, reject) => {
                httpServer.once("error", reject);
                httpServer.listen(PORT, "127.0.0.1", () => {
                    console.log(`[TubeDrop] Server running at http://localhost:${PORT}`);
                    resolve();
                });
            });
        },

        stop() {
            return new Promise((resolve) => {
                io.close();
                httpServer.close(() => resolve());
                // Don't let a stuck socket hang app quit forever.
                setTimeout(resolve, 1500);
            });
        }
    };
}

module.exports = { createServer };
