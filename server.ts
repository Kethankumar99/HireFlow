import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { DocumentExtractor } from "./server/extractor.js";
import { AIRecruitmentEngine } from "./server/engine.js";

// Load environment variables
dotenv.config();

// In-memory cache for storing resume PDF bytes securely to bypass iframe/Chrome data URI blocking
const pdfCache = new Map<string, { base64: string; mimeType: string; filename: string }>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configure high body parsing limits for uploading multiple resumes
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));

  // Initialize the AIRecruitmentEngine
  const engine = new AIRecruitmentEngine();

  // API: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date() });
  });

  // API: Extractor endpoint
  app.post("/api/extract", async (req, res) => {
    try {
      const { files, startIndex = 1 } = req.body;
      if (!files || !Array.isArray(files)) {
        return res.status(400).json({ error: "Missing 'files' array in request body." });
      }

      const results: Array<{
        id: string;
        filename: string;
        text: string;
        base64: string;
        mimeType: string;
      }> = [];

      let currentIdNum = startIndex;

      const formatId = (num: number) => `RES-${String(num).padStart(4, "0")}`;

      for (const file of files) {
        const { filename, base64, mimeType } = file;
        if (!filename || !base64) continue;

        const buffer = Buffer.from(base64, "base64");
        const lowercaseName = filename.toLowerCase();

        if (lowercaseName.endsWith(".zip") || mimeType === "application/zip" || mimeType === "application/x-zip-compressed") {
          // Extract zip package contents
          try {
            const extracted = await DocumentExtractor.processZip(buffer);
            for (const item of extracted) {
              results.push({
                id: formatId(currentIdNum++),
                filename: item.filename,
                text: item.text,
                base64: item.base64,
                mimeType: item.mimeType,
              });
            }
          } catch (zipError) {
            console.error(`Error processing zip entry ${filename}:`, zipError);
          }
        } else if (lowercaseName.endsWith(".pdf") || mimeType === "application/pdf") {
          try {
            const text = await DocumentExtractor.fromPdf(buffer);
            results.push({
              id: formatId(currentIdNum++),
              filename,
              text,
              base64,
              mimeType: "application/pdf",
            });
          } catch (pdfError) {
            console.error(`Error processing PDF ${filename}:`, pdfError);
          }
        } else if (lowercaseName.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          try {
            const text = await DocumentExtractor.fromDocx(buffer);
            results.push({
              id: formatId(currentIdNum++),
              filename,
              text,
              base64,
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });
          } catch (docxError) {
            console.error(`Error processing DOCX ${filename}:`, docxError);
          }
        } else if (lowercaseName.endsWith(".txt") || mimeType === "text/plain") {
          try {
            const text = DocumentExtractor.fromTxt(buffer);
            results.push({
              id: formatId(currentIdNum++),
              filename,
              text,
              base64,
              mimeType: "text/plain",
            });
          } catch (txtError) {
            console.error(`Error processing TXT ${filename}:`, txtError);
          }
        }
      }

      // Cache the extracted results in memory so they can be loaded cleanly via standard same-origin HTTP URLs
      for (const item of results) {
        pdfCache.set(item.id, {
          base64: item.base64,
          mimeType: item.mimeType,
          filename: item.filename
        });
      }

      res.json({ results });
    } catch (error: any) {
      console.error("General extraction route error:", error);
      res.status(500).json({ error: error?.message || "Internal server error during extraction." });
    }
  });

  // API: Get Resume PDF from same-origin HTTP to avoid Chrome block
  app.get("/api/resume-pdf/:id", (req, res) => {
    try {
      const fileId = req.params.id;
      const file = pdfCache.get(fileId);
      if (!file) {
        return res.status(404).send("Candidate document not found in session cache.");
      }
      
      const buffer = Buffer.from(file.base64, "base64");
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.filename)}"`);
      return res.send(buffer);
    } catch (err: any) {
      console.error("Error serving resume PDF:", err);
      return res.status(500).send("Error rendering document.");
    }
  });

  // API: Analysis/Scoring endpoint
  app.post("/api/analyze", async (req, res) => {
    try {
      const { jdText, resumes } = req.body;
      if (!jdText) {
        return res.status(400).json({ error: "Job description is empty." });
      }
      if (!resumes || !Array.isArray(resumes) || resumes.length === 0) {
        return res.status(400).json({ error: "No resumes provided for analysis." });
      }

      const results = await engine.scoreCandidates(jdText, resumes, 5);
      res.json({ results, provider: engine.lastUsedProvider });
    } catch (error: any) {
      console.error("General analysis route error:", error);
      res.status(500).json({ error: error?.message || "Internal server error during candidate analysis." });
    }
  });

  // Handle Vite Asset Serving & Fallbacks
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DeepHire server actively listening on port ${PORT}`);
  });
}

startServer();
