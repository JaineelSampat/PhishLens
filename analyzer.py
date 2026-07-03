"""
PhishLens — 4-stage phishing analysis pipeline
  Stage 1: Visual Analysis   (BLIP)
  Stage 2: Text Extraction   (EasyOCR)
  Stage 3: URL Scanning      (VirusTotal)
  Stage 4: Threat Synthesis  (Groq / LLaMA-3)
"""

import base64
import io
import json
import os
import re
import time

import numpy as np
import requests
import torch
from groq import Groq
from PIL import Image
from transformers import BlipForConditionalGeneration, BlipProcessor

# ---------------------------------------------------------------------------
# Global singletons
# ---------------------------------------------------------------------------
_processor = None
_model = None
_ocr_reader = None
_groq_client = None


def load_models():
    global _processor, _model, _ocr_reader, _groq_client

    print("Loading BLIP model...")
    _processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
    _model = BlipForConditionalGeneration.from_pretrained(
        "Salesforce/blip-image-captioning-base"
    )
    _model.eval()
    print("✓ BLIP ready")

    print("Loading EasyOCR (CPU)...")
    import easyocr
    _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    print("✓ EasyOCR ready")

    _groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
    print("✓ Groq client ready")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode_image(image_base64: str) -> Image.Image:
    raw = image_base64.split(",")[-1]
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


# ---------------------------------------------------------------------------
# Stage 1 — Visual Analysis
# ---------------------------------------------------------------------------

def _visual_analysis(image: Image.Image) -> str:
    """Use BLIP to generate a visual description of the screenshot."""
    inputs = _processor(
        images=image,
        text="a screenshot showing",
        return_tensors="pt",
    )
    with torch.no_grad():
        ids = _model.generate(**inputs, max_new_tokens=120, num_beams=5)
    return _processor.decode(ids[0], skip_special_tokens=True).strip()


# ---------------------------------------------------------------------------
# Stage 2 — Text Extraction
# ---------------------------------------------------------------------------

def _extract_text(image: Image.Image) -> str:
    """Run EasyOCR on the image and return concatenated text."""
    results = _ocr_reader.readtext(np.array(image))
    return " ".join(text for _, text, conf in results if conf > 0.25)


# ---------------------------------------------------------------------------
# Stage 3 — URL Scanning
# ---------------------------------------------------------------------------

_URL_RE = re.compile(r"https?://[^\s<>\"'{}|\\^`\[\]]+")

def _extract_urls(text: str) -> list[str]:
    return list(dict.fromkeys(_URL_RE.findall(text)))  # deduplicated, order preserved


def _scan_url(url: str, api_key: str) -> dict:
    if not api_key:
        return {"url": url, "verdict": "skipped", "detail": "No VirusTotal API key set"}

    headers = {"x-apikey": api_key}
    try:
        # Submit URL
        r = requests.post(
            "https://www.virustotal.com/api/v3/urls",
            headers=headers,
            data={"url": url},
            timeout=10,
        )
        r.raise_for_status()
        analysis_id = r.json()["data"]["id"]

        # Poll for result (up to 3 attempts)
        for _ in range(3):
            time.sleep(2)
            r2 = requests.get(
                f"https://www.virustotal.com/api/v3/analyses/{analysis_id}",
                headers=headers,
                timeout=10,
            )
            r2.raise_for_status()
            attrs = r2.json()["data"]["attributes"]
            if attrs["status"] == "completed":
                stats = attrs["stats"]
                malicious  = stats.get("malicious", 0)
                suspicious = stats.get("suspicious", 0)
                verdict = (
                    "malicious"  if malicious  > 0 else
                    "suspicious" if suspicious > 0 else
                    "clean"
                )
                return {
                    "url": url,
                    "verdict": verdict,
                    "malicious_engines":  malicious,
                    "suspicious_engines": suspicious,
                }

        return {"url": url, "verdict": "timeout", "detail": "Analysis took too long"}

    except Exception as exc:
        return {"url": url, "verdict": "error", "detail": str(exc)}


def _scan_urls(urls: list[str]) -> list[dict]:
    vt_key = os.environ.get("VIRUSTOTAL_API_KEY", "")
    results = []
    for url in urls[:5]:            # cap at 5 to stay within free-tier limits
        results.append(_scan_url(url, vt_key))
        time.sleep(15)              # VirusTotal free tier: 4 req/min
    return results


# ---------------------------------------------------------------------------
# Stage 4 — Threat Synthesis (Groq / LLaMA-3)
# ---------------------------------------------------------------------------

_SYNTHESIS_PROMPT = """You are a senior SOC analyst reviewing a potential phishing screenshot.

--- VISUAL DESCRIPTION ---
{visual}

--- EXTRACTED TEXT (OCR) ---
{ocr}

--- URL SCAN RESULTS ---
{urls}

Based on the above, produce a structured threat assessment.
Respond ONLY with a valid JSON object — no markdown fences, no preamble:
{{
  "risk_score": <integer 0-100>,
  "risk_level": "<Low|Medium|High|Critical>",
  "indicators": [<list of specific phishing indicator strings detected>],
  "recommended_action": "<clear, actionable one-liner>",
  "summary": "<2-3 sentence analyst-style narrative>"
}}"""


def _synthesize(visual: str, ocr: str, url_results: list[dict]) -> dict:
    url_block = "\n".join(
        f"  {r['url']}  →  {r['verdict'].upper()}" for r in url_results
    ) or "  No URLs detected in screenshot."

    prompt = _SYNTHESIS_PROMPT.format(
        visual=visual,
        ocr=ocr[:2500],   # keep within context limits
        urls=url_block,
    )

    response = _groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=800,
    )

    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def analyze(image_base64: str) -> dict:
    """Run the full 4-stage pipeline and return a combined report dict."""
    image = _decode_image(image_base64)

    visual = _visual_analysis(image)
    ocr    = _extract_text(image)
    urls   = _extract_urls(ocr)
    url_results = _scan_urls(urls)
    threat = _synthesize(visual, ocr, url_results)

    return {
        "visual_description": visual,
        "extracted_text":     ocr,
        "urls_found":         url_results,
        **threat,
    }
