import streamlit as st
import os
import io
import re
import base64
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

# Ensure backend folder can be imported
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.extractor import DocumentExtractor
from backend.engine import AIRecruitmentEngine

# Load environment variables
load_dotenv()

# Page Setup
st.set_page_config(
    page_title="DeepHire — AI Recruitment Platform",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Custom Inter Font and styling integration
st.markdown("""
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
    /* Inter Font to all elements */
    html, body, [class*="css"], .stButton, .stTextArea, .stMarkdown {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    
    /* Branding layout CSS */
    .brand-title {
        font-size: 32px;
        font-weight: 700;
        color: #1f2328;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
    }
    .brand-hire {
        color: #0969da;
        margin-left: 2px;
    }
    .brand-subtitle {
        font-size: 14px;
        color: #656d76;
        margin-bottom: 24px;
    }
    
    /* Rounded corners & styling variables */
    .stTextArea textarea {
        border-radius: 6px !important;
        border-color: #d0d7de !important;
    }
    .stFileUploader section {
        border-radius: 6px !important;
        border: 1px dashed #d0d7de !important;
        background-color: #f6f8fa !important;
    }
    
    /* GitHub-style table structures */
    .github-grid-header {
        background-color: #f6f8fa;
        border: 1px solid #d0d7de;
        border-bottom: 2px solid #d0d7de;
        border-top-left-radius: 6px;
        border-top-right-radius: 6px;
        padding: 8px 16px;
        font-weight: 600;
        color: #1f2328;
        font-size: 13px;
        display: grid;
        grid-template-columns: 40px 100px 1.5fr 2fr 1fr 70px 60px 60px 70px 1.5fr 80px;
        align-items: center;
        gap: 8px;
    }
    
    .github-grid-row {
        background-color: #ffffff;
        border-left: 1px solid #d0d7de;
        border-right: 1px solid #d0d7de;
        border-bottom: 1px solid #d0d7de;
        padding: 10px 16px;
        font-size: 13px;
        color: #1f2328;
        display: grid;
        grid-template-columns: 40px 100px 1.5fr 2fr 1fr 70px 60px 60px 70px 1.5fr 80px;
        align-items: center;
        gap: 8px;
        transition: background-color 0.15s ease;
    }
    
    .github-grid-row:hover {
        background-color: #f6f8fa !important;
    }
    
    /* Stats grid */
    .stats-card {
        border: 1px solid #d0d7de;
        border-radius: 8px;
        background-color: #ffffff;
        padding: 16px;
        text-align: center;
        box-shadow: 0 1px 3px rgba(31,35,40,0.04);
    }
    .stats-title {
        font-size: 12px;
        font-weight: 500;
        color: #656d76;
        text-transform: uppercase;
        margin-bottom: 6px;
    }
    .stats-value {
        font-size: 24px;
        font-weight: 700;
        color: #1f2328;
    }
    
    /* Custom utility components */
    .id-badge {
        font-size: 11px;
        font-weight: 600;
        color: #0969da;
        background-color: #f0f6ff;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid rgba(9,105,218,0.15);
        font-family: 'JetBrains Mono', monospace;
    }
</style>
""", unsafe_allow_html=True)

# Initialize Session State
if "page" not in st.session_state:
    st.session_state.page = 1
if "stored_resumes" not in st.session_state:
    st.session_state.stored_resumes = {}
if "results" not in st.session_state:
    st.session_state.results = []
if "view_resume" not in st.session_state:
    st.session_state.view_resume = None

# Header
st.markdown('<div class="brand-title">🔍 Deep<span class="brand-hire">Hire</span></div>', unsafe_allow_html=True)
st.markdown('<div class="brand-subtitle">DeepHire — AI-Powered Recruitment Intelligence</div>', unsafe_allow_html=True)

# 📄 VIEW RESUME MODAL OVERLAY (FEATURE 5 - MUST BE AT TOP OF PAGE)
if st.session_state.view_resume and st.session_state.view_resume in st.session_state.stored_resumes:
    v_id = st.session_state.view_resume
    v_data = st.session_state.stored_resumes[v_id]
    filename = v_data["filename"]
    raw_bytes = v_data["bytes"]
    extracted_text = v_data["text"]
    
    # Base64 encode the bytes for PDF iframe or download
    b64_pdf = base64.b64encode(raw_bytes).decode('utf-8')
    is_pdf = filename.lower().endswith('.pdf')
    
    # CSS to make the st.components.v1.html fullscreen overlay
    st.markdown("""
        <style>
        iframe[title="st.components.v1.html"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 999999 !important;
            border: none !important;
        }
        /* Style Streamlit close button to float on top-right of fullscreen */
        div.element-container:has(.floating-close-container) + div.element-container {
            position: fixed !important;
            top: 24px !important;
            right: 40px !important;
            z-index: 10000000 !important;
            width: auto !important;
        }
        div.element-container:has(.floating-close-container) + div.element-container button {
            background-color: #24292f !important;
            color: #ffffff !important;
            border: 1px solid #d0d7de !important;
            border-radius: 6px !important;
            font-weight: 600 !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            cursor: pointer !important;
        }
        div.element-container:has(.floating-close-container) + div.element-container button:hover {
            background-color: #cf222e !important;
            border-color: #cf222e !important;
        }
        </style>
    """, unsafe_allow_html=True)

    # Modal HTML/CSS structure
    modal_css = f"""
    <style>
        .modal-overlay {{
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.6); /* User specified: rgba(0,0,0,0.6) */
            backdrop-filter: blur(4px);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Inter', sans-serif;
        }}
        .modal-container {{
            background-color: #ffffff;
            width: 90%;
            max-width: 1000px; /* User specified: max-width 1000px */
            height: 85vh;
            border-radius: 12px; /* User specified: border-radius 12px */
            box-shadow: 0 25px 60px rgba(0,0,0,0.3);
            border: 1px solid #d0d7de;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
        }}
        .modal-header {{
            background-color: #f6f8fa;
            border-bottom: 1px solid #d0d7de;
            padding: 16px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .modal-title-left {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}
        .modal-badge {{
            font-size: 12px;
            font-weight: 600;
            color: #0969da;
            background-color: #f0f6ff;
            padding: 4px 8px;
            border-radius: 4px;
            border: 1px solid rgba(9,105,218,0.15);
            font-family: monospace;
        }}
        .modal-filename {{
            font-size: 15px;
            font-weight: 600;
            color: #1f2328;
            max-width: 600px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        .modal-close-btn {{
            background: none;
            border: none;
            font-size: 20px;
            font-weight: bold;
            color: #57606a;
            cursor: pointer;
            padding: 4px 12px;
            border-radius: 6px;
            transition: all 0.2s;
            margin-right: 120px; /* Leave space for floating Streamlit button */
        }}
        .modal-close-btn:hover {{
            background-color: rgba(207, 34, 46, 0.1);
            color: #cf222e;
        }}
        .modal-body {{
            flex: 1;
            padding: 24px;
            overflow-y: auto;
            background-color: #f6f8fa;
            display: flex;
            flex-direction: column;
        }}
        .text-view-box {{
            background-color: #ffffff;
            border: 1px solid #d0d7de;
            border-radius: 6px;
            padding: 20px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            white-space: pre-wrap;
            line-height: 1.6;
            color: #24292f;
            flex: 1;
            overflow-y: auto;
        }}
        .modal-footer {{
            background-color: #f6f8fa;
            border-top: 1px solid #d0d7de;
            padding: 16px 24px;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }}
        .modal-btn {{
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border: 1px solid #d0d7de;
            transition: all 0.2s;
        }}
        .btn-secondary {{
            background-color: #ffffff;
            color: #24292f;
        }}
        .btn-secondary:hover {{
            background-color: #f3f4f6;
        }}
        .btn-primary {{
            background-color: #0969da;
            color: #ffffff;
            border-color: rgba(27,31,36,0.15);
        }}
        .btn-primary:hover {{
            background-color: #0c61cf;
        }}
    </style>
    """
    
    # Custom st components html implementation
    if is_pdf:
        body_content = f'<iframe src="data:application/pdf;base64,{b64_pdf}#view=FitH" width="100%" height="70vh" style="border:none; border-radius:6px; background:#fff;"></iframe>'
    else:
        body_content = f'<div class="text-view-box">{extracted_text}</div>'
        
    js_download_script = f"""
    <script>
    function downloadOriginal() {{
        const base64Data = "{b64_pdf}";
        const fileName = "{filename}";
        const link = document.createElement('a');
        link.href = 'data:application/octet-stream;base64,' + base64Data;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }}
    function closeModal() {{
        // Hide overlay visually
        document.querySelector('.modal-overlay').style.display = 'none';
        // Instruct parent window to click the hidden/styled close button if possible
        try {{
            window.parent.postMessage({{type: "close"}}, "*");
        }} catch(e) {{}}
    }}
    </script>
    """

    modal_html = f"""
    {js_download_script}
    {modal_css}
    <div class="modal-overlay">
        <div class="modal-container">
            <div class="modal-header">
                <div class="modal-title-left">
                    <span class="modal-badge">{v_id}</span>
                    <span class="modal-filename">{filename}</span>
                </div>
                <button class="modal-close-btn" onclick="closeModal()">✕ Close</button>
            </div>
            <div class="modal-body">
                {body_content}
            </div>
            <div class="modal-footer">
                <a class="modal-btn btn-secondary" href="data:application/pdf;base64,{b64_pdf}" target="_blank">🔗 Open in New Tab</a>
                <button class="modal-btn btn-primary" onclick="downloadOriginal()">📥 Download</button>
            </div>
        </div>
    </div>
    """
    
    # Render component
    st.components.v1.html(modal_html, height=750)
    
    # Styled Close Button in Streamlit
    st.markdown('<div class="floating-close-container"></div>', unsafe_allow_html=True)
    if st.button("❌ Close Preview", key="close_modal_top"):
        st.session_state.view_resume = None
        st.rerun()

# Layout Columns for JD input and Resume upload
col_jd, col_res = st.columns([1, 1], gap="large")

# FEATURE 1: JOB DESCRIPTION INPUT
with col_jd:
    st.subheader("1. Job Description (JD)")
    
    # Hide file uploader label
    jd_file = st.file_uploader(
        "Upload JD Document", 
        type=["pdf", "docx", "txt"], 
        label_visibility="collapsed",
        key="jd_file_uploader"
    )
    
    # Paste text area
    jd_text = st.text_area(
        "Paste Job Description here...", 
        height=180, 
        placeholder="Or paste the Job Description text here directly...",
        key="jd_text_input"
    )
    
    # Logic matching: If file uploaded and text area empty, auto-extract
    final_jd = ""
    if jd_text.strip():
        final_jd = DocumentExtractor.clean_text(jd_text)
    elif jd_file is not None:
        file_bytes = jd_file.read()
        ext = jd_file.name.split('.')[-1].lower()
        if ext == "pdf":
            final_jd = DocumentExtractor.from_pdf(file_bytes)
        elif ext == "docx":
            final_jd = DocumentExtractor.from_docx(file_bytes)
        else:
            final_jd = DocumentExtractor.from_txt(file_bytes)

# FEATURE 2: RESUME UPLOAD WITH ID SYSTEM
with col_res:
    st.subheader("2. Candidate Resumes")
    
    res_files = st.file_uploader(
        "Upload Resumes (PDF, DOCX, TXT, ZIP)",
        type=["pdf", "docx", "txt", "zip"],
        accept_multiple_files=True,
        key="resumes_uploader"
    )
    
    if res_files:
        st.markdown(f'<span class="id-badge" style="font-size:13px; padding: 4px 10px;">📄 {len(res_files)} files selected</span>', unsafe_allow_html=True)

# Process trigger section
st.markdown("<br>", unsafe_allow_html=True)
process_col1, process_col2, process_col3 = st.columns([1, 1, 1])

with process_col2:
    process_btn = st.button("🔍 Run DeepHire AI Match", type="primary", use_container_width=True, key="start_matching_process")

# Validation and AI Processing (FEATURE 3)
if process_btn:
    if not final_jd.strip():
        st.warning("⚠️ Please upload or paste a Job Description before proceeding.")
    elif not res_files:
        st.warning("⚠️ Please select at least one candidate resume or a ZIP package.")
    else:
        # Step 1: Text extraction with progress bar
        extraction_bar = st.progress(0, text="Extracting and preparing resume documents...")
        
        extracted_list = []
        raw_resumes_dict = {}
        
        total_files = len(res_files)
        
        for idx, file in enumerate(res_files):
            file_bytes = file.read()
            filename = file.name
            ext = filename.split('.')[-1].lower()
            
            # Progress update
            progress_val = int(((idx + 1) / total_files) * 100)
            extraction_bar.progress(progress_val, text=f"Processing file {idx+1}/{total_files}: {filename}")
            
            if ext == "zip":
                extracted_items = DocumentExtractor.process_zip(file_bytes)
                for item in extracted_items:
                    extracted_list.append({
                        "filename": item["filename"],
                        "text": item["text"],
                        "bytes": item["raw_bytes"]
                    })
            else:
                text_content = ""
                if ext == "pdf":
                    text_content = DocumentExtractor.from_pdf(file_bytes)
                elif ext == "docx":
                    text_content = DocumentExtractor.from_docx(file_bytes)
                else:
                    text_content = DocumentExtractor.from_txt(file_bytes)
                
                extracted_list.append({
                    "filename": filename,
                    "text": text_content,
                    "bytes": file_bytes
                })
        
        extraction_bar.progress(100, text="Extraction completed! Storing candidate files...")
        
        # Build IDs sequential list
        st_resumes = {}
        engine_payload = []
        
        for idx, item in enumerate(extracted_list):
            res_id = f"RES-{idx + 1:04d}"
            st_resumes[res_id] = {
                "filename": item["filename"],
                "bytes": item["bytes"],
                "text": item["text"]
            }
            engine_payload.append({
                "id": res_id,
                "filename": item["filename"],
                "text": item["text"]
            })
            
        # Store in session state for downloading/viewing
        st.session_state.stored_resumes = st_resumes
        
        # Step 2: Scoring candidates via AI Recruitment Engine
        groq_api_key = os.getenv("GROQ_API_KEY", "gsk_actual_key_here")
        
        with st.spinner(f"Analyzing {len(engine_payload)} resumes using Llama 3.3 model..."):
            engine = AIRecruitmentEngine(api_key=groq_api_key)
            scored_candidates = engine.score_candidates(
                jd_text=final_jd,
                resume_data=engine_payload,
                batch_size=5
            )
            
            st.session_state.results = scored_candidates
            st.session_state.page = 1
            st.success("🎉 AI match analysis completed successfully!")
            st.rerun()

# FEATURE 4: GITHUB-STYLE RESULTS TABLE WITH PAGINATION
if st.session_state.results:
    st.markdown("---")
    st.subheader("Match Analysis Results")
    
    results = st.session_state.results
    
    # Stats Row
    scores = [r["overall_score"] for r in results]
    avg_score = sum(scores) / len(scores) if scores else 0
    top_score = max(scores) if scores else 0
    strong_matches = sum(1 for s in scores if s >= 80)
    low_matches = sum(1 for s in scores if s < 50)
    
    s_col1, s_col2, s_col3, s_col4, s_col5 = st.columns(5)
    
    with s_col1:
        st.markdown(f"""
        <div class="stats-card">
            <div class="stats-title">Total Processed</div>
            <div class="stats-value" style="color:#0969da;">{len(results)}</div>
        </div>
        """, unsafe_allow_html=True)
    with s_col2:
        st.markdown(f"""
        <div class="stats-card">
            <div class="stats-title">Top Score</div>
            <div class="stats-value" style="color:#1a7f37;">{top_score}%</div>
        </div>
        """, unsafe_allow_html=True)
    with s_col3:
        st.markdown(f"""
        <div class="stats-card">
            <div class="stats-title">Average Score</div>
            <div class="stats-value" style="color:#bf8700;">{avg_score:.1f}%</div>
        </div>
        """, unsafe_allow_html=True)
    with s_col4:
        st.markdown(f"""
        <div class="stats-card">
            <div class="stats-title">Strong Matches</div>
            <div class="stats-value" style="color:#1a7f37;">{strong_matches}</div>
        </div>
        """, unsafe_allow_html=True)
    with s_col5:
        st.markdown(f"""
        <div class="stats-card">
            <div class="stats-title">Low Matches</div>
            <div class="stats-value" style="color:#cf222e;">{low_matches}</div>
        </div>
        """, unsafe_allow_html=True)
        
    st.markdown("<br>", unsafe_allow_html=True)

    # Export options row (FEATURE 6)
    exp_col1, exp_col2 = st.columns([6, 1])
    with exp_col2:
        df = pd.DataFrame(results)
        
        # 1. CSV Download
        csv_data = df.to_csv(index=False).encode('utf-8')
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        
        st.download_button(
            label="📥 Export to CSV",
            data=csv_data,
            file_name=f"deephire_{timestamp}.csv",
            mime="text/csv",
            key="csv_download_btn_unique"
        )
        
        # 2. Excel Download using BytesIO + xlsxwriter
        excel_buffer = io.BytesIO()
        with pd.ExcelWriter(excel_buffer, engine="xlsxwriter") as writer:
            df.to_excel(writer, index=False, sheet_name="Candidate Scores")
            
        st.download_button(
            label="📊 Export to Excel",
            data=excel_buffer.getvalue(),
            file_name=f"deephire_{timestamp}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            key="xlsx_download_btn_unique"
        )
        
    # Pagination
    total_items = len(results)
    items_per_page = 10
    total_pages = max(1, (total_items + items_per_page - 1) // items_per_page)
    
    # Row slice
    start_idx = (st.session_state.page - 1) * items_per_page
    end_idx = min(start_idx + items_per_page, total_items)
    page_results = results[start_idx:end_idx]
    
    # Table headers
    st.markdown("""
    <div class="github-grid-header">
        <div>#</div>
        <div>ID</div>
        <div>NAME</div>
        <div>EMAIL</div>
        <div>PHONE</div>
        <div>SCORE</div>
        <div>TECH</div>
        <div>EXP</div>
        <div>PRIORITY</div>
        <div>RECOMMENDATION</div>
        <div style="text-align: right;">VIEW</div>
    </div>
    """, unsafe_allow_html=True)
    
    # Render table rows matching GitHub styles precisely
    for i, r in enumerate(page_results):
        r_index = start_idx + i + 1
        r_id = r["id"]
        r_name = r["name"][:20] + "..." if len(r["name"]) > 20 else r["name"]
        r_email = r["email"][:25] + "..." if len(r["email"]) > 25 else r["email"]
        r_phone = r["phone"]
        r_score = r["overall_score"]
        r_tech = r["technical_depth"]
        r_exp = r["experience_quality"]
        r_priority = r["priority"]
        r_rec = r["recommendation"][:50] + "..." if len(r["recommendation"]) > 50 else r["recommendation"]
        
        # Priority pill design
        if r_priority == "HIGH":
            priority_pill = '<span style="border-radius:12px; padding:2px 8px; font-size:11px; font-weight:600; background-color:#ddf4ff; color:#0969da;">HIGH</span>'
        elif r_priority == "MEDIUM":
            priority_pill = '<span style="border-radius:12px; padding:2px 8px; font-size:11px; font-weight:600; background-color:#fff8c5; color:#9a6700;">MEDIUM</span>'
        else:
            priority_pill = '<span style="border-radius:12px; padding:2px 8px; font-size:11px; font-weight:600; background-color:#ffebe9; color:#cf222e;">LOW</span>'
            
        # Score pill design
        if r_score >= 80:
            score_pill = f'<span style="border-radius:12px; padding:2px 10px; font-weight:600; background-color:#dafbe1; color:#1a7f37;">{r_score}%</span>'
        elif r_score >= 60:
            score_pill = f'<span style="border-radius:12px; padding:2px 10px; font-weight:600; background-color:#fff8c5; color:#9a6700;">{r_score}%</span>'
        else:
            score_pill = f'<span style="border-radius:12px; padding:2px 10px; font-weight:600; background-color:#ffebe9; color:#cf222e;">{r_score}%</span>'
            
        # Standard Grid columns layout
        row_cols = st.columns([40, 100, 1.5, 2, 1, 70, 60, 60, 70, 1.5, 80])
        
        row_cols[0].markdown(f'<div style="color:#656d76; font-size:13px; font-family:\'JetBrains Mono\', monospace;">{r_index}</div>', unsafe_allow_html=True)
        row_cols[1].markdown(f'<span class="id-badge">{r_id}</span>', unsafe_allow_html=True)
        row_cols[2].markdown(f'<div style="font-weight:500; color:#1f2328;">{r_name}</div>', unsafe_allow_html=True)
        row_cols[3].markdown(f'<div style="color:#656d76; font-size:13px;">{r_email}</div>', unsafe_allow_html=True)
        row_cols[4].markdown(f'<div style="color:#656d76; font-size:13px;">{r_phone}</div>', unsafe_allow_html=True)
        row_cols[5].markdown(score_pill, unsafe_allow_html=True)
        row_cols[6].markdown(f'<div style="font-size:13px; font-weight:500; text-align:center;">{r_tech}</div>', unsafe_allow_html=True)
        row_cols[7].markdown(f'<div style="font-size:13px; font-weight:500; text-align:center;">{r_exp}</div>', unsafe_allow_html=True)
        row_cols[8].markdown(priority_pill, unsafe_allow_html=True)
        row_cols[9].markdown(f'<div style="color:#656d76; font-size:13px;">{r_rec}</div>', unsafe_allow_html=True)
        
        # View Button using custom key matching pagination
        with row_cols[10]:
            if st.button("📄 View", key=f"viewbtn_{r_id}_{st.session_state.page}"):
                st.session_state.view_resume = r_id
                st.rerun()
                
        # Custom hover divider lines
        st.markdown('<hr style="margin:0; border:none; border-bottom:1px solid #d0d7de;">', unsafe_allow_html=True)
        
    st.markdown("<br>", unsafe_allow_html=True)

    # Pagination footer controls
    pag_col1, pag_col2, pag_col3 = st.columns([1, 2, 1])
    
    with pag_col1:
        prev_disabled = st.session_state.page <= 1
        if st.button("◀ Prev", disabled=prev_disabled, key=f"prev_{st.session_state.page}"):
            st.session_state.page -= 1
            st.rerun()
            
    with pag_col2:
        st.markdown(f'<div style="text-align: center; color:#656d76; font-weight:500; font-size:13px; margin-top:8px;">Page {st.session_state.page} of {total_pages}</div>', unsafe_allow_html=True)
        
    with pag_col3:
        next_disabled = st.session_state.page >= total_pages
        if st.button("Next ▶", disabled=next_disabled, key=f"next_{st.session_state.page}"):
            st.session_state.page += 1
            st.rerun()

# Global Footer
st.markdown("<br><hr>", unsafe_allow_html=True)
st.markdown('<div style="text-align:center; color:#656d76; font-size:12px; padding-bottom: 20px;">DeepHire — AI-Powered Recruitment Intelligence</div>', unsafe_allow_html=True)
