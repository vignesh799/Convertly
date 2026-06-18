const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const sharp = require("sharp");
const ExcelJS = require("exceljs");
const ffmpegPath = require("ffmpeg-static");
const { convertFile } = require("../converter");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "convertly-test-"));
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}

test("converts text to PDF and DOCX", async () => withTempDirectory(async directory => {
  const input = path.join(directory, "notes.txt");
  await fs.writeFile(input, "Convertly test\nSecond line");
  const pdf = await convertFile(input, "notes.txt", "pdf");
  const docx = await convertFile(input, "notes.txt", "docx");
  assert.equal(pdf.extension, "pdf");
  assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
  assert.equal(docx.extension, "docx");
  assert.equal(docx.buffer.subarray(0, 2).toString(), "PK");
}));

test("offers document quick downloads as DOCX, JPG, PNG and ZIP", async () => withTempDirectory(async directory => {
  const source = path.join(directory, "source.txt");
  const docxPath = path.join(directory, "assignment.docx");
  await fs.writeFile(source, "Assignment quick format test");
  const created = await convertFile(source, "source.txt", "docx");
  await fs.writeFile(docxPath, created.buffer);
  const sameDocx = await convertFile(docxPath, "assignment.docx", "docx");
  const jpg = await convertFile(docxPath, "assignment.docx", "jpg");
  const png = await convertFile(docxPath, "assignment.docx", "png");
  const zip = await convertFile(docxPath, "assignment.docx", "zip");
  assert.equal(sameDocx.buffer.subarray(0, 2).toString(), "PK");
  assert.equal(jpg.buffer.subarray(0, 2).toString("hex"), "ffd8");
  assert.equal(png.buffer.subarray(1, 4).toString(), "PNG");
  assert.equal(zip.buffer.subarray(0, 2).toString(), "PK");
}));

test("converts PNG to JPG and PDF", async () => withTempDirectory(async directory => {
  const input = path.join(directory, "sample.png");
  await sharp({ create: { width: 120, height: 80, channels: 4, background: "#58a77e" } }).png().toFile(input);
  const jpg = await convertFile(input, "sample.png", "jpg");
  const pdf = await convertFile(input, "sample.png", "pdf");
  assert.equal(jpg.buffer.subarray(0, 2).toString("hex"), "ffd8");
  assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
}));

test("converts CSV to XLSX and PDF", async () => withTempDirectory(async directory => {
  const input = path.join(directory, "people.csv");
  await fs.writeFile(input, "Name,Score\nAda,10\nLinus,9\n");
  const xlsx = await convertFile(input, "people.csv", "xlsx");
  const pdf = await convertFile(input, "people.csv", "pdf");
  assert.equal(xlsx.buffer.subarray(0, 2).toString(), "PK");
  assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.buffer);
  assert.equal(workbook.worksheets[0].getCell("A2").text, "Ada");
}));

test("converts PDF to text and PNG", async () => withTempDirectory(async directory => {
  const source = path.join(directory, "source.txt");
  const pdfPath = path.join(directory, "source.pdf");
  await fs.writeFile(source, "A readable PDF");
  const pdf = await convertFile(source, "source.txt", "pdf");
  await fs.writeFile(pdfPath, pdf.buffer);
  const text = await convertFile(pdfPath, "source.pdf", "txt");
  const png = await convertFile(pdfPath, "source.pdf", "png");
  assert.match(text.buffer.toString(), /readable PDF/);
  assert.equal(png.extension, "png");
  assert.equal(png.buffer.subarray(1, 4).toString(), "PNG");
}));

test("converts WAV to MP3", async () => withTempDirectory(async directory => {
  const wavPath = path.join(directory, "tone.wav");
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", wavPath]);
  const mp3 = await convertFile(wavPath, "tone.wav", "mp3");
  assert.equal(mp3.extension, "mp3");
  assert.ok(mp3.buffer.length > 100);
}));
