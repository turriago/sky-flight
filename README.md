# Sky Flight

Videojuego 3D de exploración aérea para navegador. El jugador controla un ave sobre un valle low-poly con montañas, bosques, agua, nubes y niebla.

Hay dos modos:

- **Circuito:** carrera cronometrada por aros, con fantasma del récord, choques y medallas.
- **Vuelo libre:** exploración sin cronómetro.

Se vuela con teclado, con el cuerpo (webcam + MediaPipe Pose), o con ambos. El teclado tiene prioridad si hay teclas pulsadas.

No usa Unity, Godot ni Unreal. Todo corre en el navegador (TypeScript, Vite, Three.js).

## Cómo jugar

```bash
npm install
npm run dev
```

Abre la URL de Vite, normalmente `http://localhost:5173`.

1. Activa la cámara si quieres volar con el cuerpo (opcional).
2. Pulsa **Circuito** para competir, o **Vuelo libre** para explorar.
3. En circuito, atraviesa el aro dorado para arrancar el tiempo y sigue los aros en orden.

### Circuito

| Elemento | Qué hace |
| --- | --- |
| Aro dorado | Siguiente puerta. El cronómetro arranca al pasar el primero. |
| Fantasma cian | Tu mejor carrera. Aparece a partir del segundo intento con récord. |
| Toque | Rasar el suelo o un árbol suma **+2.5 s** y frena el ave. |
| Oro / plata / bronce | Tiempos objetivo según la longitud del trazado. |
| Récord | Se guarda en el navegador (`localStorage`). |

**T** o el botón **Reiniciar** vuelve a la salida.

### Controles de teclado

| Tecla | Acción |
| --- | --- |
| W | Acelerar |
| S | Reducir velocidad |
| A | Girar izquierda |
| D | Girar derecha |
| Espacio | Ascender |
| Shift | Descender |
| Q | Alabeo izquierda |
| E | Alabeo derecha |
| R | Descansar: el ave planea sola |
| T | Reiniciar circuito |

### Controles con el cuerpo

Siéntate de frente, con hombros y brazos a la vista. El preview de la webcam está espejado.

| Gesto | Acción |
| --- | --- |
| Manos arriba | Subir |
| Manos abajo, brazos abiertos | Bajar |
| Inclinar el torso o la cabeza | Girar |
| Acercarse / alejarse de la cámara | Velocidad |
| Brazos pegados al cuerpo | Descansar (el ave sigue planeando) |
| **R** o botón **Descansar** | Forzar o salir del planeo |

El teclado sigue funcionando durante el descanso.

## Comandos

```bash
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` ejecuta `tsc --noEmit` y luego empaqueta con Vite. El resultado queda en `dist/`.

## Arquitectura

```
src/
├── main.ts
├── game/          Mundo, terreno, circuito, luces
├── player/        Ave, vuelo, fantasma, animación
├── input/         Teclado y pose → FlightInput
├── vision/        MediaPipe Pose
├── camera/        Cámara de seguimiento
├── assets/        Carga de GLB
├── ui/            Menú y HUD
├── audio/         Viento ambiental
└── utils/         Constantes y matemáticas
public/
├── models/nature/ Kenney Nature Kit (CC0)
├── textures/
├── audio/
└── environment/
```

Flujo de input:

```
Teclado  → KeyboardController ─┐
Webcam   → PoseDetector        ├→ FlightInput → FlightController → Bird
             → PoseController ─┘
```

El teclado no habla con Three.js. El circuito (`Course`) lleva aros, tiempo, medallas y la cinta del fantasma. `Ghost` reproduce esa cinta.

## Cámara y MediaPipe

1. Pulsa **Activar cámara** en el menú o en el HUD.
2. El navegador pide permiso con `getUserMedia`.
3. `PoseDetector` carga MediaPipe Pose Landmarker (modelo lite, delegado CPU para no chocar con el WebGL de Three.js).
4. Se captura una pose de reposo en menos de un segundo; el vuelo no se bloquea mientras tanto.
5. Si niegas el permiso o falla la cámara, el juego sigue con teclado.

WASM y modelo se cargan desde CDN en el primer uso.

## Cómo cambiar el modelo del ave

1. Coloca un `.glb` en `public/models/`.
2. Cárgalo con `AssetManager.loadModel("/models/tu-ave.glb")`.
3. Llama a `bird.setModel(gltf.scene, new THREE.AnimationMixer(gltf.scene))`.
4. Si existen objetos `WingLeft` y `WingRight`, la animación procedural de alas sigue aplicándose.

El placeholder actual tiene cuerpo, cabeza, pico, cola y alas.

## Licencias

Consulta [ASSETS.md](./ASSETS.md). Kenney Nature Kit es CC0. Three.js es MIT. MediaPipe es Apache 2.0.

## Despliegue

### Vercel

1. Conecta este repositorio.
2. Framework preset: Vite.
3. Build command: `npm run build`
4. Output directory: `dist`

### Netlify

Build command: `npm run build`. Publish directory: `dist`.

```toml
[build]
  command = "npm run build"
  publish = "dist"
```
