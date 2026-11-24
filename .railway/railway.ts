import { defineRailway, github, preserve, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
//
// Preparação para o sunset do Config-as-Code (railway.toml) em 2026-12-01.
// Todas as variáveis existentes ou previstas para V1.2 usam preserve() para
// impedir remoção acidental durante futuros `railway config plan/apply`.
// NÃO aplicar automaticamente sem revisar `railway config plan` com aprovação.
export const partial = "studyai-web";

export default defineRailway(() => {
  const studyai_web = service("studyai-web", {
    source: github("gabrielb1377/studyai", { branch: "main" }),
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    env: {
      API_KEYS_ENCRYPTION_KEY: preserve(),
      APP_URL: preserve(),
      AUTH_SECRET: preserve(),
      CAPACITOR_SERVER_URL: preserve(),
      DATABASE_CA_CERT: preserve(),
      DATABASE_POOL_SIZE: preserve(),
      DATABASE_SSL: preserve(),
      DATABASE_SSL_REJECT_UNAUTHORIZED: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_FROM: preserve(),
      FEEDBACK_EMAIL: preserve(),
      GEMINI_API_KEY: preserve(),
      GROQ_API_KEY: preserve(),
      HEALTH_SECRET: preserve(),
      MAINTENANCE_SECRET: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NEXT_TELEMETRY_DISABLED: preserve(),
      NODE_ENV: preserve(),
      OPENROUTER_API_KEY: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      S3_SERVER_SIDE_ENCRYPTION: preserve(),
      SMTP_HOST: preserve(),
      SMTP_PASSWORD: preserve(),
      SMTP_PORT: preserve(),
      SMTP_SECURE: preserve(),
      SMTP_USER: preserve(),
      STUDYAI_DOMAIN: preserve(),
      TRUSTED_PROXY_HOPS: preserve(),
      TRUST_PROXY_HEADERS: preserve(),
    },
  });
  return project("studyai", {
    resources: [studyai_web],
  });
});
