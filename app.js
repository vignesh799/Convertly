const fileInput = document.querySelector("#fileInput");
const uploadZone = document.querySelector("#uploadZone");
const chooseButton = document.querySelector("#chooseButton");
const queue = document.querySelector("#queue");
const queueEmpty = document.querySelector("#queueEmpty");
const filePreview = document.querySelector("#filePreview");
const fileList = document.querySelector("#fileList");
const fileCount = document.querySelector("#fileCount");
const clearButton = document.querySelector("#clearButton");
const addButton = document.querySelector("#addButton");
const themeToggle = document.querySelector("#themeToggle");
const toast = document.querySelector("#toast");
const quickFormatButtons = [...document.querySelectorAll(".format-cloud [data-output]")];
const serviceStatus = document.querySelector("#serviceStatus");
const formatHint = document.querySelector("#formatHint");
const batchProgress = document.querySelector("#batchProgress");
const progressLabel = document.querySelector("#progressLabel");
const progressValue = document.querySelector("#progressValue");
const progressBar = document.querySelector("#progressBar");

let files = [];
let presetFormat = null;
let capabilities = {};
let apiBase = "";
let conversionRunning = false;
let previewUrl = "";
let previewRequest = 0;

async function findApi() {
  const candidates = [""];
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:") {
    candidates.push("http://127.0.0.1:4173");
  }
  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(`${candidate}/api/health`, { cache: "no-store" });
      if (response.ok) return candidate;
    } catch {
      // Try the dedicated local API port next.
    }
  }
  throw new Error("Converter service unavailable");
}

const apiReady = findApi().then(base => {
  apiBase = base;
  serviceStatus.textContent = "Converter online";
  serviceStatus.className = "is-online";
  return fetch(`${apiBase}/api/formats`, { cache: "no-store" });
}).then(response => {
  if (!response.ok) throw new Error("Converter service unavailable");
  return response.json();
}).then(data => {
  capabilities = data;
  if (files.length) {
    files.forEach(item => {
      const ext = item.file.name.split(".").pop().toLowerCase();
      item.outputs = capabilities[ext]?.map(value => value.toUpperCase()) || [];
      if (!item.outputs.includes(item.output)) item.output = item.outputs[0] || "";
    });
    renderFiles();
  } else {
    updateQuickFormatButtons();
  }
  return data;
}).catch(error => {
  serviceStatus.textContent = "Service offline";
  serviceStatus.className = "is-offline";
  showToast("The conversion service is offline. Start the app with npm start.");
  throw error;
});

const formatMap = {
  image: ["JPG", "PNG", "WEBP", "AVIF", "TIFF", "PDF"],
  video: ["MP4", "WEBM", "MOV", "MKV", "AVI", "GIF", "MP3", "WAV"],
  audio: ["MP3", "WAV", "AAC", "OGG", "FLAC", "M4A"],
  pdf: ["DOCX", "TXT", "JPG", "PNG"],
  document: ["PDF", "TXT", "HTML"],
  spreadsheet: ["XLSX", "CSV", "PDF", "HTML"],
  text: ["PDF", "DOCX", "HTML", "TXT"],
  default: []
};

function getCategory(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "document";
  if (["xlsx", "csv"].includes(ext)) return "spreadsheet";
  if (["txt", "md", "json", "xml", "html"].includes(ext)) return "text";
  return "default";
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function addFiles(newFiles) {
  const existing = new Set(files.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
  const incoming = [...newFiles];
  const withinLimit = incoming.filter(file => file.size <= 500 * 1024 * 1024);
  const accepted = withinLimit.filter(file => !existing.has(`${file.name}:${file.size}:${file.lastModified}`));
  const rejected = incoming.length - withinLimit.length;
  const duplicates = withinLimit.length - accepted.length;
  files = files.concat(accepted.map(file => {
    const ext = file.name.split(".").pop().toLowerCase();
    const outputs = capabilities[ext]?.map(value => value.toUpperCase()) || formatMap[getCategory(file)] || [];
    const requestedPreset = presetFormat && outputs.includes(presetFormat) ? presetFormat : null;
    return { file, output: requestedPreset || outputs[0] || "", outputs, status: "" };
  }));
  presetFormat = null;
  if (rejected) showToast(`${rejected} oversized file${rejected > 1 ? "s were" : " was"} skipped.`);
  else if (duplicates) showToast(`${duplicates} duplicate file${duplicates > 1 ? "s were" : " was"} skipped.`);
  const unsupported = files.filter(item => !item.outputs.length).length;
  if (unsupported) showToast(`${unsupported} selected file${unsupported > 1 ? "s are" : " is"} not supported.`);
  renderFiles();
  if (accepted.length) showPreview(files.length - accepted.length);
}

function clearPreviewUrl() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
}

async function showPreview(index = 0) {
  const item = files[index];
  if (!item) return;
  const requestId = ++previewRequest;
  clearPreviewUrl();
  filePreview.innerHTML = '<div class="preview-loading"><span></span><p>Opening your file...</p></div>';

  if (item.file.type.startsWith("video/")) {
    previewUrl = URL.createObjectURL(item.file);
    filePreview.innerHTML = `<video controls preload="metadata" src="${previewUrl}"></video>`;
    return;
  }
  if (item.file.type.startsWith("audio/")) {
    previewUrl = URL.createObjectURL(item.file);
    filePreview.innerHTML = `<audio controls preload="metadata" src="${previewUrl}"></audio>`;
    return;
  }

  try {
    await apiReady;
    const body = new FormData();
    body.append("file", item.file);
    const response = await fetch(`${apiBase}/api/preview`, { method: "POST", body });
    if (!response.ok) throw new Error("Preview unavailable");
    const blob = await response.blob();
    if (requestId !== previewRequest) return;
    previewUrl = URL.createObjectURL(blob);
    filePreview.innerHTML = `<img src="${previewUrl}" alt="Preview of ${escapeHtml(item.file.name)}">`;
  } catch {
    if (requestId !== previewRequest) return;
    filePreview.innerHTML = `<div class="preview-unavailable"><b>${escapeHtml(item.file.name)}</b><p>Preview is unavailable, but this file can still be converted.</p></div>`;
  }
}

function renderFiles() {
  fileList.innerHTML = "";
  queue.hidden = files.length === 0;
  queueEmpty.hidden = files.length > 0;
  fileCount.textContent = files.length;

  files.forEach((item, index) => {
    const ext = item.file.name.split(".").pop().toUpperCase().slice(0, 5) || "FILE";
    const statusClass = item.state ? `is-${item.state}` : "";
    const statusText = item.status || formatBytes(item.file.size);
    const statusIcon = item.state === "complete" ? "✓" : item.state === "failed" ? "!" : item.state === "working" ? "↻" : "";
    const formatText = item.state
      ? `${item.output}${item.state === "complete" ? " ✓" : item.state === "working" ? " ..." : item.state === "failed" ? " !" : ""}`
      : "Select output";
    const row = document.createElement("div");
    row.className = `file-item ${statusClass}`;
    row.dataset.index = index;
    row.innerHTML = `
      <span class="type-badge">${escapeHtml(ext)}</span>
      <span class="file-meta">
        <b title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</b>
        <small class="${statusClass}">${statusIcon ? `<b>${statusIcon}</b>` : ""}${escapeHtml(statusText)}</small>
      </span>
      <span class="output-badge ${statusClass}" title="Download format">${escapeHtml(formatText)}</span>
      <button class="remove-file" data-index="${index}" aria-label="Remove ${escapeHtml(item.file.name)}" ${conversionRunning ? "disabled" : ""}>×</button>
    `;
    fileList.appendChild(row);
  });
  updateQuickFormatButtons();
}

function updateQuickFormatButtons(activeFormat = "") {
  quickFormatButtons.forEach(button => {
    const format = button.dataset.output;
    const compatibleCount = files.filter(item => item.outputs.includes(format)).length;
    button.disabled = conversionRunning || (files.length > 0 && compatibleCount === 0);
    button.classList.toggle("is-active", format === activeFormat);
    button.title = files.length
      ? compatibleCount
        ? `Convert ${compatibleCount} selected file${compatibleCount > 1 ? "s" : ""} to ${format}`
        : `${format} is not available for the selected file`
      : `Upload a file, then download it as ${format}`;
  });
  formatHint.textContent = files.length
    ? `${files.length} file${files.length > 1 ? "s" : ""} ready — choose any available format`
    : "Upload a file, then choose its new format";
}

chooseButton.addEventListener("click", event => {
  event.stopPropagation();
  fileInput.click();
});
uploadZone.addEventListener("click", () => fileInput.click());
uploadZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") fileInput.click();
});
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
  fileInput.accept = "";
});

["dragenter", "dragover"].forEach(type => uploadZone.addEventListener(type, event => {
  event.preventDefault();
  uploadZone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach(type => uploadZone.addEventListener(type, event => {
  event.preventDefault();
  uploadZone.classList.remove("is-dragging");
}));
uploadZone.addEventListener("drop", event => addFiles(event.dataTransfer.files));

fileList.addEventListener("click", event => {
  const row = event.target.closest(".file-item");
  if (row && !event.target.closest(".remove-file")) {
    showPreview(Number(row.dataset.index));
    return;
  }
  const button = event.target.closest(".remove-file");
  if (!button) return;
  files.splice(Number(button.dataset.index), 1);
  renderFiles();
  if (files.length) showPreview(0);
  else clearPreviewUrl();
});
clearButton.addEventListener("click", () => {
  files = [];
  clearPreviewUrl();
  renderFiles();
});
addButton.addEventListener("click", () => {
  fileInput.accept = "";
  fileInput.click();
});

document.querySelectorAll(".format-card").forEach(card => {
  card.addEventListener("click", () => {
    presetFormat = card.dataset.to;
    fileInput.accept = card.dataset.from;
    fileInput.click();
  });
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("convertly-theme", document.body.classList.contains("dark") ? "dark" : "light");
});
if (localStorage.getItem("convertly-theme") === "dark") document.body.classList.add("dark");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function startDirectDownload(downloadUrl, filename) {
  const link = document.createElement("a");
  link.href = new URL(downloadUrl, apiBase || location.origin).href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function convertItem(item, index) {
  await apiReady;
  item.status = "Uploading...";
  item.state = "working";
  renderFiles();
  const body = new FormData();
  body.append("file", item.file);
  body.append("output", item.output.toLowerCase());
  let response = await fetch(`${apiBase}/api/convert?delivery=url`, { method: "POST", body });
  if (response.status === 404 || response.status === 405) {
    const fallbackBase = "http://127.0.0.1:4173";
    if (apiBase !== fallbackBase) {
      apiBase = fallbackBase;
      response = await fetch(`${apiBase}/api/convert?delivery=url`, { method: "POST", body });
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Conversion failed (${response.status})`);
  }
  item.status = "Downloading...";
  renderFiles();
  const result = await response.json();
  if (!result.downloadUrl || !result.filename) throw new Error("The server returned an invalid download.");
  startDirectDownload(result.downloadUrl, result.filename);
  files[index].status = `${result.format} downloaded`;
  files[index].state = "complete";
  renderFiles();
}

async function runConversions(forcedOutput = "") {
  if (conversionRunning) return;
  const targets = files
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => forcedOutput ? item.outputs.includes(forcedOutput) : Boolean(item.output));
  const convertible = targets.map(({ item }) => item);
  if (!convertible.length) {
    showToast(forcedOutput ? `The selected file cannot be converted to ${forcedOutput}.` : "Choose a supported file first.");
    return;
  }
  if (forcedOutput) {
    targets.forEach(({ item }) => { item.output = forcedOutput; });
    renderFiles();
    updateQuickFormatButtons(forcedOutput);
  }
  conversionRunning = true;
  batchProgress.hidden = false;
  progressBar.style.width = "0%";
  progressValue.textContent = "0%";
  progressLabel.textContent = `Converting to ${forcedOutput}...`;
  renderFiles();
  let completed = 0;
  let failed = 0;

  try {
    for (const { item, index } of targets) {
      try {
        await convertItem(item, index);
        completed++;
      } catch (error) {
        failed++;
        item.status = "Failed";
        item.state = "failed";
        renderFiles();
        showToast(error.message);
      }
      const progress = Math.round(((completed + failed) / targets.length) * 100);
      progressBar.style.width = `${progress}%`;
      progressValue.textContent = `${progress}%`;
      progressLabel.textContent = progress === 100 ? "Conversion complete" : `${completed + failed} of ${targets.length} files processed`;
    }
    if (completed) showToast(`${completed} file${completed > 1 ? "s" : ""} converted and downloaded${failed ? `; ${failed} failed` : ""}.`);
  } finally {
    conversionRunning = false;
    updateQuickFormatButtons();
    renderFiles();
    setTimeout(() => { batchProgress.hidden = true; }, 2200);
  }
}

quickFormatButtons.forEach(button => {
  button.addEventListener("click", () => {
    const output = button.dataset.output;
    if (!files.length) {
      presetFormat = output;
      fileInput.accept = "";
      fileInput.click();
      return;
    }
    runConversions(output);
  });
});

updateQuickFormatButtons();
