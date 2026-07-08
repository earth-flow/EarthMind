"""Entry point for the EarthMind MCP server.

Usage:
    python -m lfx.mcp
    # or via console script:
    lfx-mcp

Environment variables:
    EARTHMIND_SERVER_URL: EarthMind server URL (default: http://10.171.205.153:7860)
    EARTHMIND_API_KEY: API key for authentication (skips login)
"""

from lfx.mcp.server import mcp


def main():
    mcp.run()


if __name__ == "__main__":
    main()
