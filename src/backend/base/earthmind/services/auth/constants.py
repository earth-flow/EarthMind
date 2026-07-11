"""Auth-related constants shared by service and utils (avoids circular imports)."""

AUTO_LOGIN_WARNING = "In v2.0, EARTHMIND_SKIP_AUTH_AUTO_LOGIN will be removed. Please update your authentication method."
AUTO_LOGIN_ERROR = (
    "Since v1.5, EARTHMIND_AUTO_LOGIN requires a valid API key. "
    "Set EARTHMIND_SKIP_AUTH_AUTO_LOGIN=true to skip this check. "
    "Please update your authentication method."
)
