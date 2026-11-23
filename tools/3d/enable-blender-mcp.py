"""Run with Blender --background --python to enable its installed MCP addon."""

import json
import bpy


bpy.ops.preferences.addon_enable(module="blender_mcp")
if "blender_mcp" not in bpy.context.preferences.addons:
    raise RuntimeError("Blender MCP addon did not enable")
bpy.ops.wm.save_userpref()
print(json.dumps({
    "blender": bpy.app.version_string,
    "config": bpy.utils.user_resource("CONFIG"),
    "addonEnabled": "blender_mcp" in bpy.context.preferences.addons,
    "autoStart": bpy.context.scene.blendermcp_auto_start_server,
}))
