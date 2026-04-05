"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LogOut, ShieldCheck, Clock3 } from "lucide-react";
import { clearSession, getMedico } from "@/lib/auth";

export default function CuentaEnRevisionPage() {
  const router = useRouter();
  const medico = getMedico();

  function salir() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="glass-card" style={{ maxWidth: 560, width: "100%", padding: "2.25rem" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,230,199,0.12)",
            border: "1px solid rgba(10,230,199,0.18)",
            color: "var(--primary)",
            marginBottom: "1rem",
          }}
        >
          <ShieldCheck size={30} strokeWidth={1.8} />
        </div>

        <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginBottom: "0.6rem" }}>
          Tu cuenta está en revisión
        </h1>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.65, fontSize: "1rem" }}>
          {medico?.full_name ? `${medico.full_name}, ` : ""}
          ya recibimos tu documentación. Podrás usar el panel de recetas y certificados
          recién cuando el equipo DocYa valide tu matrícula profesional.
        </p>

        <div
          style={{
            marginTop: "1.5rem",
            display: "grid",
            gap: "0.9rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-md)",
              padding: "1rem",
            }}
          >
            <Clock3 size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                Revisión manual
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.5 }}>
                Verificamos la matrícula, la identidad y la documentación clínica antes de habilitar
                el acceso al recetario.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-md)",
              padding: "1rem",
            }}
          >
            <CheckCircle2 size={18} color="#4ade80" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                Aviso cuando quede habilitada
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.5 }}>
                Cuando la matrícula esté aprobada vas a poder entrar normalmente con email,
                contraseña o Google.
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.85rem", marginTop: "1.75rem", flexWrap: "wrap" }}>
          <Link href="/login" className="btn-outline" style={{ textDecoration: "none" }}>
            Volver al login
          </Link>
          <button
            type="button"
            onClick={salir}
            className="btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <LogOut size={15} strokeWidth={2.2} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
