from app.services.validation_service import validate_aadhaar, validate_pan, validate_dl, calculate_scoring
from app.schemas.document import DocumentType

def test_validate_aadhaar():
    valid = "My Aadhaar is 1234 5678 9012"
    invalid = "My Aadhaar is 123456789012" # No spaces
    
    is_valid, num, score = validate_aadhaar(valid)
    assert is_valid
    assert num == "1234 5678 9012"
    
    is_valid, _, _ = validate_aadhaar(invalid)
    assert not is_valid

def test_validate_pan():
    valid = "My PAN is ABCDE1234F"
    invalid = "My PAN is ABCDE12345" # Last char digit
    
    is_valid, num, score = validate_pan(valid)
    assert is_valid
    assert num == "ABCDE1234F"
    
    is_valid, _, _ = validate_pan(invalid)
    assert not is_valid

def test_scoring():
    text = "government of india aadhaar 1234 5678 9012"
    score = calculate_scoring(text, DocumentType.AADHAAR)
    # 2 keywords (government of india, aadhaar) -> 0.3 + 0.1 = 0.4
    assert score >= 0.4
