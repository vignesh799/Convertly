const express = require("express");
const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const crypto = require("node:crypto");
const { capabilities, convertFile, mimeTypes, extensionOf } = require("./converter");

const app = express();
const port = Number(process.env.PORT) || 4173;
const uploadDir = path.join(os.tmpdir(), "convertly-uploads");
const downloadDir = path.join(os.tmpdir(), "convertly-downloads");
const maxFileSize = 500 * 1024 * 1024;
const pendingDownloads = new Map();
const downloadLifetimeMs = 10 * 60 * 1000;

function contentDisposition(filename) {
  const asciiName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function createDownload(result, filename) {
  await fs.mkdir(downloadDir, { recursive: true });
  const token = crypto.randomUUID();
  const filePath = path.join(downloadDir, token);
  await fs.writeFile(filePath, result.buffer);
  const download = {
    filePath,
    filename,
    extension: result.extension,
    mimeType: mimeTypes[result.extension] || "application/octet-stream",
    expiresAt: Date.now() + downloadLifetimeMs
  };
  pendingDownloads.set(token, download);
  const timer = setTimeout(async () => {
    pendingDownloads.delete(token);
    await fs.rm(filePath, { force: true }).catch(() => {});
  }, downloadLifetimeMs);
  timer.unref?.();
  return token;
}

const storage = multer.diskStorage({
  destination: async (_request, _file, callback) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      callback(null, uploadDir);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_request, _file, callback) => callback(null, crypto.randomUUID())
});
const upload = multer({ storage, limits: { fileSize: maxFileSize, files: 1 } });

app.disable("x-powered-by");
app.use((request, response, next) => {
  const origin = request.headers.origin;
  const isLocalOrigin = !origin
    || origin === "null"
    || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
  if (isLocalOrigin && origin) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
  }
  response.set("Access-Control-Expose-Headers", "Content-Disposition");
  if (request.method === "OPTIONS") {
    response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    return response.sendStatus(204);
  }
  next();
});
app.use(express.static(__dirname, {
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  extensions: ["html"]
}));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "Convertly", version: "1.0.0" });
});

app.get("/api/formats", (_request, response) => {
  response.json(capabilities);
});

app.get("/api/download/:token", async (request, response) => {
  const download = pendingDownloads.get(request.params.token);
  if (!download || download.expiresAt < Date.now()) {
    return response.status(404).send("This download link has expired.");
  }
  pendingDownloads.delete(request.params.token);
  response.set({
    "Content-Type": download.mimeType,
    "Content-Disposition": contentDisposition(download.filename),
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-Convertly-Format": download.extension.toUpperCase()
  });
  response.sendFile(download.filePath, async error => {
    await fs.rm(download.filePath, { force: true }).catch(() => {});
    if (error && !response.headersSent) response.status(error.statusCode || 500).end();
  });
});

app.post("/api/convert", upload.single("file"), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: "Choose a file to convert." });
  const output = String(request.body.output || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const originalBase = path.basename(request.file.originalname, path.extname(request.file.originalname))
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 100) || "converted";

  try {
    const result = await convertFile(request.file.path, request.file.originalname, output);
    const filename = `${originalBase}${result.suffix || ""}.${result.extension}`;
    if (request.query.delivery === "url") {
      const token = await createDownload(result, filename);
      return response.set("Cache-Control", "no-store").json({
        filename,
        format: result.extension.toUpperCase(),
        downloadUrl: `/api/download/${token}`
      });
    }
    response.set({
      "Content-Type": mimeTypes[result.extension] || "application/octet-stream",
      "Content-Disposition": contentDisposition(filename),
      "Content-Length": String(result.buffer.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Convertly-Format": result.extension.toUpperCase()
    });
    response.send(result.buffer);
  } catch (error) {
    console.error(error);
    response.status(422).json({ error: error.message || "The file could not be converted." });
  } finally {
    await fs.rm(request.file.path, { force: true }).catch(() => {});
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return response.status(413).json({ error: "That file is larger than the 500 MB limit." });
  }
  console.error(error);
  response.status(500).json({ error: "Something went wrong while processing the file." });
});

const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Convertly is ready on ${host}:${port}`);
});
