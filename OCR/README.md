# Government ID Verification Service

A stateless microservice to classify and validate Indian government ID documents (Aadhaar, PAN, Driving Licence).

## Key Features
- **Document Type Detection**: Automatically classifies Aadhaar, PAN, and Driving Licences.
- **Validation**: regex pattern matching and keyword validation.
- **OCR**: Text extraction using Tesseract.
- **Confidence Scoring**: Returns a confidence score (0-1.0) and detailed verification status.

## Tech Stack
- **Python 3.11**
- **FastAPI**
- **Tesseract OCR**
- **OpenCV & Pillow**
- **Docker**

## Setup & Running

### Prerequisites
- Docker & Docker Compose
- *Or* Python 3.10+ and Tesseract installed locally (`apt-get install tesseract-ocr`)

### Using Docker (Recommended)
1. Build and run:
   ```bash
   docker-compose up --build
   ```
2. App running at `http://localhost:8000`.
3. API Documentation: `http://localhost:8000/api/v1/docs`.

### Local Development
1. Create virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run app:
   ```bash
   uvicorn app.main:app --reload
   ```

## Testing
Run unit and integration tests:
```bash
pytest
```

## API Usage
**POST** `/api/v1/document/verify`
- Form Data: `file` (Image/PDF)
- Response:
  ```json
  {
      "status": "verified",
      "detected_document_type": "pan",
      "confidence_score": 0.95,
      "extracted_fields": {
          "id_number": "ABCDE1234F"
      }
  }
  ```
