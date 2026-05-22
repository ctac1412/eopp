from src.utils import get_valid_variant_index


def make_captcha(valid_index):
    return {
        "puzzle": {
            "tiles": [{"tileId": "tile-1", "imageData": ""}],
            "variantsCapture": [["tile-1"], ["tile-1"]],
        },
        "valid_index": valid_index,
    }


def test_valid_index_zero_is_a_valid_label():
    assert get_valid_variant_index(make_captcha(0)) == 0


def test_valid_index_null_is_not_a_valid_label():
    assert get_valid_variant_index(make_captcha(None)) is None


def test_valid_index_must_be_inside_variant_range():
    assert get_valid_variant_index(make_captcha(2)) is None
