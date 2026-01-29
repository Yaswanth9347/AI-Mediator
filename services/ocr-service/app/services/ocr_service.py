import pytesseract
from PIL import Image
from app.core.exceptions import DocumentProcessingError
import structlog

logger = structlog.get_logger()

def extract_text(image: Image.Image) -> str:
    """
    Extract text from an image using Tesseract OCR.
    """
    try:
        # Tesseract configurations to try in order
        configs = [
            r'--oem 1 --psm 3',   # Default: Fully automatic page segmentation
            r'--oem 1 --psm 6',   # Assume a single uniform block of text
            r'--oem 1 --psm 4',   # Assume a single column of text of variable sizes
            r'--oem 1 --psm 11',  # Sparse text. Find as much text as possible in no particular order.
        ]
        
        text = ""
        for config in configs:
            logger.info("Running OCR", config=config)
            text = pytesseract.image_to_string(image, config=config, lang='eng')
            text = text.strip()
            if len(text) > 10: # If we found something substantial, stop
                break
        
        logger.info("OCR Extraction Complete", text_length=len(text), content_preview=text[:50])
        return text
    except Exception as e:
        logger.error("OCR failed", error=str(e))
        raise DocumentProcessingError(f"Text extraction failed: {str(e)}")
