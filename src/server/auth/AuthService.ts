import "server-only";
import { randomUUID } from "node:crypto";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { hashPassword, hashToken, randomToken, signJwt, verifyJwt, verifyPassword } from "@/server/security/Crypto";

const ACCESS_SECONDS = 15 * 60;
const REFRESH_SECONDS = 30 * 24 * 60 * 60;

export type AccessClaims = { sub: string; email: string; sessionId: string; type: "access" };

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function validPassword(password: string) { return password.length >= 10 && /[a-z]/i.test(password) && /\d/.test(password); }

export const AuthService = {
  async register(input: { name: string; email: string; password: string; deviceId: string; deviceName: string }) {
    if (input.name.trim().length < 2) throw new Error("Informe seu nome.");
    if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error("Informe um email válido.");
    if (!validPassword(input.password)) throw new Error("A senha deve ter ao menos 10 caracteres, uma letra e um número.");
    const user = await CloudDatabase.createUser(normalizeEmail(input.email), await hashPassword(input.password), input.name.trim());
    const verificationToken = randomToken();
    await CloudDatabase.saveAccountToken(hashToken(verificationToken), user.id, "verify", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    return { ...(await this.createSession(user.id, user.email, input.deviceId, input.deviceName)), verificationToken };
  },

  async login(input: { email: string; password: string; deviceId: string; deviceName: string }) {
    const user = await CloudDatabase.userByEmail(normalizeEmail(input.email));
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new Error("Email ou senha incorretos.");
    return this.createSession(user.id, user.email, input.deviceId, input.deviceName);
  },

  async createSession(userId: string, email: string, deviceId: string, deviceName: string) {
    const sessionId = randomUUID(); const refreshToken = randomToken(48); const csrfToken = randomToken(24);
    const normalizedDeviceId = typeof deviceId === "string" && deviceId.length > 0 ? deviceId.slice(0, 200) : randomUUID();
    const normalizedDeviceName = typeof deviceName === "string" && deviceName.length > 0 ? deviceName.slice(0, 120) : "Navegador";
    await CloudDatabase.saveSession({ id: sessionId, userId, tokenHash: hashToken(refreshToken), deviceId: normalizedDeviceId, deviceName: normalizedDeviceName, expiresAt: new Date(Date.now() + REFRESH_SECONDS * 1000).toISOString(), lastUsedAt: new Date().toISOString() });
    return { accessToken: signJwt({ sub: userId, email, sessionId, type: "access" }, ACCESS_SECONDS), refreshToken, csrfToken, expiresIn: ACCESS_SECONDS, sessionId };
  },

  async refresh(refreshToken: string) {
    const session = await CloudDatabase.sessionByHash(hashToken(refreshToken));
    if (!session || new Date(session.expiresAt) <= new Date()) throw new Error("Sessão expirada.");
    const user = await CloudDatabase.userById(session.userId); if (!user) throw new Error("Conta não encontrada.");
    await CloudDatabase.revokeSession(session.id);
    return this.createSession(user.id, user.email, session.deviceId, session.deviceName);
  },

  access(token?: string) { if (!token) return null; const claims = verifyJwt<AccessClaims>(token); return claims?.type === "access" ? claims : null; },
  async logout(refreshToken?: string) { if (!refreshToken) return; const session = await CloudDatabase.sessionByHash(hashToken(refreshToken)); if (session) await CloudDatabase.revokeSession(session.id); },

  async requestRecovery(email: string) { const user = await CloudDatabase.userByEmail(normalizeEmail(email)); if (!user) return {}; const token = randomToken(); await CloudDatabase.saveAccountToken(hashToken(token), user.id, "recover", new Date(Date.now() + 60 * 60 * 1000).toISOString()); return { recoveryToken: token, email: user.email }; },
  async resetPassword(token: string, password: string) { if (!validPassword(password)) throw new Error("A senha deve ter ao menos 10 caracteres, uma letra e um número."); const userId = await CloudDatabase.consumeAccountToken(hashToken(token), "recover"); if (!userId) throw new Error("Link inválido ou expirado."); await CloudDatabase.updateUser(userId, { passwordHash: await hashPassword(password) }); await CloudDatabase.revokeUserSessions(userId); },
  async verifyEmail(token: string) { const userId = await CloudDatabase.consumeAccountToken(hashToken(token), "verify"); if (!userId) throw new Error("Link inválido ou expirado."); await CloudDatabase.updateUser(userId, { verified: true }); },
  async changePassword(userId: string, current: string, password: string) { const user = await CloudDatabase.userById(userId); if (!user || !(await verifyPassword(current, user.passwordHash))) throw new Error("Senha atual incorreta."); if (!validPassword(password)) throw new Error("A nova senha não atende aos requisitos."); await CloudDatabase.updateUser(userId, { passwordHash: await hashPassword(password) }); await CloudDatabase.revokeUserSessions(userId); },
  async changeEmail(userId: string, password: string, email: string) { const user = await CloudDatabase.userById(userId); if (!user || !(await verifyPassword(password, user.passwordHash))) throw new Error("Senha incorreta."); const normalized=normalizeEmail(email);if(!/^\S+@\S+\.\S+$/.test(normalized))throw new Error("Informe um email válido.");await CloudDatabase.updateUser(userId, { email:normalized,unverify:true });const token=randomToken();await CloudDatabase.saveAccountToken(hashToken(token),userId,"verify",new Date(Date.now()+24*60*60*1000).toISOString());return{email:normalized,verificationToken:token}; },
};
