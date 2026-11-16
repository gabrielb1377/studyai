import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import {
  apiError,
  jsonBody,
  requireActiveSession,
  requireCsrf,
  requireUser,
  setAuthCookies,
} from "@/server/auth/http";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { rateLimitStrict } from "@/server/security/RateLimit";
import { rateLimitRejection } from "@/server/security/RateLimitHttp";

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const body = await jsonBody<{
      currentPassword?: unknown;
      password?: unknown;
      deviceId?: unknown;
      deviceName?: unknown;
    }>(request, 4096);
    if (
      typeof body.currentPassword !== "string" ||
      !body.currentPassword ||
      typeof body.password !== "string" ||
      !body.password
    ) {
      return NextResponse.json({ error: "Informe a senha atual e a nova senha." }, { status: 400 });
    }
    const limit = await rateLimitStrict(`change-password:${user.sub}`, 5, 15 * 60_000);
    if (!limit.allowed) {
      return rateLimitRejection(limit, "Muitas tentativas. Aguarde antes de tentar novamente.");
    }
    const activeDevices = await CloudDatabase.devices(user.sub);
    const currentDevice = activeDevices.find((device) => device.id === user.sessionId);

    await AuthService.changePassword(user.sub, body.currentPassword, body.password);

    const account = await CloudDatabase.userById(user.sub);
    if (!account) throw new Error("Conta não encontrada.");

    const bodyDeviceId =
      typeof body.deviceId === "string" && body.deviceId.trim().length > 0 && body.deviceId.trim() !== user.sessionId
        ? body.deviceId.trim().slice(0, 200)
        : "";
    const sessionDeviceId =
      currentDevice?.deviceId && currentDevice.deviceId !== user.sessionId
        ? currentDevice.deviceId
        : "";
    const resolvedDeviceId = bodyDeviceId || sessionDeviceId;
    const resolvedDeviceName =
      typeof body.deviceName === "string" && body.deviceName.trim().length > 0
        ? body.deviceName.trim().slice(0, 120)
        : (currentDevice?.deviceName ?? request.headers.get("user-agent") ?? "Navegador");

    const tokens = await AuthService.createSession(
      user.sub,
      account.email,
      resolvedDeviceId,
      resolvedDeviceName,
    );
    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, tokens);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
