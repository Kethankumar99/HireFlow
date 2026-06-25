import json
from typing import List, Dict, Any
from groq import Groq

class AIRecruitmentEngine:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = Groq(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1"
        )

    def _format_batch(self, batch: List[Dict[str, Any]], start_idx: int) -> str:
        formatted = []
        for idx, item in enumerate(batch):
            candidate_id = item.get("id", f"RES-{start_idx + idx:04d}")
            filename = item.get("filename", "Unknown")
            text = item.get("text", "")
            formatted.append(f"--- CANDIDATE ID: {candidate_id} ({filename}) ---\n{text}\n")
        return "\n".join(formatted)

    def score_candidates(self, jd_text: str, resume_data: List[Dict[str, Any]], batch_size: int = 5) -> List[Dict[str, Any]]:
        results = []
        
        for i in range(0, len(resume_data), batch_size):
            batch = resume_data[i:i + batch_size]
            formatted_resumes = self._format_batch(batch, i + 1)
            
            prompt = (
                f"You are an AI recruiter. Analyze these {len(batch)} candidates for this JD.\n"
                f"CRITICAL: First extract these 3 fields from the resume text above everything else:\n"
                f"1. FULL NAME: Look at the top of resume, find the person's complete name. Skip section headers like 'RESUME', 'CV', 'SUMMARY'. Return exact name as written.\n"
                f"2. EMAIL: Find any email address pattern (something@domain.com). Return exact email.\n"
                f"3. PHONE: Find any phone number. Accept formats: 9876543210, +91 9876543210, 987-654-3210. Return only 10 digits.\n\n"
                f"Then score the candidate on: overall_score, technical_depth, experience_quality, growth_potential.\n"
                f"Also provide: strength, gap, priority, recommendation.\n\n"
                f"Output MUST be this exact JSON format for EACH candidate item in the JSON array:\n"
                f"{{\n"
                f"  \"id\": \"RES-0001\",\n"
                f"  \"name\": \"John Smith\",\n"
                f"  \"email\": \"john@email.com\",\n"
                f"  \"phone\": \"9876543210\",\n"
                f"  \"overall_score\": 85,\n"
                f"  \"technical_depth\": 80,\n"
                f"  \"experience_quality\": 75,\n"
                f"  \"growth_potential\": 90,\n"
                f"  \"strength\": \"Strong Python architecture skills\",\n"
                f"  \"gap\": \"No cloud experience\",\n"
                f"  \"priority\": \"HIGH\",\n"
                f"  \"recommendation\": \"Interview immediately\"\n"
                f"}}\n\n"
                f"If you cannot find name/email/phone, use 'N/A'. Do not use filename as name. Look at actual resume content.\n"
                f"Output ONLY a valid JSON array of evaluation objects. No other text.\n\n"
                f"JOB DESCRIPTION:\n{jd_text}\n\n"
                f"CANDIDATE RESUMES:\n{formatted_resumes}"
            )
            
            try:
                chat_completion = self.client.chat.completions.create(
                    messages=[
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    model="llama-3.3-70b-versatile",
                    temperature=0.1,
                    max_tokens=4000,
                    response_format={"type": "json_object"}
                )
                
                raw_response = chat_completion.choices[0].message.content
                parsed_data = json.loads(raw_response)
                
                # Check if it returned a dictionary with a key (like "candidates") or a list directly
                if isinstance(parsed_data, dict):
                    # Try to extract array if wrapped
                    for val in parsed_data.values():
                        if isinstance(val, list):
                            parsed_data = val
                            break
                            
                if not isinstance(parsed_data, list):
                    parsed_data = [parsed_data]
                    
                # Merge IDs with the parsed records
                for idx, candidate in enumerate(batch):
                    parsed_item = parsed_data[idx] if idx < len(parsed_data) else {}
                    
                    results.append({
                        "id": candidate.get("id", f"RES-{i + idx + 1:04d}"),
                        "name": parsed_item.get("name", f"Candidate {i + idx + 1}"),
                        "email": parsed_item.get("email", "Not specified"),
                        "phone": parsed_item.get("phone", "Not specified"),
                        "overall_score": int(parsed_item.get("overall_score", 50)),
                        "technical_depth": int(parsed_item.get("technical_depth", 50)),
                        "experience_quality": int(parsed_item.get("experience_quality", 50)),
                        "growth_potential": int(parsed_item.get("growth_potential", 50)),
                        "strength": parsed_item.get("strength", "Good credentials")[:50],
                        "gap": parsed_item.get("gap", "N/A")[:50],
                        "priority": parsed_item.get("priority", "MEDIUM").upper(),
                        "recommendation": parsed_item.get("recommendation", "Review manually.")
                    })
                    
            except Exception as e:
                print(f"Error processing batch starting with index {i}: {e}")
                # Fallback entries in case of error so user's execution doesn't fail
                for idx, candidate in enumerate(batch):
                    results.append({
                        "id": candidate.get("id", f"RES-{i + idx + 1:04d}"),
                        "name": f"Error parsing {candidate.get('filename')}",
                        "email": "N/A",
                        "phone": "N/A",
                        "overall_score": 0,
                        "technical_depth": 0,
                        "experience_quality": 0,
                        "growth_potential": 0,
                        "strength": "Processing error",
                        "gap": "AI evaluation failed",
                        "priority": "LOW",
                        "recommendation": f"Manual file inspection required due to: {str(e)}"
                    })
                    
        return results
