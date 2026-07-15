const form = document.getElementById("analyze-form");
const textInput = document.getElementById("text-input");
const imageInput = document.getElementById("image-input");
const dropZone = document.getElementById("drop-zone");
const preview = document.getElementById("preview");
const dropHint = dropZone.querySelector(".drop-hint");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const historySection = document.getElementById("history-section");
const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history");

function showPreview(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.hidden = false;
        dropHint.textContent = file.name;
    };
    reader.readAsDataURL(file);
}

imageInput.addEventListener("change", () => {
    showPreview(imageInput.files[0]);
});

["dragenter", "dragover"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    })
);

["dragleave", "drop"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
    })
);

dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
        imageInput.files = e.dataTransfer.files;
        showPreview(file);
    }
});

function setStatus(message, isError = false) {
    if (!message) {
        statusEl.hidden = true;
        statusEl.innerHTML = "";
        return;
    }
    statusEl.hidden = false;
    statusEl.className = isError ? "status error" : "status";
    statusEl.innerHTML = isError
        ? message
        : `<span class="spinner"></span><span class="status-text">${message}</span>`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

// Interpolate the score color from sky-blue (low) to amaranth (high).
function scoreColor(score) {
    if (score >= 67) return "#7d1d3f"; // Dark Amaranth
    if (score >= 34) return "#827191"; // Dusty Lavender
    return "#84acce"; // Sky Reflection
}

function scoreMeter(score) {
    const pct = Math.max(0, Math.min(100, score));
    const color = scoreColor(pct);
    return `
    <div class="score">
      <div class="score-head">
        <span class="section-title">Manipulation score</span>
        <span class="score-value" style="color:${color}">${pct}/100</span>
      </div>
      <div class="meter">
        <div class="meter-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
}

function renderResult(data) {
    const flagged = data.is_manipulation;
    const techniques = (data.techniques || [])
        .map(
            (t) => `
      <div class="technique">
        <p class="technique-name">
          ${escapeHtml(t.name)}
          ${t.category && t.category !== "Other"
                    ? `<span class="technique-tag">${escapeHtml(t.category)}</span>`
                    : ""
                }
        </p>
        <p class="technique-evidence">“${escapeHtml(t.evidence)}”</p>
        <p class="technique-explanation">${escapeHtml(t.explanation)}</p>
      </div>`
        )
        .join("");

    const techniquesBlock = techniques
        ? `<p class="section-title">Techniques found</p>${techniques}`
        : "";

    resultEl.innerHTML = `
    <div class="verdict ${flagged ? "flagged" : "clean"}">
      <span class="verdict-icon">${flagged ? "⚠️" : "✓"}</span>
      <div>
        <p class="verdict-heading">${flagged ? "Manipulation detected" : "No clear manipulation"
        }</p>
        <p class="verdict-confidence">Confidence: ${escapeHtml(
            data.confidence
        )}</p>
      </div>
    </div>
    <div class="result-body">
      ${scoreMeter(data.manipulation_score ?? 0)}
      <p class="summary">${escapeHtml(data.summary)}</p>
      ${techniquesBlock}
      <div class="recommendation">
        <p class="section-title">What to keep in mind</p>
        <p>${escapeHtml(data.recommendation)}</p>
      </div>
    </div>`;
    resultEl.hidden = false;
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---- History -------------------------------------------------------------

function timeAgo(iso) {
    const then = new Date(iso).getTime();
    const secs = Math.max(1, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(iso).toLocaleDateString();
}

function renderHistory(items) {
    if (!items || items.length === 0) {
        historySection.hidden = true;
        return;
    }
    historySection.hidden = false;
    historyList.innerHTML = items
        .map((item) => {
            const color = scoreColor(item.score);
            return `
      <button class="history-item" data-id="${item.id}">
        <span class="history-badge" style="background:${color}">${item.score}</span>
        <span class="history-text">
          <span class="history-preview">${escapeHtml(item.preview || "(no text)")}</span>
          <span class="history-meta">${item.is_manipulation ? "Manipulation" : "Clean"
                } · ${timeAgo(item.created_at)}</span>
        </span>
      </button>`;
        })
        .join("");

    // Clicking a history entry re-renders its stored result.
    historyList.querySelectorAll(".history-item").forEach((btn) => {
        btn.addEventListener("click", () => {
            const item = items.find((i) => String(i.id) === btn.dataset.id);
            if (item) renderResult(item.result);
        });
    });
}

async function loadHistory() {
    try {
        const res = await fetch("/history");
        if (!res.ok) return;
        renderHistory(await res.json());
    } catch (_) {
        /* history is best-effort */
    }
}

clearHistoryBtn.addEventListener("click", async () => {
    if (!confirm("Clear all saved analyses?")) return;
    await fetch("/history", { method: "DELETE" });
    loadHistory();
});

// ---- Submit --------------------------------------------------------------

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultEl.hidden = true;

    const hasText = textInput.value.trim().length > 0;
    const hasImage = imageInput.files.length > 0;
    if (!hasText && !hasImage) {
        setStatus("Please provide text or an image to analyze.", true);
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Analyzing…";
    setStatus("Analyzing — this can take a few seconds…");

    try {
        const formData = new FormData(form);
        const res = await fetch("/analyze", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Something went wrong.");
        }
        setStatus(null);
        renderResult(data);
        loadHistory();
    } catch (err) {
        setStatus(escapeHtml(err.message), true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Analyze";
    }
});

loadHistory();
