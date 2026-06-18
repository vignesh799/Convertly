const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");
const { PDFDocument: PDFLibDocument } = require("pdf-lib");
const mammoth = require("mammoth");
const { Document, Packer, Paragraph, TextRun, ImageRun } = require("docx");
const ExcelJS = require("exceljs");
const archiver = require("archiver");
const ffmpegPath = require("ffmpeg-static");

const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "avif", "tiff", "gif"]);
const MEDIA_FORMATS = new Set(["mp3", "wav", "aac", "ogg", "flac", "m4a", "mp4", "webm", "mov", "mkv", "avi", "gif"]);
const TEXT_FORMATS = new Set(["txt", "md", "json", "xml", "html", "htm"]);
const SHEET_FORMATS = new Set(["xlsx", "csv"]);

const capabilities = {
  jpg: ["jpg", "png", "webp", "avif", "tiff", "pdf", "docx", "zip"],
  jpeg: ["jpeg", "jpg", "png", "webp", "avif", "tiff", "pdf", "docx", "zip"],
  png: ["png", "jpg", "webp", "avif", "tiff", "pdf", "docx", "zip"],
  webp: ["webp", "jpg", "png", "avif", "tiff", "pdf", "docx", "zip"],
  avif: ["avif", "jpg", "png", "webp", "tiff", "pdf", "docx", "zip"],
  tiff: ["tiff", "jpg", "png", "webp", "avif", "pdf", "docx", "zip"],
  gif: ["gif", "mp4", "webm", "jpg", "png", "webp", "zip"],
  pdf: ["pdf", "docx", "txt", "jpg", "png", "zip"],
  docx: ["docx", "pdf", "txt", "html", "jpg", "png", "zip"],
  txt: ["txt", "pdf", "docx", "html", "jpg", "png", "zip"],
  md: ["md", "pdf", "docx", "html", "txt", "jpg", "png", "zip"],
  json: ["json", "pdf", "docx", "html", "txt", "jpg", "png", "zip"],
  xml: ["xml", "pdf", "docx", "html", "txt", "jpg", "png", "zip"],
  html: ["html", "pdf", "docx", "txt", "jpg", "png", "zip"],
  htm: ["htm", "pdf", "docx", "txt", "jpg", "png", "zip"],
  xlsx: ["xlsx", "csv", "pdf", "html", "jpg", "png", "zip"],
  csv: ["csv", "xlsx", "pdf", "html", "jpg", "png", "zip"],
  mp3: ["mp3", "wav", "aac", "ogg", "flac", "m4a", "zip"],
  wav: ["wav", "mp3", "aac", "ogg", "flac", "m4a", "zip"],
  aac: ["aac", "mp3", "wav", "ogg", "flac", "m4a", "zip"],
  ogg: ["ogg", "mp3", "wav", "aac", "flac", "m4a", "zip"],
  flac: ["flac", "mp3", "wav", "aac", "ogg", "m4a", "zip"],
  m4a: ["m4a", "mp3", "wav", "aac", "ogg", "flac", "zip"],
  mp4: ["mp4", "webm", "mov", "mkv", "avi", "gif", "mp3", "wav", "jpg", "png", "zip"],
  webm: ["webm", "mp4", "mov", "mkv", "avi", "gif", "mp3", "wav", "jpg", "png", "zip"],
  mov: ["mov", "mp4", "webm", "mkv", "avi", "gif", "mp3", "wav", "jpg", "png", "zip"],
  mkv: ["mkv", "mp4", "webm", "mov", "avi", "gif", "mp3", "wav", "jpg", "png", "zip"],
  avi: ["avi", "mp4", "webm", "mov", "mkv", "gif", "mp3", "wav", "jpg", "png", "zip"]
};

const mimeTypes = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  avif: "image/avif", tiff: "image/tiff", gif: "image/gif", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain; charset=utf-8", html: "text/html; charset=utf-8", csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac",
  m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mkv: "video/x-matroska", avi: "video/x-msvideo", zip: "application/zip"
};

function extensionOf(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

function stripHtml(input) {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeHtml(input) {
  return input.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function textToPdf(text, title) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const document = new PDFDocument({ margin: 54, size: "A4", info: { Title: title } });
    document.on("data", chunk => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.font("Helvetica-Bold").fontSize(18).fillColor("#246b52").text(title, { width: 487 });
    document.moveDown(.8).font("Helvetica").fontSize(10.5).fillColor("#17201d")
      .text(text || " ", { lineGap: 3, width: 487 });
    document.end();
  });
}

async function textToDocx(text, title) {
  const paragraphs = [new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 34, color: "246B52" })],
    spacing: { after: 300 }
  })];
  for (const line of text.split(/\r?\n/)) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: line || " ", size: 21 })] }));
  }
  const document = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBuffer(document);
}

async function imageToDocx(inputPath, title) {
  const image = await sharp(inputPath).rotate().png().toBuffer();
  const metadata = await sharp(image).metadata();
  const maxWidth = 600;
  const scale = Math.min(maxWidth / metadata.width, 1);
  const document = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 32, color: "246B52" })], spacing: { after: 240 } }),
    new Paragraph({ children: [new ImageRun({ data: image, transformation: { width: Math.round(metadata.width * scale), height: Math.round(metadata.height * scale) } })] })
  ] }] });
  return Packer.toBuffer(document);
}

async function textToImage(text, title, outputExt) {
  const { createCanvas } = require("@napi-rs/canvas");
  const width = 1240;
  const padding = 80;
  const fontSize = 28;
  const lineHeight = 42;
  const maxCharacters = 72;
  const lines = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      if (`${line} ${word}`.trim().length > maxCharacters) {
        lines.push(line);
        line = word;
      } else {
        line = `${line} ${word}`.trim();
      }
    }
    lines.push(line);
  }
  const visibleLines = lines.slice(0, 160);
  const height = Math.max(520, padding * 2 + 80 + visibleLines.length * lineHeight);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffefa";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#246b52";
  context.font = "bold 42px Arial";
  context.fillText(title.slice(0, 46), padding, padding + 20);
  context.fillStyle = "#17201d";
  context.font = `${fontSize}px Arial`;
  visibleLines.forEach((line, index) => context.fillText(line, padding, padding + 90 + index * lineHeight));
  return outputExt === "jpg" ? canvas.toBuffer("image/jpeg", 90) : canvas.toBuffer("image/png");
}

async function extractText(inputPath, inputExt) {
  const buffer = await fs.readFile(inputPath);
  if (inputExt === "pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
    const pages = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(" ").trim());
    }
    return pages.join("\n\n").trim();
  }
  if (inputExt === "docx") return (await mammoth.extractRawText({ buffer })).value.trim();
  const raw = buffer.toString("utf8");
  return ["html", "htm"].includes(inputExt) ? stripHtml(raw) : raw;
}

async function convertImage(inputPath, outputExt) {
  const image = sharp(inputPath).rotate();
  if (outputExt === "pdf") {
    const jpg = await image.flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
    const metadata = await sharp(jpg).metadata();
    const pdf = await PDFLibDocument.create();
    const embedded = await pdf.embedJpg(jpg);
    const maxWidth = 595.28;
    const maxHeight = 841.89;
    const scale = Math.min(maxWidth / metadata.width, maxHeight / metadata.height, 1);
    const width = metadata.width * scale;
    const height = metadata.height * scale;
    const page = pdf.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
    return { buffer: Buffer.from(await pdf.save()), extension: "pdf" };
  }
  const normalized = outputExt === "jpg" ? "jpeg" : outputExt;
  const options = normalized === "jpeg" ? { quality: 92 } : normalized === "png" ? { compressionLevel: 8 } : { quality: 88 };
  return { buffer: await image.toFormat(normalized, options).toBuffer(), extension: outputExt };
}

async function loadWorkbook(inputPath, inputExt) {
  const workbook = new ExcelJS.Workbook();
  if (inputExt === "csv") await workbook.csv.readFile(inputPath);
  else await workbook.xlsx.readFile(inputPath);
  return workbook;
}

function workbookToHtml(workbook) {
  let body = "";
  workbook.eachSheet(sheet => {
    body += `<h2>${escapeHtml(sheet.name)}</h2><table>`;
    sheet.eachRow(row => {
      body += "<tr>";
      row.eachCell({ includeEmpty: true }, cell => {
        const value = cell.text || "";
        body += `<td>${escapeHtml(value)}</td>`;
      });
      body += "</tr>";
    });
    body += "</table>";
  });
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:32px;color:#17201d}table{border-collapse:collapse;margin-bottom:32px}td{border:1px solid #ccd3cf;padding:7px 10px}h2{color:#246b52}</style></head><body>${body}</body></html>`;
}

function workbookToText(workbook) {
  const parts = [];
  workbook.eachSheet(sheet => {
    parts.push(sheet.name);
    sheet.eachRow(row => parts.push(row.values.slice(1).map(value => String(value ?? "")).join(" | ")));
    parts.push("");
  });
  return parts.join("\n");
}

async function convertSpreadsheet(inputPath, inputExt, outputExt) {
  const workbook = await loadWorkbook(inputPath, inputExt);
  if (outputExt === "xlsx") return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), extension: "xlsx" };
  if (outputExt === "csv") {
    const tempFile = path.join(os.tmpdir(), `convertly-${crypto.randomUUID()}.csv`);
    try {
      await workbook.csv.writeFile(tempFile);
      return { buffer: await fs.readFile(tempFile), extension: "csv" };
    } finally {
      await fs.rm(tempFile, { force: true });
    }
  }
  if (outputExt === "html") return { buffer: Buffer.from(workbookToHtml(workbook)), extension: "html" };
  return { buffer: await textToPdf(workbookToText(workbook), "Converted spreadsheet"), extension: "pdf" };
}

function runFfmpeg(inputPath, outputPath, outputExt) {
  const args = ["-y", "-i", inputPath];
  if (outputExt === "mp3") args.push("-vn", "-codec:a", "libmp3lame", "-q:a", "2");
  if (outputExt === "wav") args.push("-vn", "-codec:a", "pcm_s16le");
  if (outputExt === "aac") args.push("-vn", "-codec:a", "aac", "-b:a", "192k");
  if (outputExt === "ogg") args.push("-vn", "-codec:a", "libvorbis", "-q:a", "5");
  if (outputExt === "flac") args.push("-vn", "-codec:a", "flac");
  if (outputExt === "m4a") args.push("-vn", "-codec:a", "aac", "-b:a", "192k");
  if (outputExt === "mp4") args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart");
  if (outputExt === "webm") args.push("-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus");
  if (outputExt === "gif") args.push("-vf", "fps=12,scale=720:-1:flags=lanczos");
  if (outputExt === "jpg" || outputExt === "png") args.push("-frames:v", "1");
  args.push(outputPath);
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let errorText = "";
    child.stderr.on("data", chunk => { errorText = (errorText + chunk).slice(-4000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Media conversion failed: ${errorText}`)));
  });
}

async function convertMedia(inputPath, outputExt) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "convertly-media-"));
  const outputPath = path.join(workDir, `output.${outputExt}`);
  try {
    await runFfmpeg(inputPath, outputPath, outputExt);
    return { buffer: await fs.readFile(outputPath), extension: outputExt };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function renderPdfPages(inputPath, outputExt) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = require("@napi-rs/canvas");
  const data = new Uint8Array(await fs.readFile(inputPath));
  const document = await pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: false }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index++) {
    const page = await document.getPage(index);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({
      name: `page-${String(index).padStart(3, "0")}.${outputExt}`,
      buffer: outputExt === "jpg" ? canvas.toBuffer("image/jpeg", 90) : canvas.toBuffer("image/png")
    });
  }
  if (pages.length === 1) return { buffer: pages[0].buffer, extension: outputExt };
  return { buffer: await zipBuffers(pages), extension: "zip", suffix: `-${outputExt}-pages` };
}

function zipBuffers(files) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("data", chunk => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("warning", reject);
    archive.on("error", reject);
    for (const file of files) archive.append(file.buffer, { name: file.name });
    archive.finalize();
  });
}

async function convertFile(inputPath, originalName, requestedOutput) {
  const inputExt = extensionOf(originalName);
  const outputExt = requestedOutput.toLowerCase();
  if (!capabilities[inputExt]?.includes(outputExt)) throw new Error(`Conversion from ${inputExt || "this file"} to ${outputExt} is not supported.`);
  const originalBuffer = await fs.readFile(inputPath);
  if (outputExt === inputExt || (inputExt === "jpeg" && outputExt === "jpg")) {
    return { buffer: originalBuffer, extension: outputExt };
  }
  if (outputExt === "zip") {
    return { buffer: await zipBuffers([{ name: originalName, buffer: originalBuffer }]), extension: "zip" };
  }

  if (IMAGE_FORMATS.has(inputExt) && outputExt === "docx") {
    return { buffer: await imageToDocx(inputPath, path.basename(originalName, path.extname(originalName))), extension: "docx" };
  }
  if (IMAGE_FORMATS.has(inputExt) && outputExt !== "mp4" && outputExt !== "webm") {
    return convertImage(inputPath, outputExt);
  }
  if (MEDIA_FORMATS.has(inputExt) && (MEDIA_FORMATS.has(outputExt) || ["jpg", "png"].includes(outputExt))) {
    return convertMedia(inputPath, outputExt);
  }
  if (inputExt === "pdf" && ["jpg", "png"].includes(outputExt)) {
    return renderPdfPages(inputPath, outputExt);
  }
  if (SHEET_FORMATS.has(inputExt)) {
    if (["jpg", "png"].includes(outputExt)) {
      const workbook = await loadWorkbook(inputPath, inputExt);
      return { buffer: await textToImage(workbookToText(workbook), path.basename(originalName, path.extname(originalName)), outputExt), extension: outputExt };
    }
    return convertSpreadsheet(inputPath, inputExt, outputExt);
  }
  if (inputExt === "docx" && outputExt === "html") {
    const result = await mammoth.convertToHtml({ path: inputPath });
    return { buffer: Buffer.from(`<!doctype html><meta charset="utf-8">${result.value}`), extension: "html" };
  }

  const text = await extractText(inputPath, inputExt);
  const title = path.basename(originalName, path.extname(originalName));
  if (["jpg", "png"].includes(outputExt)) return { buffer: await textToImage(text, title, outputExt), extension: outputExt };
  if (outputExt === "txt") return { buffer: Buffer.from(text), extension: "txt" };
  if (outputExt === "html") return { buffer: Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><pre>${escapeHtml(text)}</pre></body></html>`), extension: "html" };
  if (outputExt === "docx") return { buffer: await textToDocx(text, title), extension: "docx" };
  if (outputExt === "pdf") return { buffer: await textToPdf(text, title), extension: "pdf" };
  throw new Error("No converter is available for this route.");
}

module.exports = { capabilities, convertFile, mimeTypes, extensionOf };
