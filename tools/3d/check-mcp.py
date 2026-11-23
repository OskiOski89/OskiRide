"""Read-only end-to-end check of the installed MCP server and an open Blender."""

import asyncio
import json
import os
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    config = json.loads(Path(__file__).with_name("toolchain.local.json").read_text(encoding="utf-8"))
    environment = dict(os.environ, PYTHONUTF8="1", BLENDER_HOST="127.0.0.1", DISABLE_TELEMETRY="true")
    params = StdioServerParameters(command=config["mcpCommand"], args=[], env=environment)
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            handshake = await session.initialize()
            listed = await session.list_tools()
            names = [tool.name for tool in listed.tools]
            for required in ["get_addon_status", "get_scene_info", "execute_blender_code", "look"]:
                if required not in names:
                    raise RuntimeError(f"Required Blender MCP tool missing: {required}")
            status = await session.call_tool("get_addon_status", {})
            scene = await session.call_tool("get_scene_info", {"limit": 5})
            def messages(result):
                return [part.text for part in result.content if part.type == "text"]
            result = {
                "server": handshake.serverInfo.name,
                "toolCount": len(names), "tools": names,
                "status": messages(status), "scene": messages(scene),
                "isError": bool(status.isError or scene.isError),
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
            if result["isError"] or any("Could not" in line or line.startswith("Error") for line in result["status"] + result["scene"]):
                raise RuntimeError("MCP registered but Blender connection did not pass")


if __name__ == "__main__":
    asyncio.run(main())
