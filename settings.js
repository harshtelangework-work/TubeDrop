const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function getSettingsPath() {
    return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
    const settingsPath = getSettingsPath();

    if (!fs.existsSync(settingsPath)) {
        const defaults = {
            downloadFolder: "",
            rememberFolder: true,
            openFolderAfterDownload: false
        };

        fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 4));

        return defaults;
    }

    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
}

function saveSettings(settings) {
    const settingsPath = getSettingsPath();

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
}

module.exports = {
    loadSettings,
    saveSettings
};