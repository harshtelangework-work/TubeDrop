const { spawn } = require("child_process");

/**
 * Runs the bundled yt-dlp binary with the given args.
 *
 * Returns { child, done } where `child` is the live ChildProcess (so callers
 * can track/kill it for cancellation) and `done` is a Promise that resolves
 * with { stdout, stderr, code } on a clean exit, or rejects with an Error
 * (carrying .stdout/.stderr/.code) on failure.
 */
function runYtdlp(binaryPath, args, { onOutput } = {}) {
    const child = spawn(binaryPath, args, { windowsHide: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (onOutput) onOutput(text);
    });

    child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (onOutput) onOutput(text);
    });

    const done = new Promise((resolve, reject) => {
        child.on("error", (err) => {
            reject(new Error(`Could not start yt-dlp: ${err.message}`));
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve({ stdout, stderr, code });
                return;
            }

            const error = new Error(stderr.trim() || `yt-dlp exited with code ${code}`);
            error.stdout = stdout;
            error.stderr = stderr;
            error.code = code;
            reject(error);
        });
    });

    return { child, done };
}

module.exports = { runYtdlp };
