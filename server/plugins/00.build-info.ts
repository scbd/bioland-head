/**
 * Log the git commit and build date at Nitro startup so production issue debugging
 * can identify exactly which build is running. Read from GIT_COMMIT and BUILD_DATE
 * env vars set by the Docker build process (see Dockerfile runner stage ARGs).
 *
 * The numeric prefix keeps this ahead of other server plugins.
 */

export function formatBuildInfo(env: Record<string, string | undefined>): string {
  const commit = env.GIT_COMMIT ?? 'unknown'
  const date = env.BUILD_DATE ?? 'unknown'
  return `[startup] head build ${commit} (built ${date})`
}

export default defineNitroPlugin(() => {
  const message = formatBuildInfo(process.env as Record<string, string | undefined>)
  console.info(message)
})
