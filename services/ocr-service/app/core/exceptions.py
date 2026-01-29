from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
import structlog

logger = structlog.get_logger()

async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal Server Error"},
    )

async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning("HTTP exception", status_code=exc.status_code, detail=exc.detail, path=request.url.path)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

class DocumentProcessingError(Exception):
    """Raised when document processing fails (e.g. corrupted file)"""
    def __init__(self, message: str):
        self.message = message

async def document_processing_exception_handler(request: Request, exc: DocumentProcessingError):
    logger.warning("Document processing error", error=exc.message)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"status": "rejected", "reason": exc.message},
    )
