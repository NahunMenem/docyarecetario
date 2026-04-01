"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { loginMedico, obtenerPerfilMedico } from "@/lib/api";
import { saveSession } from "@/lib/auth";

const features = [
  { icon: "🔐", text: "Firma digital con validez legal (Ley 25.506)" },
  { icon: "💊", text: "Recetas electrónicas con vademecum completo" },
  { icon: "📋", text: "Historial de documentos con trazabilidad total" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await loginMedico(email.trim(), password.trim());

      let sessionData = data;
      try {
        const perfil = await obtenerPerfilMedico(data.medico_id, data.access_token);
        sessionData = {
          ...data,
          especialidad: perfil.especialidad ?? data.especialidad,
          matricula: perfil.matricula ?? data.matricula,
          firma_url: perfil.firma_url ?? data.firma_url,
        };
      } catch {
        // Keep the login flow working even if the profile fetch fails.
      }

      saveSession(sessionData);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-base)" }}>
      {/* Left Brand Panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #060f1a 0%, #030b12 100%)",
          borderRight: "1px solid var(--glass-border)",
        }}
      >
        {/* Ambient glow */}
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "30%",
            width: 400,
            height: 400,
            background: "radial-gradient(circle, rgba(10,230,199,0.12) 0%, transparent 70%)",
            filter: "blur(60px)",
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
          <Image
            src="https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logoblanco_1_qdlnog.png"
            alt="DocYa"
            width={140}
            height={140}
          />

          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10">
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: "1.5rem",
            }}
          >
            El sistema de recetas{" "}
            <span
              style={{
                background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              más moderno
            </span>{" "}
            de Argentina
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "1.1rem",
              marginBottom: "2.5rem",
            }}
          >
            Emití recetas y certificados médicos digitales con firma legal, desde cualquier
            dispositivo.
          </p>
          <div className="flex flex-col gap-4">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-4 animate-fade-up"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "rgba(10,230,199,0.1)",
                    border: "1px solid rgba(10,230,199,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.2rem",
                    flexShrink: 0,
                  }}
                >
                  {f.icon}
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            © 2026 DocYa — Atención médica a domicilio
          </p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-up">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <Image
              src="https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logoblanco_1_qdlnog.png"
              alt="DocYa"
              width={100}
              height={100}
            />

          </div>

          <div className="glass-card">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Bienvenido, Doc
            </h2>
            <p
              style={{
                color: "var(--text-muted)",
                marginBottom: "2rem",
                fontSize: "0.9rem",
              }}
            >
              Ingresá a tu panel para emitir documentos médicos
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label className="label">Email o DNI</label>
                <input
                  className="input"
                  type="text"
                  placeholder="medico@docya.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="label" style={{ marginBottom: 0 }}>
                    Contraseña
                  </label>
                  <a href="#" style={{ fontSize: "0.8rem", color: "var(--primary)" }}>
                    ¿Olvidaste la contraseña?
                  </a>
                </div>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div
                  style={{
                    background: "rgba(244,63,94,0.1)",
                    border: "1px solid rgba(244,63,94,0.3)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.875rem 1rem",
                    color: "#f87171",
                    fontSize: "0.9rem",
                  }}
                >
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full"
                style={{ marginTop: "0.5rem", padding: "1rem", fontSize: "1rem" }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span
                      className="spin"
                      style={{
                        width: 18,
                        height: 18,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "white",
                        borderRadius: "50%",
                        display: "inline-block",
                      }}
                    />{" "}
                    Ingresando...
                  </>
                ) : (
                  "Ingresar al Panel →"
                )}
              </button>
            </form>

            <div
              style={{
                borderTop: "1px solid var(--glass-border)",
                marginTop: "2rem",
                paddingTop: "1.5rem",
                textAlign: "center",
              }}
            >
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                ¿No tenés cuenta?{" "}
                <Link href="/registro" style={{ color: "var(--primary)", fontWeight: 600 }}>
                  Registrarse aquí
                </Link>
              </p>
            </div>
            <div style={{ width: "100%", padding: "1.5rem 1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              <div style={{ fontSize: "0.95rem", color: "var(--text-main)", fontWeight: 600, marginBottom: "0.6rem" }}>
                Todos nuestros profesionales están validados por
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <Image
                  src="https://res.cloudinary.com/dqsacd9ez/image/upload/v1775043651/logosisa_dxtx66.png"
                  alt="Logo SISA"
                  width={100}
                  height={24}
                  style={{ objectFit: "contain" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
