"""Entry point for the Terraflow MCP server.

Usage:
    python -m lfx.mcp
    # or via console script:
    lfx-mcp

Environment variables:
    TERRAFLOW_SERVER_URL: Terraflow server URL (default: http://10.171.205.153:7860)
    TERRAFLOW_API_KEY: API key for authentication (skips login)
"""

from lfx.mcp.server import mcp


def main():
    mcp.run()


if __name__ == "__main__":
    main()
