"""Exceptions shared by services and the API layer."""


class UpstreamError(Exception):
    """A third-party API failed or returned something unusable (-> HTTP 502)."""

    def __init__(self, service: str, message: str):
        super().__init__(f"{service}: {message}")
        self.service = service
        self.message = message


class PlanningError(Exception):
    """The request is valid but cannot be planned, e.g. no route or beyond forecast horizon."""

    def __init__(self, message: str, code: str = "unplannable", http_status: int = 422):
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status
