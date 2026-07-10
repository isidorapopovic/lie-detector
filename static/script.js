const form = document.getElementById("analyze-form");
const textInput = document.getElementById("text-input");
const imageInput = document.getElementById("image-input");
const dropZone = document.getElementById("drop-zone");
const preview = document.getElementById("preview");
const dropHint = dropZone.querySelector(".drop-hint");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

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
    : `<span class="spinner"></span>${message}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderResult(data) {
  const flagged = data.is_manipulation;
  const techniques = (data.techniques || [])
    .map(
      (t) => `
      <div class="technique">
        <p class="technique-name">${escapeHtml(t.name)}</p>
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
        <p class="verdict-heading">${
          flagged ? "Manipulation detected" : "No clear manipulation"
        }</p>
        <p class="verdict-confidence">Confidence: ${escapeHtml(
          data.confidence
        )}</p>
      </div>
    </div>
    <div class="result-body">
      <p class="summary">${escapeHtml(data.summary)}</p>
      ${techniquesBlock}
      <div class="recommendation">
        <p class="section-title">What to keep in mind</p>
        <p>${escapeHtml(data.recommendation)}</p>
      </div>
    </div>`;
  resultEl.hidden = false;
}

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
  setStatus("Analyzing…");

  try {
    const formData = new FormData(form);
    const res = await fetch("/analyze", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }
    setStatus(null);
    renderResult(data);
  } catch (err) {
    setStatus(escapeHtml(err.message), true);
  } finally {
    submitBtn.disabled = false;
  }
});
