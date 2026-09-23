import { NextResponse } from "next/server";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { apiError, readCookie, requireUser } from "@/server/auth/http";

export async function GET(request: Request) { try { const user = requireUser(request); const [profile, account, devices] = await Promise.all([CloudDatabase.profile(user.sub), CloudDatabase.userById(user.sub), CloudDatabase.devices(user.sub)]); return NextResponse.json({ user: { id: user.sub, email: account?.email, emailVerified: Boolean(account?.emailVerifiedAt), profile }, csrfToken: readCookie(request, "csrf"), sessionId:user.sessionId, devices: devices.map((device) => ({ id:device.id,userId:device.userId,deviceId:device.deviceId,deviceName:device.deviceName,expiresAt:device.expiresAt,lastUsedAt:device.lastUsedAt })), database: CloudDatabase.mode() }); } catch (error) { return apiError(error); } }
