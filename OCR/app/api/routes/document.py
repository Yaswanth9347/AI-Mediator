from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from typing import Optional
import structlog
from app.schemas.document import VerificationResponse, VerificationStatus
from app.services.image_processing import load_image_file, preprocess_image
from app.services.ocr_service import extract_text
from app.services.classification_service import classify_and_verify
from app.core.exceptions import DocumentProcessingError

router = APIRouter()
logger = structlog.get_logger()

MAX_FILE_SIZE = 5 * 1024 * 1024 # 5 MB
ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"]

@router.post("/verify", response_model=VerificationResponse)
async def verify_document(
    file: UploadFile = File(...),
    declared_document_type: Optional[str] = Form(None)
):
    """
    Verify an uploaded government ID document.
    """
    logger.info("Received verification request", filename=file.filename, content_type=file.content_type)

    # 1. Validate File Metadata
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Unsupported file type. Allowed: {ALLOWED_MIME_TYPES}"
        )
    
    # Check size (requires reading, but for max 5MB it's okay to read into memory)
    # Alternatively we can check 'content-length' header but it can be spoofed.
    # We will read chunks to be safe? 
    # For simplicity and given 5MB limit, reading to bytes is fine.
    file_content = await file.read()
    
    if len(file_content) > MAX_FILE_SIZE:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="File size exceeds 5 MB limit"
        )
    
    if len(file_content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Empty file"
        )

    try:
        # 2. Load & Preprocess
        image = load_image_file(file_content, file.content_type)
        processed_image = preprocess_image(image)
        
        # 3. OCR
        text = extract_text(processed_image)
        logger.info("OCR Extraction Complete", text_length=len(text))
        
        # 4. Classification & Verification
        result = classify_and_verify(text)
        
        # Log result
        logger.info(
            "Verification Complete", 
            status=result.status, 
            type=result.detected_document_type, 
            score=result.confidence_score
        )
        
        return result

    except DocumentProcessingError as e:
        # These are handled by the exception handler, but we re-raise explicitly to be clear
        raise e
    except Exception as e:
        logger.error("Unexpected error in verification pipeline", error=str(e))
        raise HTTPException(status_code=500, detail="Internal processing error")
