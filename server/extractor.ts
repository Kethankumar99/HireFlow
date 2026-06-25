import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';

export function cleanText(text: string): string {
  if (!text) return "";
  
  // 1. Remove emojis gracefully without discarding surrounding content
  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F170}-\u{1F251}\u{2600}-\u{26FF}\u{1F000}-\u{1FFFF}]/gu;
  let cleaned = text.replace(emojiPattern, " ");

  // 2. Split into lines, normalize whitespace per line, and keep them
  const lines = cleaned.split(/\r?\n/);
  const filteredLines = lines.map(line => {
    let trimmed = line.trim();
    // Keep standard ASCII characters to avoid corruption while preserving text
    trimmed = trimmed.replace(/[^\x00-\x7F]/g, ""); 
    // Normalize inline multiple spacing to single spaces
    trimmed = trimmed.replace(/[ \t]+/g, " "); 
    return trimmed;
  }).filter(line => {
    if (!line) return false;
    // Filter out obvious visual/markdown separator lines
    if (line.includes("+---") || line.includes("----") || line.match(/^[|+-]+$/)) {
      return false;
    }
    return true;
  });

  // Re-join with real newlines so layout and paragraphs are preserved
  cleaned = filteredLines.join("\n");

  // Keep up to 16,000 characters to ensure full content parsing
  return cleaned.slice(0, 16000);
}

export class DocumentExtractor {
  static async fromPdf(fileBuffer: Buffer): Promise<string> {
    try {
      // Validate that buffer starts with %PDF header
      const isPdfHeader = fileBuffer.length >= 4 && fileBuffer.toString('ascii', 0, 4) === '%PDF';
      if (!isPdfHeader) {
        console.warn("PDF header not found. Attempting UTF-8 printable string extraction fallback.");
        const rawText = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\r\n\t]/g, ' ');
        return cleanText(rawText);
      }

      const parser = new PDFParse({ data: fileBuffer });
      const parsed = await parser.getText();
      await parser.destroy();
      return cleanText(parsed.text || "");
    } catch (error) {
      console.error("Error extracting PDF text (invalid structure or parsing error):", error);
      // Fallback: extract printable characters to make sure we don't block the upload
      const rawText = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\r\n\t]/g, ' ');
      const cleaned = cleanText(rawText);
      if (cleaned.trim().length > 50) {
        return cleaned;
      }
      return "[Unreadable PDF structure. Fallback text could not be parsed.]";
    }
  }

  static async fromDocx(fileBuffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return cleanText(result.value || "");
    } catch (error) {
      console.error("Error extracting DOCX text:", error);
      throw new Error("Failed to parse DOCX document.");
    }
  }

  static fromTxt(fileBuffer: Buffer): string {
    try {
      const text = fileBuffer.toString('utf-8');
      return cleanText(text);
    } catch (error) {
      console.error("Error reading TXT file:", error);
      throw new Error("Failed to read TXT file.");
    }
  }

  static async processZip(zipBuffer: Buffer): Promise<Array<{ filename: string; text: string; base64: string; mimeType: string }>> {
    const results: Array<{ filename: string; text: string; base64: string; mimeType: string }> = [];
    try {
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;

        const filename = entry.name;
        const lowercaseName = filename.toLowerCase();
        const entryBuffer = entry.getData();
        const base64 = entryBuffer.toString('base64');

        let text = "";
        let mimeType = "application/octet-stream";

        if (lowercaseName.endsWith('.pdf')) {
          text = await this.fromPdf(entryBuffer);
          mimeType = "application/pdf";
        } else if (lowercaseName.endsWith('.docx')) {
          text = await this.fromDocx(entryBuffer);
          mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        } else if (lowercaseName.endsWith('.txt')) {
          text = this.fromTxt(entryBuffer);
          mimeType = "text/plain";
        } else if (lowercaseName.endsWith('.zip')) {
          // Recursive extraction for nested zip-in-zip
          const nestedResults = await this.processZip(entryBuffer);
          results.push(...nestedResults);
          continue;
        } else {
          // Unsupported file type inside zip, skip
          continue;
        }

        // Use base name of file for storage and clean display
        const cleanFilename = filename.includes('/') ? filename.split('/').pop() || filename : filename;

        results.push({
          filename: cleanFilename,
          text,
          base64,
          mimeType
        });
      }
    } catch (error) {
      console.error("Error processing ZIP file:", error);
      throw new Error("Failed to extract ZIP package.");
    }
    return results;
  }
}
