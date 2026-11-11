import type { CameraRole, CameraKind, RuntimeConfig } from "../config.ts";
import { createDigicamControlCamera } from "./digicamcontrol.ts";
import { createGphoto2Camera } from "./gphoto2.ts";
import { createLibcameraCamera } from "./libcamera.ts";
import { createMockCamera } from "./mock.ts";
import { createPyavCamera } from "./pyav.ts";
import { createV4l2Camera } from "./v4l2.ts";
import type { CameraAdapter } from "./types.ts";

export type { CameraAdapter, CameraInfo, CameraStatus } from "./types.ts";

/** Satu adapter untuk peran tertentu. Adapter yang sama boleh dipakai dua peran. */
export function createCameraFor(
  config: RuntimeConfig,
  kind: CameraKind,
  role: CameraRole
): CameraAdapter {
  switch (kind) {
    case "mock":
      return createMockCamera(role);
    case "digicamcontrol":
      return createDigicamControlCamera(config);
    case "gphoto2":
      return createGphoto2Camera(config);
    case "libcamera":
      return createLibcameraCamera(config, role);
    case "v4l2":
      return createV4l2Camera(config, role);
    case "pyav":
      return createPyavCamera(config, role);
  }
}

/**
 * Adapter stills + preview. Adapter yang sama DISHARE bila kedua peran memakai
 * jenis dan perangkat yang sama: kamera DSLR menolak dua akses bersamaan, dan
 * mengunci dua instance terpisah justru membuatnya saling memblokir.
 */
export function createCameraRoles(config: RuntimeConfig): {
  stills: CameraAdapter;
  stream: CameraAdapter;
} {
  const stills = createCameraFor(config, config.camera, "stills");
  const kind = config.cameraStream;
  if (!kind) return { stills, stream: stills };

  const sameDevice =
    kind === config.camera &&
    (kind !== "v4l2" && kind !== "pyav" ? true : config.v4l2Device === config.v4l2DeviceStream);
  if (sameDevice) return { stills, stream: stills };

  return { stills, stream: createCameraFor(config, kind, "stream") };
}

/** Kompatibilitas: adapter stills saja (dipakai jalur lama dan tes). */
export function createCamera(config: RuntimeConfig): CameraAdapter {
  return createCameraFor(config, config.camera, "stills");
}
