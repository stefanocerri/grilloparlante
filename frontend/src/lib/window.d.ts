import type { GrilloApi } from "../../../electron/preload";

declare global {
  interface Window {
    grillo: GrilloApi;
  }
}

export {};
