import {
  LoadingManager,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

export class AssetManager {
  private readonly manager = new LoadingManager();
  private readonly gltfLoader = new GLTFLoader(this.manager);
  private readonly textureLoader = new TextureLoader(this.manager);
  private readonly models = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<Texture>>();

  loadModel(url: string): Promise<GLTF> {
    const cached = this.models.get(url);
    if (cached) {
      return cached;
    }

    const request = this.gltfLoader.loadAsync(url).catch((error: unknown) => {
      this.models.delete(url);
      throw error;
    });
    this.models.set(url, request);
    return request;
  }

  loadTexture(url: string, colorSpace = true): Promise<Texture> {
    const cached = this.textures.get(url);
    if (cached) {
      return cached;
    }

    const request = this.textureLoader.loadAsync(url).then((texture) => {
      if (colorSpace) {
        texture.colorSpace = SRGBColorSpace;
      }
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      return texture;
    }).catch((error: unknown) => {
      this.textures.delete(url);
      throw error;
    });

    this.textures.set(url, request);
    return request;
  }

  async tryLoadModel(url: string): Promise<GLTF | null> {
    try {
      return await this.loadModel(url);
    } catch {
      return null;
    }
  }

  clear(): void {
    this.models.clear();
    this.textures.clear();
  }
}
