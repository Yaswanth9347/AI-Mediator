from fastapi.testclient import TestClient
from unittest.mock import patch
from app.schemas.document import DocumentType

def test_verify_pan_success(client: TestClient):
    # Mock OCR to return PAN text
    with patch("app.api.routes.document.extract_text") as mock_ocr:
        mock_ocr.return_value = "Income Tax Department GOVT OF INDIA Permanent Account Number ABCDE1234F"
        
        # Create a dummy image file
        file_content = b"fakeimagecontent"
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        
        with patch("app.api.routes.document.load_image_file") as mock_load:
            with patch("app.api.routes.document.preprocess_image") as mock_prep:
                
                response = client.post("/api/v1/document/verify", files=files)
                
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "verified"
                assert data["detected_document_type"] == "pan"
                assert data["extracted_fields"]["id_number"] == "ABCDE1234F"

def test_verify_unknown_document(client: TestClient):
    with patch("app.api.routes.document.extract_text") as mock_ocr:
        mock_ocr.return_value = "Random text with no IDs"
        
        file_content = b"fakeimagecontent"
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        
        with patch("app.api.routes.document.load_image_file"), patch("app.api.routes.document.preprocess_image"):
            response = client.post("/api/v1/document/verify", files=files)
            
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "rejected"
            assert data["detected_document_type"] == "unknown"

def test_verify_invalid_file_type(client: TestClient):
    files = {"file": ("test.txt", b"text", "text/plain")}
    response = client.post("/api/v1/document/verify", files=files)
    assert response.status_code == 400
