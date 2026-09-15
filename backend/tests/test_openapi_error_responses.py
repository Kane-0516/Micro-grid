"""Tests that documented HTTP error codes appear in the OpenAPI schema."""

from app.main import app


def test_product_admin_error_responses_are_documented():
    """Product-admin write/delete routes document their error responses."""
    paths = app.openapi()["paths"]

    assert {"400", "404"} <= set(
        paths["/api/admin/products/settings/{key}"]["put"]["responses"]
    )
    assert {"400", "404"} <= set(
        paths["/api/admin/products/{category}"]["post"]["responses"]
    )
    assert {"400", "404"} <= set(
        paths["/api/admin/products/{category}/{key}"]["put"]["responses"]
    )
    assert (
        "404"
        in paths["/api/admin/products/{category}/{key}"]["delete"]["responses"]
    )


def test_geocode_error_responses_are_documented():
    """Geocode/reverse-geocode routes document their error responses."""
    paths = app.openapi()["paths"]

    geocode_responses = paths["/api/geocode"]["get"]["responses"]
    reverse_responses = paths["/api/reverse-geocode"]["get"]["responses"]
    assert {"404", "500", "502", "503"} <= set(geocode_responses)
    assert {"404", "500", "502", "503"} <= set(reverse_responses)
