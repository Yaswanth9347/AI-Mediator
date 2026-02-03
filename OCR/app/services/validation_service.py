import re
from typing import Optional, Dict, Any, Tuple
import structlog
from app.schemas.document import DocumentType

logger = structlog.get_logger()

# Regex Patterns
# Relaxed boundaries to catch IDs stuck to other text
AADHAAR_PATTERN = r'[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}'
PAN_PATTERN = r'[A-Z]{5}[0-9]{4}[A-Z]'
# Improved DL pattern to catch more variations
DL_PATTERN = r'(?:DL|[A-Z]{2})[-\s]?[0-9]{2}[-\s]?[0-9]{4,19}|[A-Z]{2}[0-9]{2}[0-9]{4,19}'

# Regex for keywords to handle missing spaces (common in OCR)
KEYWORD_PATTERNS = {
    DocumentType.AADHAAR: [
        r"aadhaar", r"unique\s*identification\s*authority", r"uidai", r"government\s*of\s*india", r"mera\s*aadhaar",
        r"dob", r"date\s*of\s*birth", r"yob", r"year\s*of\s*birth", r"bale", r"female", r"male"
    ],
    DocumentType.PAN: [
        r"permanent\s*account\s*number", r"income\s*tax\s*department", r"govt\s*of\s*india",
        r"date\s*of\s*birth", r"father's\s*name"
    ],
    DocumentType.DRIVING_LICENCE: [
        r"driving\s*licen[cs]e", r"driving\s*licen[cs]", r"union\s*of\s*india", r"transport\s*department",
        r"valid\s*till", r"issued\s*on", r"motor\s*vehicle", r"transport", r"license\s*to\s*drive",
        r"license\s*no", r"dl\s*no", r"dl\s*number", r"driving", r"licen[cs]e", r"vehicle\s*class",
        r"issuing\s*authority", r"rto", r"regional\s*transport", r"motor\s*driving"
    ]
}

def validate_aadhaar(text: str) -> Tuple[bool, Optional[str], float]:
    match = re.search(AADHAAR_PATTERN, text)
    if match:
        return True, match.group(0), 1.0
    return False, None, 0.0

def validate_pan(text: str) -> Tuple[bool, Optional[str], float]:
    match = re.search(PAN_PATTERN, text)
    if match:
        # Extra check: PAN is usually uppercase. 
        # If found, high confidence.
        return True, match.group(0), 1.0
    return False, None, 0.0

def validate_dl(text: str) -> Tuple[bool, Optional[str], float]:
    text_lower = text.lower()
    
    # Check for DL-specific keywords first (stronger signal for DL)
    dl_keyword_indicators = [
        r"driving\s*licen[cs]e", r"driving\s*licen[cs]", r"motor\s*vehicle", 
        r"license\s*to\s*drive", r"transport\s*department", r"dl\s*no",
        r"regional\s*transport", r"motor\s*driving", r"vehicle\s*class"
    ]
    
    keyword_found = any(re.search(pattern, text_lower) for pattern in dl_keyword_indicators)
    
    # Look for DL number pattern
    match = re.search(DL_PATTERN, text, re.IGNORECASE)
    
    if match:
        dl_number = match.group(0)
        
        # High confidence if we have both pattern and keywords
        if keyword_found:
            return True, dl_number, 0.95
        
        # Medium confidence if pattern found but check for context clues
        if any(word in text_lower for word in ['driving', 'license', 'licence', 'transport', 'vehicle', 'dl']):
            return True, dl_number, 0.85
        
        # Lower confidence if just pattern match
        return True, dl_number, 0.7
    
    # Even if no number pattern, strong keyword presence might indicate DL
    if keyword_found and len([kw for kw in dl_keyword_indicators if re.search(kw, text_lower)]) >= 2:
        return True, None, 0.6
    
    return False, None, 0.0

def calculate_scoring(text: str, doc_type: DocumentType) -> float:
    text_lower = text.lower()
    score = 0.0
    
    # Check Keywords using Regex
    patterns = KEYWORD_PATTERNS.get(doc_type, [])
    found_keywords = 0
    
    for pattern in patterns:
        if re.search(pattern, text_lower):
            found_keywords += 1
    
    if found_keywords >= 1:
        score += 0.4 # Boosted from 0.3
    if found_keywords >= 2:
        score += 0.2 # Bonus boosted
        
    return score
