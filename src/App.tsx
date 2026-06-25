import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  FileText, 
  Eye,
  Upload, 
  Search, 
  ArrowLeft, 
  ArrowRight, 
  FileSpreadsheet, 
  Download, 
  ExternalLink, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp,
  FileCode,
  Check,
  Briefcase,
  Award,
  Users,
  Compass,
  Sparkles,
  Phone,
  Mail,
  User,
  Tag,
  Settings,
  Sliders,
  Trophy
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Helper for extracting and matching skills keywords
interface KeywordMatchResult {
  matched: string[];
  missing: string[];
}

const getKeywordMatches = (jdText: string, resumeText: string): KeywordMatchResult => {
  if (!jdText || !resumeText) return { matched: [], missing: [] };
  
  const cleanJd = jdText.toLowerCase();
  const cleanResume = resumeText.toLowerCase();
  
  const matched: string[] = [];
  const missing: string[] = [];
  
  // Standard high-value technology and business skills list
  const skillsList = [
    "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Scala",
    "React", "Angular", "Vue", "Next.js", "HTML", "CSS", "Tailwind", "Sass", "Redux", "Frontend",
    "Node.js", "Express", "Django", "Flask", "Spring Boot", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Firebase", "Firestore", "GraphQL", "REST API", "Backend",
    "AWS", "GCP", "Azure", "Docker", "Kubernetes", "CI/CD", "Jenkins", "Terraform", "Git", "DevOps",
    "Agile", "Scrum", "Machine Learning", "Deep Learning", "NLP", "AI", "Data Science", "System Design", "Microservices", "Project Management"
  ];
  
  skillsList.forEach(skill => {
    // Escape regex characters
    const escaped = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    
    // Check if skill is mentioned in the JD
    if (regex.test(cleanJd)) {
      // Check if skill is in resume
      if (regex.test(cleanResume)) {
        matched.push(skill);
      } else {
        missing.push(skill);
      }
    }
  });
  
  return { matched, missing };
};

// Define TS Interfaces
interface CandidateResult {
  id: string;
  name: string;
  email: string;
  phone: string;
  overall_score: number;
  technical_depth: number;
  experience_quality: number;
  growth_potential: number;
  cultural_fit: number;
  soft_skills: number;
  relevance_score: number;
  strength: string;
  gap: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  recommendation: string;
}

interface StoredResume {
  filename: string;
  bytesBase64: string;
  text: string;
  mimeType: string;
}

interface UploadedFilePayload {
  filename: string;
  base64: string;
  mimeType: string;
}

export default function App() {
  // Main state variables
  const [jdText, setJdText] = useState<string>("");
  const [jdFileName, setJdFileName] = useState<string>("");
  const [jdFileBase64, setJdFileBase64] = useState<string>("");
  const [jdFileMime, setJdFileMime] = useState<string>("");
  
  const [resumeFiles, setResumeFiles] = useState<UploadedFilePayload[]>([]);
  const [storedResumes, setStoredResumes] = useState<{ [id: string]: StoredResume }>({});
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [page, setPage] = useState<number>(1);
  const [viewResumeId, setViewResumeId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"original" | "parsed">("original");
  const [rankLimit, setRankLimit] = useState<number | 'all'>('all');
  const [customRankInput, setCustomRankInput] = useState<string>("");
  const [activeResultsTab, setActiveResultsTab] = useState<"leaderboard" | "settings">("leaderboard");
  const [showOriginalOverlay, setShowOriginalOverlay] = useState<boolean>(false);
  const [activeProvider, setActiveProvider] = useState<"groq" | "gemini" | "local" | null>(null);
  


  // Processing States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<"extracting" | "analyzing" | "idle">("idle");
  const [progressVal, setProgressVal] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>("");

  const jdFileInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // Helper: File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64Str = (reader.result as string).split(",")[1];
        resolve(base64Str);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Handle JD File Selection
  const handleJdFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    try {
      const b64 = await fileToBase64(file);
      setJdFileName(file.name);
      setJdFileBase64(b64);
      setJdFileMime(file.type);
      // Clear pasted text as file uploader has priority if text area is empty
      // Or if text area has content, we respect the instruction: "If text pasted in area, use that as JD (ignore file)"
    } catch (err) {
      console.error("Error reading Job Description file:", err);
    }
  };

  // Handle Resume Files Selection
  const handleResumesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newList: UploadedFilePayload[] = [...resumeFiles];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const b64 = await fileToBase64(file);
        newList.push({
          filename: file.name,
          base64: b64,
          mimeType: file.type
        });
      } catch (err) {
        console.error(`Error reading resume file ${file.name}:`, err);
      }
    }
    setResumeFiles(newList);
  };

  const handleClearFiles = () => {
    setResumeFiles([]);
    setStoredResumes({});
    setResults([]);
    setPage(1);
    setViewResumeId(null);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
  };

  const handleClearJd = () => {
    setJdText("");
    setJdFileName("");
    setJdFileBase64("");
    setJdFileMime("");
    if (jdFileInputRef.current) jdFileInputRef.current.value = "";
  };

  // Run the core Pipeline
  const runMatchPipeline = async () => {
    // 1. Validations
    let finalJdContent = jdText.trim();
    
    if (!finalJdContent && !jdFileBase64) {
      alert("Please enter a job description or upload a JD document.");
      return;
    }
    
    if (resumeFiles.length === 0) {
      alert("Please upload at least one resume or ZIP file containing resumes.");
      return;
    }

    setIsProcessing(true);
    setPage(1);
    
    try {
      // Step A: Extract JD Text if pasted is empty
      if (!finalJdContent && jdFileBase64) {
        setProcessingStep("extracting");
        setProgressVal(15);
        setProgressText("Extracting Job Description text...");
        
        const jdRes = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [{ filename: jdFileName, base64: jdFileBase64, mimeType: jdFileMime }]
          })
        });
        
        if (!jdRes.ok) throw new Error("Failed to parse Job Description file.");
        const data = await jdRes.json();
        if (data.results && data.results.length > 0) {
          finalJdContent = data.results[0].text;
          setJdText(finalJdContent); // Store extracted text in text area
        }
      }

      // Step B: Extract Candidate Resumes
      setProcessingStep("extracting");
      setProgressVal(35);
      setProgressText(`Extracting ${resumeFiles.length} resume files...`);

      const resExtract = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: resumeFiles,
          startIndex: 1
        })
      });

      if (!resExtract.ok) throw new Error("Server extraction failed.");
      const extractData = await resExtract.json();
      const extractedList = extractData.results || [];

      if (extractedList.length === 0) {
        throw new Error("No readable resumes found in uploaded files. Please ensure you upload valid PDF, DOCX, or TXT formats.");
      }

      // Populate local resumes memory
      const tempResumes: { [id: string]: StoredResume } = {};
      const analysisPayload: Array<{ id: string; filename: string; text: string }> = [];

      extractedList.forEach((r: any) => {
        tempResumes[r.id] = {
          filename: r.filename,
          bytesBase64: r.base64,
          text: r.text,
          mimeType: r.mimeType
        };
        analysisPayload.push({
          id: r.id,
          filename: r.filename,
          text: r.text
        });
      });

      setStoredResumes(tempResumes);
      setProgressVal(70);
      setProgressText("Files extracted successfully! Commencing AI candidate matching...");

      // Step C: Scoring via AI engine
      setProcessingStep("analyzing");
      setProgressVal(85);
      setProgressText(`Evaluating ${analysisPayload.length} resumes against Job Description...`);

      const matchRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText: finalJdContent,
          resumes: analysisPayload
        })
      });

      if (!matchRes.ok) throw new Error("AI analysis endpoint returned an error.");
      const matchData = await matchRes.json();

      setResults(matchData.results || []);
      setActiveProvider(matchData.provider || "local");
      setProgressVal(100);
      setProcessingStep("idle");
      setIsProcessing(false);
    } catch (err: any) {
      console.error(err);
      alert(`An error occurred: ${err?.message || "Internal execution error. Please try again."}`);
      setIsProcessing(false);
      setProcessingStep("idle");
    }
  };

  // Statistics calculation for Top Header Stats Row
  const stats = useMemo(() => {
    if (results.length === 0) return { total: 0, top: 0, avg: 0, strong: 0, low: 0 };
    const scores = results.map(r => r.overall_score);
    const total = results.length;
    const top = Math.max(...scores);
    const avg = parseFloat((scores.reduce((a, b) => a + b, 0) / total).toFixed(1));
    const strong = results.filter(r => r.overall_score >= 80).length;
    const low = results.filter(r => r.overall_score < 50).length;
    return { total, top, avg, strong, low };
  }, [results]);

  // Filtered and Ranked Results
  const filteredResults = useMemo(() => {
    // Sort all results by score descending to determine correct global rank
    const sorted = [...results].sort((a, b) => b.overall_score - a.overall_score);
    // Assign global rank index directly to the item so it retains its rank even when filtered/paginated
    const withRanks = sorted.map((r, i) => ({ ...r, rank: i + 1 }));
    
    if (rankLimit === 'all') return withRanks;
    return withRanks.slice(0, typeof rankLimit === 'string' ? parseInt(rankLimit) : rankLimit);
  }, [results, rankLimit]);

  // Pagination Variables
  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage) || 1;
  const paginatedResults = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredResults.slice(start, start + itemsPerPage);
  }, [filteredResults, page]);

  // Export CSV
  const exportCSV = () => {
    const headers = ["ID", "Name", "Email", "Phone", "Overall Score", "Technical Depth", "Experience Quality", "Growth Potential", "Cultural Fit", "Soft Skills", "Relevance Score", "Strength", "Gap", "Priority", "Recommendation"];
    const rows = results.map(r => [
      r.id,
      `"${r.name.replace(/"/g, '""')}"`,
      r.email,
      r.phone,
      r.overall_score,
      r.technical_depth,
      r.experience_quality,
      r.growth_potential,
      r.cultural_fit,
      r.soft_skills,
      r.relevance_score,
      `"${r.strength.replace(/"/g, '""')}"`,
      `"${r.gap.replace(/"/g, '""')}"`,
      r.priority,
      `"${r.recommendation.replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `deephire_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Excel Sheet
  const exportExcel = () => {
    const formatted = results.map(r => ({
      "ID": r.id,
      "Name": r.name,
      "Email": r.email,
      "Phone": r.phone,
      "Overall Score": r.overall_score,
      "Technical Depth": r.technical_depth,
      "Experience Quality": r.experience_quality,
      "Growth Potential": r.growth_potential,
      "Cultural Fit": r.cultural_fit,
      "Soft Skills": r.soft_skills,
      "Relevance Score": r.relevance_score,
      "Strength": r.strength,
      "Gap": r.gap,
      "Priority": r.priority,
      "Recommendation": r.recommendation
    }));
    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Candidates Matching");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    link.setAttribute("href", url);
    link.setAttribute("download", `deephire_${timestamp}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download PDF Trigger from JavaScript
  const downloadBase64File = (base64Data: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = 'data:application/octet-stream;base64,' + base64Data;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#f6f8fa] text-[#1f2328] flex flex-col antialiased">
      {/* HEADER BAR */}
      <header className="bg-white border-b border-[#d0d7de] sticky top-0 z-40 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-bold tracking-tight text-[#1f2328] flex items-center space-x-2">
              <svg className="h-10 w-10 shrink-0" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="योग्यता विवेकः - Discernment of Merit">
                {/* Outer Saffron & Gold Radiance Pattern */}
                <circle cx="50" cy="50" r="48" fill="#fffaf5" stroke="#ea580c" strokeWidth="2" />
                <circle cx="50" cy="50" r="43" stroke="#b45309" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
                
                {/* Radiant Rays representing Surya / light of wisdom */}
                <g stroke="#f97316" strokeWidth="1" opacity="0.3">
                  <line x1="50" y1="8" x2="50" y2="12" />
                  <line x1="50" y1="88" x2="50" y2="92" />
                  <line x1="8" y1="50" x2="12" y2="50" />
                  <line x1="88" y1="50" x2="92" y2="50" />
                  <line x1="20" y1="20" x2="23" y2="23" />
                  <line x1="77" y1="77" x2="80" y2="80" />
                  <line x1="20" y1="80" x2="23" y2="77" />
                  <line x1="77" y1="23" x2="80" y2="20" />
                </g>

                {/* Sacred Lotus Seat at the base */}
                <path d="M 28,68 C 36,75 42,76 50,72 C 58,76 64,75 72,68 C 66,64 58,66 50,64 C 42,66 34,64 28,68 Z" fill="#ffedd5" stroke="#ea580c" strokeWidth="1.5" />
                <path d="M 33,68 C 40,71 45,72 50,69 C 55,72 60,71 67,68" stroke="#b45309" strokeWidth="1" />

                {/* The Hamsa (Swan of Discernment) */}
                <path d="M 45,28 C 48,24 53,24 55,27 C 57,30 55,34 52,38 C 48,43 45,49 45,54 C 45,61 51,64 57,61 C 63,58 65,51 61,46" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 46,27 L 40,29" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
                <circle cx="49.5" cy="29.5" r="0.75" fill="#ea580c" />

                {/* Dynamic Wings */}
                <path d="M 38,45 C 31,46 26,53 29,60 C 32,67 42,68 49,63" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 36,51 C 31,52 28,57 31,62 C 34,67 41,66 46,62" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 35,57 C 32,58 31,61 34,63 C 37,65 41,64 44,61" stroke="#d97706" strokeWidth="1" strokeLinecap="round" />

                {/* Sanskrit/Devanagari text योग्यता (Merit) & विवेकः (Discernment) */}
                <text x="50" y="20" textAnchor="middle" fill="#b45309" fontSize="6.5" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="0.8">योग्यता</text>
                <text x="50" y="85" textAnchor="middle" fill="#ea580c" fontSize="8.5" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="1">विवेकः</text>
              </svg>
              <span>Deep<span className="text-[#0969da] ml-0.5">Hire</span></span>
            </span>
            <span className="h-4 w-px bg-[#d0d7de] hidden sm:block"></span>
            <span className="text-xs text-[#656d76] font-mono mt-1 hidden sm:block">
              AI-Powered Recruitment • <span className="text-[#ea580c] font-semibold font-sans">योग्यता विवेकः</span> (Discernment of Merit)
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs font-mono text-[#656d76]">
              <span>Platform Status:</span>
              <span className="flex items-center space-x-1">
                <span className="h-2 w-2 rounded-full bg-[#1a7f37]"></span>
                <span className="text-[#1a7f37] font-semibold">ONLINE</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* MODAL OVERLAY (FEATURE 5) */}
      {viewResumeId && storedResumes[viewResumeId] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white w-full max-w-2xl h-[88vh] rounded-xl border border-[#d0d7de] shadow-2xl flex flex-col overflow-hidden relative">
            
            {/* Modal Header */}
            <div className="bg-[#f6f8fa] border-b border-[#d0d7de] px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-semibold px-2 py-1 bg-[#f0f6ff] text-[#0969da] border border-[#0969da]/15 rounded font-mono">
                  {viewResumeId}
                </span>
                <span className="font-semibold text-sm text-[#1f2328] truncate max-w-md font-mono">
                  Candidate Evaluation Profile
                </span>
              </div>
              <button 
                onClick={() => {
                  setViewResumeId(null);
                  setShowOriginalOverlay(false);
                }}
                className="p-1.5 text-[#656d76] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body: Single elegant column with full details */}
            <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
              {results.find(r => r.id === viewResumeId) ? (
                (() => {
                  const match = results.find(r => r.id === viewResumeId)!;
                  const { matched, missing } = getKeywordMatches(jdText, storedResumes[viewResumeId].text);
                  
                  let scoreBg = "bg-[#ffebe9] text-[#cf222e]";
                  if (match.overall_score >= 80) scoreBg = "bg-[#dafbe1] text-[#1a7f37]";
                  else if (match.overall_score >= 60) scoreBg = "bg-[#fff8c5] text-[#9a6700]";

                  let priorityBg = "bg-[#ffebe9] text-[#cf222e]";
                  if (match.priority === "HIGH") priorityBg = "bg-[#ddf4ff] text-[#0969da]";
                  else if (match.priority === "MEDIUM") priorityBg = "bg-[#fff8c5] text-[#9a6700]";

                  return (
                    <div className="space-y-6">
                      
                      {/* BUTTON TO SEE ORIGINAL RESUME ON THE SAME PAGE (POPUP OVERLAY) */}
                      <button
                        onClick={() => setShowOriginalOverlay(true)}
                        className="w-full py-3 px-4 bg-[#f0f6ff] hover:bg-[#ddf4ff] border border-[#0969da]/20 hover:border-[#0969da]/40 rounded-lg text-xs font-bold text-[#0969da] flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-sm animate-pulse"
                      >
                        <Eye className="h-4 w-4 text-[#0969da]" />
                        <span>See Original Resume</span>
                      </button>

                      {/* Profile Meta Info Card */}
                      <div className="bg-[#f6f8fa] rounded-xl p-5 border border-[#d0d7de] space-y-3 shadow-inner">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1 pr-2">
                            <h3 className="text-sm font-bold text-[#1f2328] flex items-center space-x-1.5 truncate">
                              <User className="h-4 w-4 text-[#656d76] shrink-0" />
                              <span className="truncate">{match.name}</span>
                            </h3>
                            <p className="text-[10px] text-[#656d76] font-mono mt-0.5">ID: {match.id} | {storedResumes[viewResumeId].filename}</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full font-extrabold text-sm ${scoreBg}`}>
                            {match.overall_score}% Overall Score
                          </span>
                        </div>

                        <div className="text-[11px] space-y-1.5 text-[#444d56] font-mono border-t border-[#d0d7de]/40 pt-2.5">
                          <div className="flex items-center space-x-2 truncate">
                            <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="truncate hover:underline" title={match.email}>{match.email}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span>{match.phone}</span>
                          </div>
                        </div>
                      </div>

                      {/* Recruitment Evaluation Scores */}
                      <div className="space-y-3.5">
                        <h4 className="text-[10px] font-bold text-[#1f2328] tracking-wider uppercase font-sans border-b border-[#d0d7de] pb-1.5 flex items-center justify-between">
                          <span>Recruitment Metrics</span>
                          <span className="text-[9px] font-mono lowercase text-[#656d76] font-normal">Score weights</span>
                        </h4>

                        <div className="space-y-3">
                          {/* Technical Depth */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="flex items-center space-x-1.5">
                                <FileCode className="h-3.5 w-3.5 text-blue-500" />
                                <span>Technical Depth</span>
                              </span>
                              <span className="font-mono text-[11px]">{match.technical_depth}%</span>
                            </div>
                            <div className="w-full bg-[#f6f8fa] rounded-full h-2">
                              <div className="bg-[#0969da] h-2 rounded-full transition-all duration-300" style={{ width: `${match.technical_depth}%` }}></div>
                            </div>
                          </div>

                          {/* Experience Quality */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="flex items-center space-x-1.5">
                                <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
                                <span>Experience Quality</span>
                              </span>
                              <span className="font-mono text-[11px]">{match.experience_quality}%</span>
                            </div>
                            <div className="w-full bg-[#f6f8fa] rounded-full h-2">
                              <div className="bg-[#2ea043] h-2 rounded-full transition-all duration-300" style={{ width: `${match.experience_quality}%` }}></div>
                            </div>
                          </div>

                          {/* Growth Potential */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="flex items-center space-x-1.5">
                                <TrendingUp className="h-3.5 w-3.5 text-purple-500" />
                                <span>Growth Potential</span>
                              </span>
                              <span className="font-mono text-[11px]">{match.growth_potential}%</span>
                            </div>
                            <div className="w-full bg-[#f6f8fa] rounded-full h-2">
                              <div className="bg-[#a371f7] h-2 rounded-full transition-all duration-300" style={{ width: `${match.growth_potential}%` }}></div>
                            </div>
                          </div>

                          {/* Role Relevance */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="flex items-center space-x-1.5">
                                <Award className="h-3.5 w-3.5 text-yellow-500" />
                                <span>Role Relevance</span>
                              </span>
                              <span className="font-mono text-[11px]">{match.relevance_score}%</span>
                            </div>
                            <div className="w-full bg-[#f6f8fa] rounded-full h-2">
                              <div className="bg-[#e3b341] h-2 rounded-full transition-all duration-300" style={{ width: `${match.relevance_score}%` }}></div>
                            </div>
                          </div>

                          {/* Cultural Fit */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="flex items-center space-x-1.5">
                                <Compass className="h-3.5 w-3.5 text-cyan-500" />
                                <span>Cultural Alignment</span>
                              </span>
                              <span className="font-mono text-[11px]">{match.cultural_fit}%</span>
                            </div>
                            <div className="w-full bg-[#f6f8fa] rounded-full h-2">
                              <div className="bg-[#0366d6] h-2 rounded-full transition-all duration-300" style={{ width: `${match.cultural_fit}%` }}></div>
                            </div>
                          </div>

                          {/* Soft Skills */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="flex items-center space-x-1.5">
                                <Users className="h-3.5 w-3.5 text-pink-500" />
                                <span>Soft Skills</span>
                              </span>
                              <span className="font-mono text-[11px]">{match.soft_skills}%</span>
                            </div>
                            <div className="w-full bg-[#f6f8fa] rounded-full h-2">
                              <div className="bg-[#f65a5a] h-2 rounded-full transition-all duration-300" style={{ width: `${match.soft_skills}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Priority Block */}
                      <div className="flex justify-between items-center bg-[#f6f8fa] border border-[#d0d7de] px-4 py-3 rounded-lg">
                        <span className="text-xs font-bold text-[#1f2328]">Priority Ranking Group</span>
                        <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs ${priorityBg}`}>
                          {match.priority}
                        </span>
                      </div>

                      {/* Strengths and Gaps */}
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1">
                          <h5 className="text-[10px] font-bold text-[#1a7f37] uppercase flex items-center space-x-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span>Core Strength</span>
                          </h5>
                          <p className="text-xs text-[#24292f] bg-[#dafbe1]/30 border border-[#dafbe1]/60 p-3 rounded-lg leading-relaxed font-sans">
                            {match.strength}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h5 className="text-[10px] font-bold text-[#cf222e] uppercase flex items-center space-x-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>Critical Gap</span>
                          </h5>
                          <p className="text-xs text-[#24292f] bg-[#ffebe9]/30 border border-[#ffebe9]/60 p-3 rounded-lg leading-relaxed font-sans">
                            {match.gap}
                          </p>
                        </div>
                      </div>

                      {/* Keyword Matches */}
                      <div className="space-y-3.5 border-t border-[#d0d7de] pt-4">
                        <h5 className="text-[10px] font-bold text-[#0969da] uppercase flex items-center space-x-1.5">
                          <Tag className="h-3.5 w-3.5 shrink-0" />
                          <span>JD Keyword Match Analytics</span>
                        </h5>
                        
                        <div className="space-y-3">
                          {/* Matched badges */}
                          <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Matched Keywords ({matched.length})</div>
                            {matched.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {matched.map(kw => (
                                  <span key={kw} className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-[#dafbe1] text-[#1a7f37] border border-[#2ea043]/15 rounded-md text-[10px] font-semibold font-mono">
                                    <Check className="h-3 w-3" />
                                    <span>{kw}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-400 italic">No technology or skill keywords matched.</p>
                            )}
                          </div>

                          {/* Missing badges */}
                          <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Missing JD Keywords ({missing.length})</div>
                            {missing.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {missing.map(kw => (
                                  <span key={kw} className="inline-flex items-center px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-200 border-dashed rounded-md text-[10px] font-semibold font-mono">
                                    <span>{kw}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-400 italic">All skills matched or none found in JD.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col justify-center items-center text-center py-20 space-y-2 bg-[#f6f8fa] rounded-xl border border-dashed border-[#d0d7de]">
                  <Sparkles className="h-8 w-8 text-[#656d76] animate-pulse" />
                  <h4 className="text-xs font-bold text-[#1f2328]">No Analysis Generated</h4>
                  <p className="text-[11px] text-[#656d76] max-w-[200px] leading-relaxed">
                    Paste a Job Description and click "Analyze Resumes" to generate deep recruitment analytics.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-[#f6f8fa] border-t border-[#d0d7de] px-6 py-4 flex items-center justify-end space-x-3 shrink-0">
              <button 
                onClick={() => {
                  setViewResumeId(null);
                  setShowOriginalOverlay(false);
                }}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-white border border-[#d0d7de] rounded-lg text-xs font-semibold text-[#24292f] hover:bg-gray-50 transition-colors cursor-pointer animate-none"
              >
                <span>Close Details</span>
              </button>
              <button 
                onClick={() => downloadBase64File(storedResumes[viewResumeId].bytesBase64, storedResumes[viewResumeId].filename)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#0969da] border border-black/15 rounded-lg text-xs font-semibold text-white hover:bg-[#0c61cf] transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Document</span>
              </button>
            </div>

            {/* SAME PAGE POPUP OVERLAY SCREEN FOR THE ORIGINAL RESUME TEXT */}
            {showOriginalOverlay && (
              <div className="absolute inset-0 bg-white z-50 flex flex-col animate-fade-in">
                {/* Header of the same page original resume viewer */}
                <div className="bg-[#f6f8fa] border-b border-[#d0d7de] px-6 py-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-[#0969da]" />
                    <span className="font-bold text-sm text-[#1f2328] font-mono truncate max-w-lg">
                      Original Resume Document Reader
                    </span>
                  </div>
                  <button 
                    onClick={() => setShowOriginalOverlay(false)}
                    className="p-1.5 text-[#656d76] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    title="Close original resume reader"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body scroll showing the clean text beautifully formatted */}
                <div className="flex-1 p-8 overflow-y-auto space-y-4 bg-white custom-resume-scroll font-sans select-text text-xs leading-relaxed max-w-4xl mx-auto w-full">
                  <div className="bg-[#f6f8fa] p-4 rounded-lg border border-[#d0d7de]/60 text-[#586069] mb-4 text-[11px] flex justify-between items-center">
                    <span>File: {storedResumes[viewResumeId].filename}</span>
                    <span className="bg-white px-2 py-0.5 rounded border border-gray-200">Safe Reader View</span>
                  </div>
                  {storedResumes[viewResumeId].text ? (
                    storedResumes[viewResumeId].text.split('\n').map((line, idx) => {
                      const trimmed = line.trim();
                      if (!trimmed) return <div key={idx} className="h-3"></div>;
                      
                      // Highlight sections nicely
                      const isHeader = /^(objective|summary|experience|work experience|employment history|education|skills|technical skills|projects|languages|certifications|awards|links|contact)\b/i.test(trimmed);
                      if (isHeader) {
                        return (
                          <h4 key={idx} className="text-xs font-bold text-[#0969da] uppercase tracking-wider border-b border-[#d0d7de] pb-1.5 mt-6 first:mt-0 font-sans">
                            {trimmed}
                          </h4>
                        );
                      }
                      
                      return (
                        <p key={idx} className="text-[#24292f] leading-6 tracking-wide text-xs">
                          {line}
                        </p>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center py-20 text-gray-400 font-sans space-y-2">
                      <AlertTriangle className="h-8 w-8 text-gray-300" />
                      <p className="text-xs">No text available for this candidate document.</p>
                    </div>
                  )}
                </div>

                {/* Footer with actions */}
                <div className="bg-[#f6f8fa] border-t border-[#d0d7de] px-6 py-4 flex items-center justify-end space-x-3 shrink-0">
                  <button 
                    onClick={() => setShowOriginalOverlay(false)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 bg-white border border-[#d0d7de] rounded-lg text-xs font-semibold text-[#24292f] hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <span>Close Reader</span>
                  </button>
                  <button 
                    onClick={() => downloadBase64File(storedResumes[viewResumeId].bytesBase64, storedResumes[viewResumeId].filename)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#0969da] border border-black/15 rounded-lg text-xs font-semibold text-white hover:bg-[#0c61cf] transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Original Document</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        {/* INPUT LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* FEATURE 1: JD BOX */}
          <div className="bg-white border border-[#d0d7de] rounded-xl p-6 shadow-sm flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Briefcase className="h-5 w-5 text-[#0969da]" />
                <h2 className="text-base font-semibold text-[#1f2328]">1. Job Description (JD)</h2>
              </div>
              {(jdText || jdFileName) && (
                <button 
                  onClick={handleClearJd} 
                  className="text-xs text-[#cf222e] hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Drag & drop mock layout */}
            <div className="space-y-3">
              <div className="relative border-2 border-dashed border-[#d0d7de] hover:border-[#0969da] rounded-lg p-4 bg-[#f6f8fa] text-center transition-colors">
                <input 
                  type="file" 
                  ref={jdFileInputRef}
                  onChange={handleJdFileChange}
                  accept=".pdf,.docx,.txt"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center space-y-1">
                  <Upload className="h-6 w-6 text-[#656d76]" />
                  <span className="text-xs font-semibold text-[#1f2328]">
                    {jdFileName ? `Attached: ${jdFileName}` : "Upload JD Document (PDF, DOCX, TXT)"}
                  </span>
                  <span className="text-[10px] text-[#656d76]">Click to browse or drop here</span>
                </div>
              </div>

              <textarea 
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Or paste the Job Description text here directly..."
                className="w-full h-[180px] text-xs p-3 border border-[#d0d7de] focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] rounded-lg outline-none resize-none font-sans leading-relaxed transition-colors duration-200"
              />
            </div>
          </div>

          {/* FEATURE 2: RESUME BOX */}
          <div className="bg-white border border-[#d0d7de] rounded-xl p-6 shadow-sm flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-[#0969da]" />
                <h2 className="text-base font-semibold text-[#1f2328]">2. Candidate Resumes</h2>
              </div>
              {resumeFiles.length > 0 && (
                <button 
                  onClick={handleClearFiles} 
                  className="text-xs text-[#cf222e] hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear all</span>
                </button>
              )}
            </div>

            <div className="space-y-4 flex-1 flex flex-col">
              <div className="relative border-2 border-dashed border-[#d0d7de] hover:border-[#0969da] rounded-lg p-6 bg-[#f6f8fa] text-center transition-colors flex-1 flex flex-col items-center justify-center min-h-[140px]">
                <input 
                  type="file" 
                  ref={resumeInputRef}
                  onChange={handleResumesChange}
                  accept=".pdf,.docx,.txt,.zip"
                  multiple
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center space-y-2">
                  <Upload className="h-8 w-8 text-[#656d76]" />
                  <span className="text-xs font-semibold text-[#1f2328]">
                    Select multiple Resume Documents
                  </span>
                  <span className="text-[11px] text-[#656d76]">
                    Supports PDF, DOCX, TXT formats & ZIP archives
                  </span>
                </div>
              </div>

              {resumeFiles.length > 0 && (
                <div className="flex items-center space-x-2 px-2 py-1.5 bg-[#f0f6ff] border border-[#0969da]/15 rounded-lg w-max">
                  <Check className="h-4 w-4 text-[#0969da]" />
                  <span className="text-xs font-semibold font-mono text-[#0969da]">
                    {resumeFiles.length} files selected
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PROCESSING & TRIGGER BUTTON */}
        <div className="flex flex-col items-center justify-center pt-2 space-y-4">
          <button 
            onClick={runMatchPipeline}
            disabled={isProcessing}
            className={`w-full max-w-md py-3 px-6 rounded-lg font-semibold text-sm shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              isProcessing 
                ? "bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed" 
                : "bg-[#0969da] border border-[#0969da] text-white hover:bg-[#0c61cf] hover:shadow-lg active:scale-[0.98]"
            }`}
          >
            <Search className="h-4 w-4" />
            <span>Run DeepHire AI Match</span>
          </button>

          {/* PROGRESS INDICATOR BLOCK */}
          {isProcessing && (
            <div className="w-full max-w-xl bg-white border border-[#d0d7de] p-5 rounded-lg shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-[#1f2328]">
                <span className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-[#0969da] animate-ping" />
                  <span>{progressText}</span>
                </span>
                <span>{progressVal}%</span>
              </div>
              <div className="w-full h-2 bg-[#f6f8fa] border border-[#d0d7de] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#0969da] transition-all duration-300 rounded-full" 
                  style={{ width: `${progressVal}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* RESULTS GRID & STATS CARD (FEATURE 4) */}
        {results.length > 0 && (
          <div className="space-y-6 pt-4 animate-fade-in">
            <div className="border-t border-[#d0d7de] pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#1f2328]">Match Analysis Results</h3>
                <p className="text-xs text-[#656d76]">Statistical summary scoring parameters mapped for {results.length} applicants</p>
              </div>

              <div className="flex items-center space-x-3">
                {/* Visual View/Settings Tab Toggle */}
                <div className="flex items-center space-x-1 bg-[#f6f8fa] border border-[#d0d7de] p-1 rounded-lg">
                  <button
                    onClick={() => setActiveResultsTab("leaderboard")}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                      activeResultsTab === "leaderboard"
                        ? "bg-white text-[#24292f] border border-[#d0d7de] shadow-sm font-bold"
                        : "text-[#57606a] hover:text-[#24292f]"
                    }`}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    <span>Leaderboard</span>
                  </button>
                  <button
                    onClick={() => setActiveResultsTab("settings")}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                      activeResultsTab === "settings"
                        ? "bg-white text-[#24292f] border border-[#d0d7de] shadow-sm font-bold"
                        : "text-[#57606a] hover:text-[#24292f]"
                    }`}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Filters</span>
                  </button>
                </div>
                
                {/* EXPORT OPTIONS (FEATURE 6) */}
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={exportCSV}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-[#d0d7de] rounded-lg text-xs font-semibold text-[#24292f] hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <FileCode className="h-4 w-4 text-[#656d76]" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button 
                    onClick={exportExcel}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-[#d0d7de] rounded-lg text-xs font-semibold text-[#24292f] hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-[#1a7f37]" />
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                </div>
              </div>
            </div>

            {activeResultsTab === "settings" ? (
              /* SETTINGS TAB: CHOOSE DISPLAY LIMITS */
              <div className="bg-white border border-[#d0d7de] rounded-xl p-6 shadow-sm space-y-5 animate-fade-in">
                <div className="flex items-center space-x-2 border-b border-[#d0d7de] pb-3">
                  <Sliders className="h-5 w-5 text-[#0969da]" />
                  <h4 className="text-sm font-bold text-[#1f2328]">Pipeline & Leaderboard Display Settings</h4>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-[#24292f] uppercase tracking-wider">
                    Select Ranks Display Limit
                  </label>
                  <p className="text-xs text-[#57606a] leading-relaxed max-w-2xl">
                    Configure the maximum candidate ranking to display in the primary leaderboard list. This lets you focus strictly on top tier talent matching while maintaining absolute global performance ranks.
                  </p>
                  
                  <div className="flex flex-wrap gap-2 pt-2">
                    {([
                      { label: "🥇 Top 3", value: 3 },
                      { label: "🥈 Top 5", value: 5 },
                      { label: "🥉 Top 10", value: 10 },
                      { label: "🏆 Top 25", value: 25 },
                      { label: "📋 Show All", value: "all" }
                    ] as const).map(opt => {
                      const isSelected = rankLimit === opt.value;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => {
                            setRankLimit(opt.value);
                            setCustomRankInput(opt.value === 'all' ? "" : String(opt.value));
                            setPage(1); // reset pagination to page 1 on filter update
                          }}
                          className={`px-4 py-2.5 border rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#0969da] border-[#0969da] text-white shadow-sm"
                              : "bg-white border-[#d0d7de] text-[#24292f] hover:bg-gray-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* CUSTOM RANKS INPUT BLOCK */}
                  <div className="pt-4 border-t border-[#d0d7de]/50 mt-4 space-y-2">
                    <label className="block text-xs font-bold text-[#24292f] uppercase tracking-wider">
                      Or Set Custom Rank Limit
                    </label>
                    <p className="text-xs text-[#57606a]">
                      Enter any custom number to filter top candidates up to that specific rank limit.
                    </p>
                    <div className="flex items-center space-x-2 max-w-sm">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-mono text-gray-400 pointer-events-none">
                          Rank 1 to
                        </span>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          placeholder="e.g. 12"
                          value={customRankInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomRankInput(val);
                            const parsed = parseInt(val, 10);
                            if (!isNaN(parsed) && parsed > 0) {
                              setRankLimit(parsed);
                              setPage(1);
                            } else {
                              setRankLimit("all");
                            }
                          }}
                          className="w-full pl-20 pr-3 py-2 text-xs border border-[#d0d7de] focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] rounded-lg outline-none font-mono"
                        />
                      </div>
                      {rankLimit !== "all" && (
                        <button
                          onClick={() => {
                            setCustomRankInput("");
                            setRankLimit("all");
                            setPage(1);
                          }}
                          className="px-3 py-2 bg-[#f6f8fa] hover:bg-[#eaeef2] border border-[#d0d7de] rounded-lg text-xs font-semibold text-[#57606a] cursor-pointer transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info block */}
                <div className="bg-[#f0f6ff]/60 border border-[#0969da]/15 p-4 rounded-lg flex items-start space-x-3">
                  <CheckCircle2 className="h-4 w-4 text-[#0969da] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#24292f] leading-relaxed">
                    <span className="font-bold text-[#0969da] block mb-0.5">Filter Setting Live</span>
                    Currently configured to display <strong>{rankLimit === "all" ? "All Processed Resumes" : `Up to Rank ${rankLimit} Candidates`}</strong> in the leaderboard list. All scores are evaluated and graded globally.
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-[#d0d7de] shrink-0">
                  <span className="text-xs text-[#57606a]">Settings take effect immediately.</span>
                  <button
                    onClick={() => setActiveResultsTab("leaderboard")}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#0969da] border border-black/10 rounded-lg text-xs font-bold text-white hover:bg-[#0c61cf] transition-all cursor-pointer"
                  >
                    <span>Back to Leaderboard</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              /* LEADERBOARD VIEW */
              <div className="space-y-6 animate-fade-in">
                {/* Statistics panel in grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-white border border-[#d0d7de] rounded-lg p-4 text-center shadow-sm">
                    <div className="text-[10px] font-bold text-[#656d76] uppercase tracking-wider mb-1">Total Processed</div>
                    <div className="text-xl font-bold text-[#0969da]">{stats.total}</div>
                  </div>
                  <div className="bg-white border border-[#d0d7de] rounded-lg p-4 text-center shadow-sm">
                    <div className="text-[10px] font-bold text-[#656d76] uppercase tracking-wider mb-1">Top Score</div>
                    <div className="text-xl font-bold text-[#1a7f37]">{stats.top}%</div>
                  </div>
                  <div className="bg-white border border-[#d0d7de] rounded-lg p-4 text-center shadow-sm">
                    <div className="text-[10px] font-bold text-[#656d76] uppercase tracking-wider mb-1">Average Score</div>
                    <div className="text-xl font-bold text-[#bf8700]">{stats.avg}%</div>
                  </div>
                  <div className="bg-white border border-[#d0d7de] rounded-lg p-4 text-center shadow-sm">
                    <div className="text-[10px] font-bold text-[#656d76] uppercase tracking-wider mb-1">Strong Matches (≥80)</div>
                    <div className="text-xl font-bold text-[#1a7f37]">{stats.strong}</div>
                  </div>
                  <div className="bg-white border border-[#d0d7de] rounded-lg p-4 text-center shadow-sm">
                    <div className="text-[10px] font-bold text-[#656d76] uppercase tracking-wider mb-1">Low Matches (&lt;50)</div>
                    <div className="text-xl font-bold text-[#cf222e]">{stats.low}</div>
                  </div>
                </div>

                {/* TABLE GRID VIEW WITH FIXED SIZES */}
                <div className="border border-[#d0d7de] rounded-lg overflow-hidden bg-white shadow-sm overflow-x-auto">
                  <div className="min-w-[900px]">
                    {/* Header */}
                    <div className="bg-[#f6f8fa] border-b border-[#d0d7de] px-4 py-3 grid grid-cols-[85px_100px_1.5fr_2fr_1.2fr_75px_65px_65px_80px_80px] gap-2 items-center text-xs font-bold text-[#1f2328]">
                      <div>RANK</div>
                      <div>ID</div>
                      <div>NAME</div>
                      <div>EMAIL</div>
                      <div>PHONE</div>
                      <div className="text-center">SCORE</div>
                      <div className="text-center">TECH</div>
                      <div className="text-center">EXP</div>
                      <div className="text-center">PRIORITY</div>
                      <div className="text-right">ACTION</div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-[#d0d7de]">
                      {paginatedResults.map((cand, idx) => {
                        const absoluteIndex = (page - 1) * itemsPerPage + idx + 1;
                        const rankNum = cand.rank || absoluteIndex;
                        
                        // Score Color Pills
                        let scoreBadgeClass = "bg-[#ffebe9] text-[#cf222e]";
                        if (cand.overall_score >= 80) scoreBadgeClass = "bg-[#dafbe1] text-[#1a7f37]";
                        else if (cand.overall_score >= 60) scoreBadgeClass = "bg-[#fff8c5] text-[#9a6700]";

                        // Priority Color Labels
                        let priorityBadgeClass = "bg-[#ffebe9] text-[#cf222e]";
                        if (cand.priority === "HIGH") priorityBadgeClass = "bg-[#ddf4ff] text-[#0969da]";
                        else if (cand.priority === "MEDIUM") priorityBadgeClass = "bg-[#fff8c5] text-[#9a6700]";

                        const getRankBadge = (num: number) => {
                          if (num === 1) return <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 text-[#9a6700] border border-amber-200 rounded font-bold text-[10px]">🥇 Rank 1</span>;
                          if (num === 2) return <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 text-[#444d56] border border-slate-200 rounded font-bold text-[10px]">🥈 Rank 2</span>;
                          if (num === 3) return <span className="inline-flex items-center px-1.5 py-0.5 bg-orange-50 text-[#8a3800] border border-orange-200 rounded font-bold text-[10px]">🥉 Rank 3</span>;
                          return <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-50 text-[#57606a] border border-[#d0d7de] rounded font-mono font-medium text-[10px]">Rank {num}</span>;
                        };

                        return (
                          <div 
                            key={cand.id}
                            className="px-4 py-3 grid grid-cols-[85px_100px_1.5fr_2fr_1.2fr_75px_65px_65px_80px_80px] gap-2 items-center text-xs hover:bg-[#f6f8fa]/60 transition-colors"
                          >
                            <div className="font-sans font-medium text-[#24292f]">
                              {getRankBadge(rankNum)}
                            </div>
                            <div>
                              <span className="font-mono font-semibold px-2 py-0.5 bg-[#f0f6ff] text-[#0969da] border border-[#0969da]/10 rounded text-[11px]">
                                {cand.id}
                              </span>
                            </div>
                            <div className="font-semibold text-[#1f2328] truncate max-w-[130px]">{cand.name}</div>
                            <div className="text-[#656d76] truncate max-w-[180px]" title={cand.email}>{cand.email}</div>
                            <div className="text-[#656d76] truncate">{cand.phone}</div>
                            <div className="text-center">
                              <span className={`px-2.5 py-1.5 rounded-full font-bold text-[11px] ${scoreBadgeClass}`}>
                                {cand.overall_score}%
                              </span>
                            </div>
                            <div className="text-center font-semibold text-[#1f2328]">{cand.technical_depth}</div>
                            <div className="text-center font-semibold text-[#1f2328]">{cand.experience_quality}</div>
                            <div className="text-center">
                              <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${priorityBadgeClass}`}>
                                {cand.priority}
                              </span>
                            </div>
                            <div className="text-right">
                              <button 
                                onClick={() => setViewResumeId(cand.id)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-white border border-[#d0d7de] hover:bg-gray-50 rounded-md font-semibold text-[11px] text-[#24292f] transition-colors cursor-pointer"
                              >
                                <FileText className="h-3 w-3 text-[#656d76]" />
                                <span>View</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* PAGINATION PANEL */}
                <div className="flex items-center justify-between border-t border-[#d0d7de] pt-4">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className={`inline-flex items-center space-x-1 px-3 py-1.5 border border-[#d0d7de] rounded-lg text-xs font-semibold cursor-pointer transition-colors duration-200 ${
                      page <= 1 
                        ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed" 
                        : "bg-white text-[#24292f] hover:bg-gray-50"
                    }`}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Prev</span>
                  </button>
                  
                  <span className="text-xs font-semibold text-[#656d76] font-mono">
                    Page {page} of {totalPages}
                  </span>

                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className={`inline-flex items-center space-x-1 px-3 py-1.5 border border-[#d0d7de] rounded-lg text-xs font-semibold cursor-pointer transition-colors duration-200 ${
                      page >= totalPages 
                        ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed" 
                        : "bg-white text-[#24292f] hover:bg-gray-50"
                    }`}
                  >
                    <span>Next</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-[#d0d7de] mt-12 py-6 text-center text-xs text-[#656d76] font-mono">
        <div className="max-w-7xl mx-auto px-6">
          <span>DeepHire — AI-Powered Recruitment Intelligence </span>
        </div>
      </footer>
    </div>
  );
}
