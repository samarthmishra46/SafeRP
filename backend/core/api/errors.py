"""Consistent JSON error shape: {"error": {"code", "message", "details"?}}."""

import logging

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from core.errors import PlanningError, UpstreamError

logger = logging.getLogger(__name__)


def error_response(code: str, message: str, http_status: int, details=None) -> Response:
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return Response(body, status=http_status)


def _first_message(detail) -> str:
    if isinstance(detail, dict):
        for key, value in detail.items():
            msg = _first_message(value)
            return msg if key == "non_field_errors" else f"{key}: {msg}"
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    return str(detail)


def exception_handler(exc, context):
    if isinstance(exc, UpstreamError):
        logger.warning("Upstream failure: %s", exc)
        return error_response(
            "upstream_error",
            f"{exc.service} is unavailable right now: {exc.message}",
            status.HTTP_502_BAD_GATEWAY,
        )
    if isinstance(exc, PlanningError):
        return error_response(exc.code, exc.message, exc.http_status)
    if isinstance(exc, exceptions.ValidationError):
        return error_response(
            "invalid_request", _first_message(exc.detail), status.HTTP_400_BAD_REQUEST, exc.detail
        )
    if isinstance(exc, exceptions.Throttled):
        wait = f" Try again in {int(exc.wait)} seconds." if exc.wait else ""
        return error_response(
            "rate_limited", f"Too many requests.{wait}", status.HTTP_429_TOO_MANY_REQUESTS
        )

    response = drf_exception_handler(exc, context)
    if response is not None:
        return error_response(
            getattr(exc, "default_code", "error"),
            _first_message(response.data),
            response.status_code,
        )

    logger.exception("Unhandled error", exc_info=exc)
    return error_response(
        "internal_error", "Something went wrong on our side.", status.HTTP_500_INTERNAL_SERVER_ERROR
    )
