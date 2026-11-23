---
name: oskiride-cyclist
description: Create, animate, integrate, or repair the 3D cyclist and bicycle in OskiRide using Blender and Three.js. Use for rider proportions, skeletal rigs, pedalling, cycling poses, road lean, and GLB exports; exclude unrelated UI and terrain work.
---

# OskiRide cyclist

Build a proportionate, lightly stylized road cyclist with a complete road bike. Aim for the readable silhouette and natural movement expected in a cycling simulator such as Zwift or Rouvy. Treat those products as motion and quality references, not sources of proprietary models.

## Project contract

- Locate OskiRide from the current workspace. Read `src/world/cyclistAvatar.js`, its call sites in `src/main.js`, and the Three.js import map in `index.html` before changing the asset interface. Other work may have changed these files since this skill was written.
- The current application uses Three.js r160. Keep loaders, exporters and examples compatible with the version actually present. The matching upstream animation example is https://github.com/mrdoob/three.js/blob/r160/examples/webgl_animation_skinning_blending.html.
- Runtime coordinates: metres, Y up, +Z forward. Place the root on the road between the wheels. Apply an explicit export/import rotation for Blender's coordinate system, rather than compensating in several animation functions.
- Preserve the `createCyclistMesh(options)` and `animateCyclistMesh(avatar, speedMps, cadenceRpm, dt, telemetry)` entry points, or migrate all their callers together. Audit returned properties used externally, especially `group`, `powerRingMat`, `headlightMesh`, ghost transparency and player visibility. Handle asynchronous GLB loading explicitly.
- Put final source and exported assets in `grafika/`: `kolarz.blend`, `kolarz.glb`, a preview, and any useful regeneration script. Do not overwrite existing artist-authored assets without first inspecting them. Record the source and licence of imported models or textures.

## Modelling and rigging

Use the connected Blender MCP tools when available. Otherwise use the locally installed Blender in background mode with a saved Python script. `tools/3d/toolchain.local.json`, when present, records local executable paths. Do not claim that saving an MCP configuration makes its tools available in the active chat; verify a connection.

Give the rider a coherent torso, shoulders, neck, helmet, cycling glasses, fitted jersey, bib shorts, gloves, socks and cycling shoes. Favour silhouette and clean deformation over tiny accessories. Construct a mechanically plausible bike: joined frame triangles, wheel axles, fork, saddle, drop bars, crank, pedals and drivetrain. Place hand, saddle and pedal contact targets deliberately.

Use a deforming skeleton for the rider. Keep the frame rigid; give wheels, crank and steering separate pivots. For IK, give each knee and elbow a stable bend direction and constant segment lengths. Bake Blender constraints into exported animations, or reproduce the necessary IK in the runtime; constraints themselves are not a portable glTF rig.

## Motion

- Match the pedal cycle to cadence: phase changes by `2 * PI * cadenceRpm / 60 * dt`. Both legs share the crank phase, with opposite pedals separated by PI. Keep shoe soles on their pedals without sliding.
- Match wheel rotation to travelled distance divided by the actual wheel radius. Coasting stops the crank independently of the wheels.
- Keep hands on their grips while posture changes. Blend seated pedalling, standing climbing/sprinting, coasting and the low descent position. Avoid stretching limbs or teleporting the torso between poses.
- Derive corner lean from the curvature of the displayed road and speed, using `atan(v * v * curvature / g)` as a starting point. Check the sign in both turn directions. GPX turn angle alone depends on sampling distance and is unsuitable as a radius measurement.
- Smooth pose and lean with elapsed time, for example `1 - exp(-rate * dt)`, so behaviour is stable at different frame rates. Add standing sway to the corner lean instead of replacing it.
- Handle zero cadence, zero speed, route teleport, grade changes and sharp corners. Keep the two wheel contact points on the road when positioning/pitching the whole model.

## Export and verification

Export GLB with a clean root, PBR materials, applied modelling transforms and named animation clips. Include only necessary deformation bones and bake control-rig animation. Keep colour customization possible through named materials.

Use `npm --prefix tools/3d run inspect -- <path-to-glb>` and `npm --prefix tools/3d run validate -- <path-to-glb>` when the local tool package is installed. Optimize into a separate file first; compare appearance, skin weights and animation before replacing the original.

Start with a moderate polygon count and a small material set; choose the final budget from actual measurements with the player, ghost and pacers visible. Record triangles, draw calls, file size and measured frame rate rather than promising 60 FPS from asset size alone.

Inspect side, front, rear and three-quarter views, plus a complete pedal revolution. Check full animation in the application: low/high cadence, coasting, standing, descent, left/right turns and transitions. Use Playwright when available for repeatable browser checks and screenshots; inspect the rendered images. Keep road/terrain artefacts as a separate diagnosis from rider geometry.
