const videoUrl = document.getElementById("videoUrl");
const analyzeBtn = document.getElementById("analyzeBtn");
const errorMessage = document.getElementById("errorMessage");
const videoCard = document.getElementById("videoCard");

analyzeBtn.addEventListener("click", async () => {

    errorMessage.textContent = "";
    videoCard.style.display = "none";

    const url = videoUrl.value.trim();

    if (!url) {
        errorMessage.textContent = "Please enter a URL.";
        return;
    }

    try {

        const response = await fetch("http://localhost:3000/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            throw new Error("Server returned " + response.status);
        }

        const data = await response.json();

        document.getElementById("thumbnail").src = data.thumbnail;
        document.getElementById("title").textContent = data.title;
        document.getElementById("duration").textContent = data.duration;
        document.getElementById("channel").textContent = data.channel;
        document.getElementById("qualities").textContent = data.qualities.join(", ");
        document.getElementById("size").textContent = data.size;

        videoCard.style.display = "block";

    } catch (err) {
        console.error(err);
        errorMessage.textContent = "Could not connect to the server.";
    }

});