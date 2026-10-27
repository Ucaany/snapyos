import type { RuntimeConfig } from "../config.ts";
import { createDigicamControlCamera } from "./digicamcontrol.ts";
import { createGphoto2Camera } from "./gphoto2.ts";
import { createMockCamera } from "./mock.ts";
import type { CameraAdapter } from "./types.ts";

export type { CameraAdapter, CameraStatus } from "./types.ts";

export function createCamera(config: RuntimeConfig): CameraAdapter {
  switch (config.camera) {
    case "mock":
      return createMockCamera();
    case "digicamcontrol":
      return createDigicamControlCamera(config);
    case "gphoto2":
      return createGphoto2Camera(config);
  }
}
