/** Stable id for the currently running deployment (changes on each Vercel/production build). */
export function getAppBuildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha) return sha.slice(0, 12);
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  if (deploymentId) return deploymentId.slice(0, 16);
  const publicId = process.env.NEXT_PUBLIC_BUILD_ID?.trim();
  if (publicId) return publicId;
  return process.env.NODE_ENV === "development" ? "development" : "unknown";
}
