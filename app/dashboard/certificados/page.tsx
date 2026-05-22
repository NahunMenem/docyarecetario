"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileCheck2, Plus, Printer, CalendarDays, User, ClipboardList,
  BedDouble, Check, ChevronRight, BriefcaseBusiness, School, Stethoscope, House,
} from "lucide-react";
import { getToken, handleSessionExpired } from "@/lib/auth";
import { listarCertificados, type CertificadoResumen } from "@/lib/api";

const templates = [
  { id: "ausentismo_laboral",   label: "Ausentismo laboral",       desc: "Justificación para trabajo, empresa u organismo",                    icon: BriefcaseBusiness, accent: "#14b8a6" },
  { id: "ausentismo_escolar",   label: "Ausentismo escolar",       desc: "Justificación de inasistencia para institución educativa",           icon: School,            accent: "#0ea5e9" },
  { id: "constancia_asistencia",label: "Constancia de asistencia", desc: "Acredita concurrencia a consulta sin exponer datos clínicos de más", icon: Stethoscope,       accent: "#22c55e" },
  { id: "reposo_domiciliario",  label: "Reposo domiciliario",      desc: "Indicación formal de reposo con período e indicaciones",             icon: House,             accent: "#f59e0b" },
];

export default function CertificadosPage() {
  const router = useRouter();
  const [certificados, setCertificados] = useState<CertificadoResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const token = getToken() ?? "";
  const base  = process.env.NEXT_PUBLIC_API_URL ?? "";

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const certs = await listarCertificados(token);
      setCertificados(certs.certificados);
    } catch (err) {
      if (handleSessionExpired(err, router)) return;
    } finally {
      setLoading(false);
    }
  }, [token, router]);

  useEffect(() => { load(); }, [load]);

  // Leer toast de query param al volver de /nuevo
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("emitido") === "1") {
      showToast("Certificado emitido correctamente");
      router.replace("/dashboard/certificados");
      load();
    }
  }, []);

  return (
    <div className="flex flex-col gap-6 animate-fade-up pb-12">

      {toast && (
        <div style={{ position: "fixed", bottom: "2rem", right: "2rem", zIndex: 300, background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)", borderRadius: 10, padding: "0.85rem 1.5rem", color: "var(--primary)", fontWeight: 600, fontSize: "0.9rem", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Check size={16} strokeWidth={2.5} /> {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)" }}>Certificados Médicos</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: 4 }}>
            Modelos profesionales DocYa con campos dinámicos por tipo de certificado.
          </p>
        </div>
        <button className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }} onClick={() => router.push("/dashboard/certificados/nuevo")}>
          <Plus size={16} strokeWidth={2.5} /> Nuevo Certificado
        </button>
      </div>

      {/* Cards de tipos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.85rem" }}>
        {templates.map(({ id, label, desc, icon: Icon, accent }) => (
          <div key={id} className="glass-card" style={{ padding: "1rem", borderLeft: `3px solid ${accent}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: `${accent}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={17} color={accent} strokeWidth={2} />
              </div>
              <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{label}</div>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Listado */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          <div className="spin" style={{ width: 36, height: 36, border: "3px solid rgba(10,230,199,0.2)", borderTopColor: "var(--primary)", borderRadius: "50%", margin: "0 auto 1rem" }} />
          Cargando certificados...
        </div>
      ) : certificados.length === 0 ? (
        <div className="glass-card" style={{ textAlign: "center", padding: "3rem" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", color: "var(--text-muted)" }}>
            <FileCheck2 size={48} strokeWidth={1.2} />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-main)" }}>Todavía no emitiste certificados</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            Podés emitir ausentismo laboral, escolar, constancia de asistencia y reposo domiciliario.
          </p>
          <button className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }} onClick={() => router.push("/dashboard/certificados/nuevo")}>
            <Plus size={15} strokeWidth={2.5} /> Emitir primer certificado
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {certificados.map((c) => {
            const tpl   = templates.find((t) => t.id === c.tipo_certificado);
            const Icon  = tpl?.icon ?? FileCheck2;
            const accent = tpl?.accent ?? "#14b8a6";
            return (
              <div key={c.id} className="glass-card" style={{ padding: "1.1rem 1.4rem", borderLeft: `3px solid ${accent}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ width: 42, height: 42, borderRadius: "var(--radius-md)", background: `${accent}18`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={20} color={accent} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-main)" }}>{c.paciente}</div>
                      <span style={{ fontSize: "0.72rem", borderRadius: 999, padding: "0.2rem 0.55rem", background: `${accent}18`, color: accent, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
                        {c.tipo_label}
                      </span>
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><User size={11} strokeWidth={1.8} /> {c.documento}</span>
                      {c.diagnostico && <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><ClipboardList size={11} strokeWidth={1.8} /> {c.diagnostico}</span>}
                      {c.reposo_dias != null && <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><BedDouble size={11} strokeWidth={1.8} /> {c.reposo_dias} día{c.reposo_dias !== 1 ? "s" : ""}</span>}
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><CalendarDays size={11} strokeWidth={1.8} /> {c.fecha}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>ID #{c.id}</span>
                    </div>
                  </div>
                  <a href={`${base}/recetario/certificados/${c.id}/html?token=${token}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: `${accent}15`, border: `1px solid ${accent}33`, color: accent, borderRadius: 8, padding: "0.45rem 0.9rem", fontSize: "0.82rem", fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>
                    <Printer size={13} strokeWidth={2} /> Ver <ChevronRight size={12} strokeWidth={2.5} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
