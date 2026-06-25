import re
import zipfile
import io
import fitz # PyMuPDF
import docx # python-docx

class DocumentExtractor:
    @staticmethod
    def clean_text(text: str) -> str:
        if not text:
            return ""
        
        # Remove emojis
        emoji_pattern = re.compile(
            "["
            "\U0001f600-\U0001f64f|"  # emoticons
            "\U0001f300-\U0001f5ff|"  # symbols & pictographs
            "\U0001f680-\U0001f6ff|"  # transport & map symbols
            "\U0001f1e0-\U0001f1ff|"  # flags
            "\u2700-\u27bf|"          # dingbats
            "\U0001f900-\U0001f9ff"   # supplemental symbols
            "]+", flags=re.UNICODE
        )
        cleaned = emoji_pattern.sub("", text)
        
        # Remove table structures (lines with | or +---)
        lines = cleaned.splitlines()
        filtered_lines = []
        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                filtered_lines.append("")
                continue
            
            # Filter markdown or text-based table artifacts
            if "+---" in trimmed or "|" in trimmed or re.match(r'^[|\-+\s]+$', trimmed):
                continue
                
            # Filter lines with >30% non-alpha characters (letters vs total non-space characters < 70%)
            non_space = trimmed.replace(" ", "")
            if len(non_space) > 0:
                alpha_count = sum(c.isalpha() for c in non_space)
                alpha_ratio = alpha_count / len(non_space)
                if alpha_ratio < 0.7:  # Meaning non-alpha makes up >30%
                    continue
            filtered_lines.append(line)
            
        cleaned = "\n".join(filtered_lines)
        
        # Remove unusual characters and normalize whitespace to return clean plain text
        cleaned = re.sub(r'[^\x20-\x7E\s]', '', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        return cleaned[:8000]

    @classmethod
    def from_pdf(cls, file_bytes: bytes) -> str:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
            return cls.clean_text(text)
        except Exception as e:
            print(f"Error in from_pdf: {e}")
            return ""

    @classmethod
    def from_docx(cls, file_bytes: bytes) -> str:
        try:
            doc_file = io.BytesIO(file_bytes)
            doc = docx.Document(doc_file)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return cls.clean_text(text)
        except Exception as e:
            print(f"Error in from_docx: {e}")
            return ""

    @classmethod
    def from_txt(cls, file_bytes: bytes) -> str:
        try:
            text = file_bytes.decode('utf-8', errors='ignore')
            return cls.clean_text(text)
        except Exception as e:
            print(f"Error in from_txt: {e}")
            return ""

    @classmethod
    def process_zip(cls, zip_bytes: bytes):
        results = []
        try:
            zip_file = io.BytesIO(zip_bytes)
            with zipfile.ZipFile(zip_file) as z:
                for filename in z.namelist():
                    # Skip folders or Apple metadata folders
                    if filename.endswith('/') or filename.startswith('__MACOSX'):
                        continue
                    
                    with z.open(filename) as f:
                        content = f.read()
                        
                    ext = filename.split('.')[-1].lower()
                    text = ""
                    if ext == "pdf":
                        text = cls.from_pdf(content)
                    elif ext == "docx":
                        text = cls.from_docx(content)
                    elif ext in ["txt", "md"]:
                        text = cls.from_txt(content)
                    elif ext == "zip":
                        # Recursive extraction for zip-in-zip
                        nested_results = cls.process_zip(content)
                        results.extend(nested_results)
                        continue
                    else:
                        continue
                        
                    # Filter out path components for filename storing if we want base names
                    clean_filename = filename.split('/')[-1] if '/' in filename else filename
                    results.append({
                        "filename": clean_filename,
                        "text": text,
                        "raw_bytes": content
                    })
        except Exception as e:
            print(f"Error in process_zip: {e}")
        return results
