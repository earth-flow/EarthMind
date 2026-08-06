"""Entry point for running the Terraflow Agentic MCP server.

This allows running the server with:
    python -m terraflow.agentic.mcp
"""

from terraflow.agentic.mcp.server import mcp

if __name__ == "__main__":
    mcp.run()
