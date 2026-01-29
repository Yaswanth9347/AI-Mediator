import io
from typing import Union, List
from PIL import Image
import numpy as np
import cv2
import pytesseract
from pdf2image import convert_from_bytes
from app.core.exceptions import DocumentProcessingError

def load_image_file(file_content: bytes, content_type: str) -> Image.Image:
    """
    Load an image from bytes. Handles basic image formats and PDF.
    Returns a PIL Image.
    """
    try:
        if content_type == "application/pdf":
            images = convert_from_bytes(file_content, dpi=300)
            if not images:
                raise DocumentProcessingError("Empty PDF file")
            return images[0]
        else:
            image = Image.open(io.BytesIO(file_content))
            return image
    except Exception as e:
        error_msg = str(e)
        if "Incorrect password" in error_msg or "password" in error_msg.lower():
            raise DocumentProcessingError("This PDF is password protected. Please upload an unlocked PDF.")
        raise DocumentProcessingError(f"Failed to load image: {error_msg}")

def preprocess_image(image: Image.Image) -> Image.Image:
    """
    Apply preprocessing to improve OCR accuracy.
    - Convert to grayscale
    - Rescale if too small
    - Apply mild denoising
    """
    try:
        # Handle transparency (RGBA) - Paste on white background
        if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
            alpha = image.convert('RGBA').split()[-1]
            bg = Image.new("RGB", image.size, (255, 255, 255))
            bg.paste(image, mask=alpha)
            image = bg
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        cv_image = np.array(image)
        
        # Convert to Grayscale
        gray = cv2.cvtColor(cv_image, cv2.COLOR_RGB2GRAY)
        
        # Check resolution and resize if needed (simple heuristic)
        height, width = gray.shape
        # Check resolution and resize if needed (simple heuristic)
        height, width = gray.shape
        if width < 2000: # Increased from 1000 to ensure better detailing
            scale_percent = 200 # Percent of original size
            width = int(gray.shape[1] * scale_percent / 100)
            height = int(gray.shape[0] * scale_percent / 100)
            dim = (width, height)
            gray = cv2.resize(gray, dim, interpolation=cv2.INTER_CUBIC)
            
        # DEBUG: Check if image is blank
        mean_val = np.mean(gray)
        import structlog
        logger = structlog.get_logger()
        logger.info("Image Preprocessing Stats", width=width, height=height, mean_brightness=mean_val)
        
        # Apply Adaptive Thresholding to clean up background noise
        # Block size 31, C=10 (lowered from 15) to preserve lighter text
        gray = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
        )
            
        # Orientation Correction
        image_for_osd = Image.fromarray(gray)
        try:
            osd = pytesseract.image_to_osd(image_for_osd)
            rotation = 0
            # Parse OSD output which looks like "Rotate: 90\n..."
            import re
            rotate_match = re.search(r"Rotate: (\d+)", osd)
            if rotate_match:
                rotation = int(rotate_match.group(1))
            
            if rotation == 90:
                gray = cv2.rotate(gray, cv2.ROTATE_90_CLOCKWISE)
            elif rotation == 180:
                gray = cv2.rotate(gray, cv2.ROTATE_180)
            elif rotation == 270:
                gray = cv2.rotate(gray, cv2.ROTATE_90_COUNTERCLOCKWISE)
                
        except Exception:
            # OSD can fail on small or messy images; safe to ignore and proceed with original
            pass

        return Image.fromarray(gray)
    except Exception as e:
         raise DocumentProcessingError(f"Image preprocessing failed: {str(e)}")
