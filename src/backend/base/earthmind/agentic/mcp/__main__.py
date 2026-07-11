"""Entry point for running the EarthMind Agentic MCP server.

This allows running the server with:
    python -m earthmind.agentic.mcp
"""

from earthmind.agentic.mcp.server import mcp

if __name__ == "__main__":
    mcp.run()
