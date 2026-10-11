from app.security import create_access_token, decode_access_token, hash_password, verify_password

def test_password_hash_is_not_plain_text_and_verifies() -> None:
    password = "Correct-Horse-42!"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong-password", hashed)

def test_access_token_round_trip() -> None:
    payload = decode_access_token(create_access_token("123"))
    assert payload is not None
    assert payload["sub"] == "123"

def test_malformed_access_token_is_rejected() -> None:
    assert decode_access_token("not.a.valid.token") is None
