import type { AccountSession } from "./types";
import { DeviceManager } from "@/features/platform/DeviceManager";

function deviceId() {
  const key = "studyai:device-id";
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}

function deviceName() { return DeviceManager.detect().name; }
function csrf() { return document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? ""; }
function hasSessionMarker() { return document.cookie.split(";").some((item) => item.trim() === "studyai_session=1"); }

async function request<T>(url: string, init?: RequestInit) {
  let body=init?.body;const extraHeaders:Record<string,string>={};
  if(url==="/sync"&&typeof body==="string"&&body.length>50_000&&"CompressionStream" in window){const stream=new Blob([body]).stream().pipeThrough(new CompressionStream("gzip"));body=await new Response(stream).blob();extraHeaders["content-encoding"]="gzip";}
  const response = await fetch(url, { ...init, body, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...extraHeaders, ...(init?.headers ?? {}), ...(init?.method && init.method !== "GET" ? { "x-csrf-token": csrf() } : {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

export const AuthClient = {
  deviceId,
  session: () => request<AccountSession>("/auth/session"),
  async restoreSession() { try { return await this.session(); } catch { if (!hasSessionMarker()) return null; try { await request("/auth/refresh", { method: "POST" }); return await this.session(); } catch { return null; } } },
  login: (email: string, password: string) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password, deviceId: deviceId(), deviceName: deviceName() }) }),
  register: (name: string, email: string, password: string) => request<{ verificationToken?: string }>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password, deviceId: deviceId(), deviceName: deviceName() }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  recover: (email: string) => request<{ recoveryToken?: string; message: string }>("/auth/recover", { method: "POST", body: JSON.stringify({ email }) }),
  reset: (token: string, password: string) => request("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) }),
  verify: (token: string) => request("/auth/verify", { method: "POST", body: JSON.stringify({ token }) }),
  updateProfile: (changes: Record<string, unknown>) => request("/profile", { method: "PATCH", body: JSON.stringify(changes) }),
  changePassword: (currentPassword: string, password: string) => request("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, password }) }),
  changeEmail: (password: string, email: string) => request("/auth/change-email", { method: "POST", body: JSON.stringify({ password, email }) }),
  revokeSession: (id: string) => request(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  request,
};
