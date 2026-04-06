"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  FilePlus2,
  ClipboardList,
  FileCheck2,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { getMedico, clearSession, type MedicoSession } from "@/lib/auth";
import { useTheme } from "@/components/ThemeProvider";

const NAV_LINKS = [
  { href: "/dashboard",              label: "Inicio",        Icon: LayoutDashboard },
  { href: "/dashboard/pacientes",    label: "Pacientes",     Icon: Users },
  { href: "/dashboard/nueva-receta", label: "Nueva Receta",  Icon: FilePlus2 },
  { href: "/dashboard/historial",    label: "Historial",     Icon: ClipboardList },
  { href: "/dashboard/certificados", label: "Certificados",  Icon: FileCheck2 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [medico, setMedico] = useState<MedicoSession | null>(null);

  useEffect(() => {
    const m = getMedico();
    if (!m) { router.replace("/login"); return; }
    if (!m.perfil_completo) { router.replace("/completar-perfil"); return; }
    if (!m.validado || !m.matricula_validada) { router.replace("/cuenta-en-revision"); return; }
    if (!m.firma_url) { router.replace("/firma-digital"); return; }
    setMedico(m);
  }, [router]);

  function logout() {
    clearSession();
    router.push("/login");
  }

  if (!medico) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="spin" style={{ width: 40, height: 40, border: "3px solid rgba(10,230,199,0.2)", borderTopColor: "var(--primary)", borderRadius: "50%" }} />
      </div>
    );
  }

  const initials = medico.full_name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex", flexDirection: "column" }}>

      {/* Top Navbar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "var(--nav-bg)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--nav-border)",
        padding: "0.7rem 0",
        transition: "background 0.3s ease, border-color 0.3s ease",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2rem" }}>

          {/* Logo */}
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <Image
              src={theme === "light"
                ? "https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logo_1_svfdye.png"
                : "https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logoblanco_1_qdlnog.png"}
              alt="DocYa" width={90} height={36}
              style={{ objectFit: "contain", transition: "opacity 0.3s" }}
            />
          </Link>

          {/* Nav links */}
          <div className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, Icon }) => {
              const active = pathname === href;
              return (
                <Link key={href} href={href} style={{
                  display: "flex", alignItems: "center", gap: "0.45rem",
                  padding: "0.45rem 0.9rem",
                  borderRadius: "var(--radius-pill)",
                  textDecoration: "none",
                  fontSize: "0.88rem", fontWeight: 500,
                  transition: "all 0.2s ease",
                  background: active ? "rgba(10,230,199,0.1)" : "transparent",
                  color: active ? "var(--primary)" : "var(--text-muted)",
                  border: active ? "1px solid rgba(10,230,199,0.22)" : "1px solid transparent",
                }}>
                  <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right: theme toggle + user + logout */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              style={{
                width: 36, height: 36,
                borderRadius: "50%",
                border: "1px solid var(--glass-border)",
                background: "var(--bg-card)",
                color: "var(--text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.2s ease",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--glass-border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {theme === "dark" ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
            </button>

            {/* Avatar + name */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
              {medico.photo_url ? (
                <Image
                  src={medico.photo_url}
                  alt={medico.full_name}
                  width={34} height={34}
                  style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#030b12", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0,
                }}>
                  {initials}
                </div>
              )}
              <div className="hidden sm:block">
                <div style={{ fontWeight: 600, fontSize: "0.88rem", lineHeight: 1.2, color: "var(--text-main)" }}>{medico.full_name}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{medico.tipo}</div>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              title="Cerrar sesión"
              style={{
                display: "flex", alignItems: "center", gap: "0.35rem",
                background: "transparent",
                border: "1px solid rgba(244,63,94,0.3)",
                color: "#f43f5e",
                padding: "0.38rem 0.8rem",
                borderRadius: "var(--radius-pill)",
                cursor: "pointer",
                fontSize: "0.8rem", fontWeight: 600,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(244,63,94,0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <LogOut size={14} strokeWidth={2} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, paddingTop: "5rem", paddingBottom: "3rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem" }}>
          {children}
        </div>
      </main>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "1.5rem", borderTop: "1px solid var(--glass-border)", color: "var(--text-muted)", fontSize: "0.8rem" }}>
        <div style={{ fontSize: "0.95rem", color: "var(--text-main)", fontWeight: 600, marginBottom: "0.75rem" }}>
          Todos nuestros profesionales están validados por
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.85rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <Image
            src="https://res.cloudinary.com/dqsacd9ez/image/upload/v1775043651/logosisa_dxtx66.png"
            alt="Logo SISA"
            width={140}
            height={32}
            style={{ objectFit: "contain" }}
          />
        </div>
        © 2026 DocYa — Documentos médicos digitales
      </div>
    </div>
  );
}
