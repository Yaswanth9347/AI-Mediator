from app.schemas.document import DocumentType, VerificationResponse, VerificationStatus
from app.services.validation_service import validate_aadhaar, validate_pan, validate_dl, calculate_scoring
from app.core.config import settings

def classify_and_verify(text: str) -> VerificationResponse:
    """
    Analyze text to determine document type and validity.
    """
    detected_type = DocumentType.UNKNOWN
    id_number = None
    base_confidence = 0.0
    
    # Check all document types and their confidence scores
    candidates = []
    
    # 1. Check Aadhaar
    is_aadhaar, aadhaar_no, aadhaar_score = validate_aadhaar(text)
    if is_aadhaar:
        candidates.append((DocumentType.AADHAAR, aadhaar_no, aadhaar_score))

    # 2. Check PAN
    is_pan, pan_no, pan_score = validate_pan(text)
    if is_pan:
        candidates.append((DocumentType.PAN, pan_no, pan_score))

    # 3. Check Driving License
    is_dl, dl_no, dl_score = validate_dl(text)
    if is_dl:
        candidates.append((DocumentType.DRIVING_LICENCE, dl_no, dl_score))

    # If multiple candidates, choose the one with highest confidence
    # but also consider keyword scoring for disambiguation
    if len(candidates) > 1:
        # Calculate keyword scores for each candidate
        scored_candidates = []
        for doc_type, number, base_score in candidates:
            keyword_score = calculate_scoring(text, doc_type)
            total_score = (base_score * 0.6) + (keyword_score * 0.4)
            scored_candidates.append((doc_type, number, base_score, total_score))
        
        # Choose the candidate with highest total score
        best_candidate = max(scored_candidates, key=lambda x: x[3])
        detected_type, id_number, base_confidence = best_candidate[0], best_candidate[1], best_candidate[2]
    
    elif len(candidates) == 1:
        detected_type, id_number, base_confidence = candidates[0]

    # 2. Keyword Fallback (Weak Signal) - If no regex match found
    if detected_type == DocumentType.UNKNOWN:
        # Check scores for all types using calculate_scoring
        scores = {}
        for dtype in [DocumentType.AADHAAR, DocumentType.PAN, DocumentType.DRIVING_LICENCE]:
            scores[dtype] = calculate_scoring(text, dtype)
        
        # Find best match
        best_type, best_kw_score = max(scores.items(), key=lambda x: x[1])
        
        # If we have at least some keyword matches (score > 0), assume that type
        if best_kw_score > 0:
            detected_type = best_type
            base_confidence = 0.0 # No regex match, so base is 0
    
    # Calculate final confidence
    final_score = 0.0
    keyword_score = 0.0
    if detected_type != DocumentType.UNKNOWN:
        keyword_score = calculate_scoring(text, detected_type)
        # Weight: 60% Regex/Base, 40% Keywords
        final_score = (base_confidence * 0.6) + (keyword_score)
        
        # Boost if strong regex match (base=1.0) and keywords match
        if base_confidence >= 0.8 and keyword_score > 0:
            final_score = min(final_score + 0.2, 0.99)
            
        final_score = min(final_score, 0.99)

    extracted_fields = {}
    if id_number:
        extracted_fields["id_number"] = id_number

    status = VerificationStatus.REJECTED
    reason = None
    
    if detected_type == DocumentType.UNKNOWN:
        reason = "Could not identify document type. No supported ID keywords or patterns found."
    else:
        if final_score >= settings.CONFIDENCE_THRESHOLD_HIGH:
            status = VerificationStatus.VERIFIED
        elif final_score >= settings.CONFIDENCE_THRESHOLD_LOW:
            status = VerificationStatus.VERIFIED
        else:
            status = VerificationStatus.REJECTED
            reason = f"Confidence score ({round(final_score, 2)}) too low for {detected_type.value}. Validation failed."

    return VerificationResponse(
        status=status,
        detected_document_type=detected_type,
        confidence_score=round(final_score, 2),
        failure_reason=reason, # Explicitly use field name
        extracted_fields=extracted_fields,
        raw_ocr_text=text # Return text for debugging
    )
