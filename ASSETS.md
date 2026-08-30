# Assets

Registro de recursos externos. Si un archivo no tiene licencia clara, no se usa.

## Three.js

- **Nombre:** Three.js
- **Fuente:** https://threejs.org/
- **URL:** https://github.com/mrdoob/three.js
- **Licencia:** MIT
- **Uso:** renderizado WebGL, luces, niebla, geometría, InstancedMesh, carga GLTF

## Outfit

- **Nombre:** Outfit
- **Fuente:** Google Fonts
- **URL:** https://fonts.google.com/specimen/Outfit
- **Licencia:** SIL Open Font License 1.1
- **Uso:** tipografía del menú y del HUD

## Kenney Nature Kit

- **Nombre:** Nature Kit (2.1)
- **Fuente:** Kenney
- **URL:** https://kenney.nl/assets/nature-kit
- **Licencia:** CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
- **Uso:** árboles, rocas, arbustos, hierba, flores y nenúfares mediante InstancedMesh

Archivos incluidos en `public/models/nature/`:

| Archivo | Uso |
| --- | --- |
| tree_pineTallA.glb | Pinos |
| tree_pineTallC.glb | Pinos |
| tree_oak.glb | Robles |
| tree_default.glb | Árboles de copa |
| tree_fat.glb | Árboles anchos |
| rock_largeA.glb / rock_largeC.glb | Rocas grandes |
| rock_tallA.glb | Rocas altas |
| rock_smallA.glb / rock_smallFlatA.glb | Rocas pequeñas |
| plant_bushLarge.glb / plant_bushDetailed.glb | Arbustos |
| grass.glb / grass_large.glb | Hierba |
| flower_yellowA.glb / flower_redA.glb | Flores |
| lily_large.glb | Nenúfares en el agua |
| LICENSE.txt | Texto original de Kenney |

El terreno, el agua, las nubes, la niebla y el ave son geometría o efectos procedurales.

## MediaPipe Tasks Vision

- **Nombre:** MediaPipe Pose Landmarker
- **Fuente:** Google MediaPipe
- **URL:** https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- **Licencia:** Apache License 2.0
- **Uso:** detección de pose corporal para el control de vuelo

## Cómo añadir un asset

1. Confirmar licencia CC0, dominio público o uso comercial explícito.
2. Guardar el archivo en `public/models`, `public/textures`, `public/audio` o `public/environment`.
3. Cargarlo con `AssetManager` para que quede en caché.
4. Documentarlo en esta lista con nombre, fuente, URL, licencia y uso.
