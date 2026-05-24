"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Pill,
  CheckCircle2,
  BadgeCheck,
  Clock,
  FilePlus2,
  ClipboardList,
  FileCheck2,
  FileText,
  ChevronRight,
  UserRound,
  Mail,
  CreditCard,
  Stethoscope,
  Hash,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { getMedico, getToken, saveSession, handleSessionExpired, type MedicoSession } from "@/lib/auth";
import { listarRecetas, listarPacientes, obtenerPerfilMedico } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [medico, setMedico] = useState<MedicoSession | null>(null);
  const [stats, setStats] = useState({ pacientes: 0, recetas: 0, validas: 0, anuladas: 0 });

  useEffect(() => {
    const m = getMedico();
    setMedico(m);
    const token = getToken();
    if (!m || !token) return;

    obtenerPerfilMedico(m.medico_id, token)
      .then((perfil) => {
        const nextMedico: MedicoSession = {
          ...m,
          especialidad: perfil.especialidad ?? m.especialidad,
          matricula: perfil.matricula ?? m.matricula,
          firma_url: perfil.firma_url ?? m.firma_url,
          validado: perfil.validado ?? m.validado,
          matricula_validada: perfil.matricula_validada ?? m.matricula_validada,
          perfil_completo: perfil.perfil_completo ?? m.perfil_completo,
        };
        saveSession(nextMedico);
        setMedico(nextMedico);
      })
      .catch((error: unknown) => {
        if (!handleSessionExpired(error, router)) {
          // Keep rendering with the cached session if refresh fails.
        }
      });

    Promise.all([
      listarPacientes(token).catch((error: unknown) => {
        if (handleSessionExpired(error, router)) return { total: 0, pacientes: [] };
        return { total: 0, pacientes: [] };
      }),
      listarRecetas(token).catch((error: unknown) => {
        if (handleSessionExpired(error, router)) return { total: 0, recetas: [] };
        return { total: 0, recetas: [] };
      }),
    ]).then(([pacs, recs]) => {
      const recetasArr = (recs as { recetas?: { estado: string }[] }).recetas ?? [];
      setStats({
        pacientes: (pacs as { total: number }).total,
        recetas:   (recs as { total: number }).total,
        validas:   recetasArr.filter((r) => r.estado === "valida").length,
        anuladas:  recetasArr.filter((r) => r.estado === "anulada").length,
      });
    });
  }, []);

  if (!medico) return null;

  const initials = medico.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const hour     = new Date().getHours();
  const greeting = hour >= 6 && hour < 13 ? "Buenos días" : hour >= 13 && hour < 20 ? "Buenas tardes" : "Buenas noches";
  const fecha    = new Date().toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const statCards = [
    { label: "Mis pacientes",   value: stats.pacientes, Icon: Users,        color: "var(--primary)" },
    { label: "Total recetas",   value: stats.recetas,   Icon: Pill,         color: "#60a5fa" },
    { label: "Recetas activas", value: stats.validas,   Icon: CheckCircle2, color: "#4ade80" },
    {
      label: "Matrícula",
      value: medico.matricula_validada ? "Validada" : "Pendiente",
      Icon: medico.matricula_validada ? BadgeCheck : Clock,
      color: medico.matricula_validada ? "#4ade80" : "#fbbf24",
    },
  ];

  const actions = [
    { href: "/dashboard/pacientes",    Icon: Users,         title: "Mis Pacientes",  desc: "Registrá y gestioná los pacientes de tu consultorio",         color: "var(--primary)" },
    { href: "/dashboard/nueva-receta", Icon: FilePlus2,     title: "Nueva Receta",   desc: "Emitir receta electrónica con firma digital y QR",             color: "#60a5fa" },
    { href: "/dashboard/historial",    Icon: ClipboardList, title: "Historial",      desc: "Revisá todas las recetas emitidas, descargalas o anulalas",    color: "#a78bfa" },
    { href: "/dashboard/certificados", Icon: FileCheck2,    title: "Certificados",   desc: "Emitir certificados médicos con firma digital y código QR",    color: "#34d399" },
    { href: "/dashboard/ordenes",      Icon: FileText,      title: "Órdenes",        desc: "Emitir órdenes de laboratorio e imágenes con firma digital",   color: "#f97316" },
  ];

  const profileFields = [
    { label: "Nombre completo", value: medico.full_name,                                Icon: UserRound },
    { label: "Email",           value: medico.email,                                    Icon: Mail },
    { label: "DNI",             value: medico.dni,                                      Icon: CreditCard },
    { label: "Tipo",            value: medico.tipo,                                     Icon: Stethoscope },
    { label: "Especialidad",    value: medico.especialidad ?? "—",                       Icon: Hash },
    { label: "Matrícula",       value: medico.matricula ?? "—",                         Icon: BadgeCheck },
    { label: "Estado",          value: medico.matricula_validada ? "Validada" : "Pendiente", Icon: ShieldCheck },
  ];

  return (
    <div className="flex flex-col gap-8">

      {/* Greeting */}
      <div className="animate-fade-up flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div style={{
            width: 54, height: 54, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#030b12", fontWeight: 700, fontSize: "1.15rem",
            boxShadow: "0 0 20px var(--primary-glow)", flexShrink: 0,
          }}>{initials}</div>
          <div>
            <h1 style={{ fontSize: "1.55rem", fontWeight: 700, lineHeight: 1.2, color: "var(--text-main)" }}>
              {greeting}, {medico.full_name.split(" ")[0]}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", textTransform: "capitalize" }}>{fecha}</p>
          </div>
        </div>
        <Link href="/dashboard/nueva-receta" className="btn-primary" style={{ textDecoration: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Plus size={16} strokeWidth={2.5} />
          Nueva Receta
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up delay-1">
        {statCards.map(({ label, value, Icon, color }, i) => (
          <div key={i} className="stat-card">
            <div style={{ marginBottom: "0.6rem" }}>
              <Icon size={22} color={color} strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "0.3rem" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 style={{ fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "1rem" }}>
          Acciones rápidas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-up delay-2">
          {actions.map(({ href, Icon, title, desc, color }, i) => (
            <Link key={i} href={href} style={{ textDecoration: "none" }}>
              <div className="glass-card" style={{ height: "100%", cursor: "pointer" }}>
                <div style={{
                  width: 46, height: 46, borderRadius: "var(--radius-md)",
                  background: `${color}18`, border: `1px solid ${color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "1rem",
                }}>
                  <Icon size={22} color={color} strokeWidth={1.8} />
                </div>
                <h3 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.35rem", color: "var(--text-main)" }}>{title}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: 1.5 }}>{desc}</p>
                <div style={{ color, fontSize: "0.83rem", marginTop: "1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.2rem" }}>
                  Ir ahora <ChevronRight size={14} strokeWidth={2.5} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Profile */}
      <div className="animate-fade-up delay-3">
        <h2 style={{ fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "1rem" }}>
          Mi perfil
        </h2>
        <div className="glass-card">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {profileFields.map(({ label, value, Icon }, i) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
                  <Icon size={12} color="var(--text-muted)" strokeWidth={1.8} />
                  <span className="label" style={{ margin: 0 }}>{label}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text-main)" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
