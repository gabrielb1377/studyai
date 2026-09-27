"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "./AuthProvider";

export type AuthAccessMode = "login" | "register";

export function AuthAccessForm({ mode, onModeChange, onComplete }: {
  mode: AuthAccessMode;
  onModeChange: (mode: AuthAccessMode) => void;
  onComplete?: (mode: AuthAccessMode) => void;
}) {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const validation = useMemo(() => {
    if (mode === "register" && name.trim().length < 2) return "Informe seu nome.";
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Informe um email válido.";
    if (password.length < 10 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      return "Use ao menos 10 caracteres, uma letra e um número.";
    }
    if (mode === "register" && password !== confirmation) return "As senhas não coincidem.";
    return "";
  }, [confirmation, email, mode, name, password]);

  const submit = async () => {
    if (validation) { setError(validation); return; }
    setWorking(true);
    setError("");
    try {
      if (mode === "login") await auth.login(email, password, rememberDevice);
      else await auth.register(name, email, password);
      localStorage.removeItem("studyai:offline-session");
      onComplete?.(mode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir o acesso.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
      {mode === "register" && <Input aria-label="Nome" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" />}
      <Input aria-label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" />
      <div className="relative">
        <Input aria-label="Senha" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ao menos 10 caracteres" className="pr-11" />
        <Button type="button" size="icon" variant="ghost" className="absolute right-0 top-0" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff /> : <Eye />}</Button>
      </div>
      {mode === "register" && <Input aria-label="Confirmar senha" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirme sua senha" />}
      {mode === "login" && <label className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground"><input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} className="size-4 accent-primary" />Continuar conectado neste dispositivo</label>}
      {(error || (email && password && validation)) && <p role="alert" className="text-sm text-destructive">{error || validation}</p>}
      <Button type="submit" className="w-full" disabled={working || Boolean(validation)}>{working ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</Button>
      <Button type="button" variant="link" className="w-full" onClick={() => { setError(""); onModeChange(mode === "login" ? "register" : "login"); }}>{mode === "login" ? "Ainda não tenho uma conta" : "Já tenho uma conta"}</Button>
    </form>
  );
}
