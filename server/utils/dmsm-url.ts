import { consola } from "consola";

let warnedLegacyEnv = false;

/**
 * DMSM API base URL. Server-only: private `runtimeConfig.dmsm`, set by `NUXT_DMSM`.
 *
 * Stacks that still export the old `NUXT_PUBLIC_DMSM` keep their DMSM host until they move
 * to `NUXT_DMSM`. That fallback has to live here, at runtime: runtime-config defaults in
 * nuxt.config are baked at build time, and the image is built without deployment env.
 */
export function useDmsmUrl(): string {
  const { dmsm } = useRuntimeConfig();
  const legacy = process.env.NUXT_PUBLIC_DMSM;

  if (process.env.NUXT_DMSM || !legacy) return dmsm;

  if (!warnedLegacyEnv) {
    warnedLegacyEnv = true;
    consola.warn("[dmsm] NUXT_PUBLIC_DMSM is deprecated - rename it to NUXT_DMSM");
  }

  return legacy;
}
