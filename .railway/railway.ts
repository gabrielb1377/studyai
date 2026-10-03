import { defineRailway, github, preserve, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "studyai-web";

export default defineRailway(() => {
  const studyai_web = service("studyai-web", {
    source: github("gabrielb1377/studyai", { branch: "main" }),
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    env: {
      APP_URL: preserve(),
      AUTH_SECRET: preserve(),
      CAPACITOR_SERVER_URL: preserve(),
      DATABASE_POOL_SIZE: preserve(),
      DATABASE_SSL: preserve(),
      DATABASE_SSL_REJECT_UNAUTHORIZED: preserve(),
      DATABASE_URL: preserve(),
      HEALTH_SECRET: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NEXT_TELEMETRY_DISABLED: preserve(),
      NODE_ENV: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      S3_SERVER_SIDE_ENCRYPTION: preserve(),
      STUDYAI_DOMAIN: preserve(),
    },
  });
  return project("studyai", {
    resources: [studyai_web],
  });
});
