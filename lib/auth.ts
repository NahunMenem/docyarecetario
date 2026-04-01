export interface MedicoSession {
  medico_id: number;
  full_name: string;
  tipo: string;
  email: string;
  dni: string;
  matricula_validada: boolean;
  access_token: string;
  especialidad?: string;
  matricula?: string;
  firma_url?: string;
}

export const getToken = (): string | null =>
  typeof window !== "undefined" ? localStorage.getItem("docya_token") : null;

export const getMedico = (): MedicoSession | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("docya_medico");
  return raw ? JSON.parse(raw) : null;
};

export const saveSession = (data: MedicoSession) => {
  localStorage.setItem("docya_token", data.access_token);
  localStorage.setItem("docya_medico", JSON.stringify(data));
};

export const clearSession = () => {
  localStorage.removeItem("docya_token");
  localStorage.removeItem("docya_medico");
};

const SESSION_ERROR_MESSAGES = new Set([
  "Token expirado",
  "Token inválido",
  "Token no proporcionado",
]);

export const isSessionExpiredError = (error: unknown): error is Error =>
  error instanceof Error && SESSION_ERROR_MESSAGES.has(error.message);

export const handleSessionExpired = (
  error: unknown,
  router?: { replace: (href: string) => void }
) => {
  if (!isSessionExpiredError(error)) return false;
  clearSession();
  if (typeof window !== "undefined") {
    if (router) router.replace("/login");
    else window.location.href = "/login";
  }
  return true;
};
