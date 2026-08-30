import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Object3D,
  type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const tint = new Color();

function materialColor(material: Material | Material[]): Color {
  const first = Array.isArray(material) ? material[0] : material;
  if (first && "color" in first && first.color instanceof Color) {
    return tint.copy(first.color);
  }
  return tint.set(0x808080);
}

export function bakeGltfGeometry(root: Object3D): BufferGeometry | null {
  const pieces: BufferGeometry[] = [];
  root.updateMatrixWorld(true);

  root.traverse((node) => {
    if (!(node instanceof Mesh) || !node.geometry) {
      return;
    }

    const source = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    const baked = source.clone();
    baked.applyMatrix4(node.matrixWorld);
    baked.deleteAttribute("uv");
    baked.deleteAttribute("uv2");
    baked.deleteAttribute("tangent");
    baked.deleteAttribute("skinIndex");
    baked.deleteAttribute("skinWeight");

    const color = materialColor(node.material);
    const count = baked.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    baked.setAttribute("color", new BufferAttribute(colors, 3));
    pieces.push(baked);
  });

  if (pieces.length === 0) {
    return null;
  }

  const merged = mergeGeometries(pieces, false);
  if (!merged) {
    return null;
  }

  merged.computeBoundingBox();
  if (merged.boundingBox) {
    merged.translate(0, -merged.boundingBox.min.y, 0);
  }
  merged.computeVertexNormals();
  return merged;
}
