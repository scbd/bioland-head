/**
 * Log the git commit and build date at Nitro startup so production issue debugging
 * can identify exactly which build is running. Read from GIT_COMMIT and BUILD_DATE
 * env vars set by the Docker build process (see Dockerfile runner stage ARGs).
 *
 * Nitro orders scanned plugins by `path.localeCompare`, so the `00.0.` prefix runs this
 * before `00.assert-public-runtime-config.ts`; the build line prints even if that assert throws.
 */

export function formatBuildInfo(env: Record<string, string | undefined>): string {
  const commit = env.GIT_COMMIT ?? 'unknown';
  const date = env.BUILD_DATE ?? 'unknown';
  return `[startup] head build ${commit} (built ${date})`;
}

export default defineNitroPlugin(() => {
  console.info(formatBuildInfo(process.env));
});
