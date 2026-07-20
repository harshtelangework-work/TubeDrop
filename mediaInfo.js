function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

async function analyzeMedia(url) {

    if (!isValidUrl(url)) {
        throw new Error("Invalid URL");
    }

    let response;

    try {
        response = await fetch("http://localhost:3000/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url })
        });
    } catch (err) {
        throw new Error("Could not connect to the download server. Is it running?");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || "Failed to analyze media");
    }

    return data;
}

module.exports = {
    analyzeMedia
};
