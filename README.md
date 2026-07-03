# PhishLens — Multimodal Phishing Screenshot Analyzer

Detects phishing in screenshots using a 4-stage AI pipeline:

| Stage | Model | Purpose |
|-------|-------|---------|
| 1 | BLIP (Salesforce) | Visual scene understanding |
| 2 | EasyOCR | Text extraction from image |
| 3 | VirusTotal API | URL reputation scanning |
| 4 | Groq / LLaMA-3.3-70B | Threat synthesis + risk scoring |

---

## Setup

### 1. Clone & create `.env`
```bash
cp .env.example .env
# Fill in GROQ_API_KEY and VIRUSTOTAL_API_KEY
```
Get your keys:
- Groq: https://console.groq.com
- VirusTotal: https://www.virustotal.com/gui/my-apikey (free tier)

### 2. Backend
```bash
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
python app.py
```

### 3. Frontend (separate terminal)
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## How it works

1. Upload a suspicious email / webpage screenshot
2. BLIP generates a visual description of the layout and visual cues
3. EasyOCR extracts all visible text including URLs, sender info, CTAs
4. Extracted URLs are submitted to VirusTotal for reputation check
5. All signals fed to LLaMA-3 via Groq for a structured threat report:
   - Risk score (0–100)
   - Risk level (Low / Medium / High / Critical)
   - Specific phishing indicators detected
   - Recommended action

---

## Tech Stack

**Backend:** Python · Flask · BLIP · EasyOCR · Groq API · VirusTotal API  
**Frontend:** React · Vite · Tailwind CSS

---

## Evaluation

To benchmark against real phishing data:
1. Download samples from [PhishTank](https://phishtank.org/developer_info.php) (free CSV)
2. Take screenshots of flagged URLs
3. Run through `/analyze` endpoint
4. Log `risk_score` and `risk_level` against known labels
5. Compute precision / recall
