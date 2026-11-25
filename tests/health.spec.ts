import { expect, test } from "@playwright/test";

test("liveness responde sem consultar banco, schema ou storage", async ({ request }) => {
  const response = await request.get("/api/health/live");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");

  const body = await response.json();
  expect(body).toMatchObject({
    status: "ok",
    check: "liveness",
  });
  expect(body).toHaveProperty("version");
  expect(body).toHaveProperty("timestamp");
  expect(body).not.toHaveProperty("database");
  expect(body).not.toHaveProperty("objectStorage");
  expect(body).not.toHaveProperty("checks");
});

test("readiness preserva o contrato detalhado de dependências", async ({ request }) => {
  const response = await request.get("/api/health");
  expect([200, 503]).toContain(response.status());

  const body = await response.json();
  expect(body).toHaveProperty("status");
  expect(body).toHaveProperty("checks.database");
  expect(body).toHaveProperty("checks.objectStorage");
  expect(body.checks.application).toHaveProperty("publicUrlConfigured");
});
