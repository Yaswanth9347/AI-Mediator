from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from enum import Enum

class DocumentType(str, Enum):
    AADHAAR = "aadhaar"
    PAN = "pan"
    DRIVING_LICENCE = "driving_license"
    UNKNOWN = "unknown"

class VerificationStatus(str, Enum):
    VERIFIED = "verified"
    REJECTED = "rejected"

class VerificationResponse(BaseModel):
    status: VerificationStatus
    detected_document_type: DocumentType
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    failure_reason: Optional[str] = Field(None, serialization_alias="reason")
    extracted_fields: Optional[Dict[str, Any]] = None
    raw_ocr_text: Optional[str] = None  # Added for debugging

    model_config = ConfigDict(populate_by_name=True)

class ErrorResponse(BaseModel):
    status: str = "rejected"
    reason: str
