# Convertly

A private file-conversion web app. Files are processed locally by the Node.js server and deleted from its temporary upload directory after every request.

## Run

```powershell
npm install
npm start
```

Open `http://127.0.0.1:4173`.

## Supported conversions

- Images: JPG, PNG, WebP, AVIF, TIFF and image-to-PDF
- PDF: DOCX, TXT, JPG and PNG (multi-page image exports download as ZIP)
- Documents/text: DOCX, TXT, Markdown, JSON, XML and HTML to common document formats
- Spreadsheets: XLSX and CSV to XLSX, CSV, PDF or HTML
- Audio: MP3, WAV, AAC, OGG, FLAC and M4A
- Video: MP4, WebM, MOV, MKV, AVI, GIF and audio extraction

Text-based PDF and Word conversions prioritize readable content. Exact page-layout reproduction requires a commercial document-rendering service or a LibreOffice installation.
