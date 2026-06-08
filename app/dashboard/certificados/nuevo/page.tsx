"use client";

import { useEffect, useState, type CSSProperties, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  FileCheck2, Check, AlertCircle, ArrowLeft,
  BriefcaseBusiness, School, Stethoscope, House,
} from "lucide-react";
import { getToken, handleSessionExpired } from "@/lib/auth";
import { listarPacientes, emitirCertificado, type Paciente } from "@/lib/api";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CertificadoTipo = "ausentismo_laboral" | "ausentismo_escolar" | "constancia_asistencia" | "reposo_domiciliario";

type CertField = {
  key: string; label: string; placeholder: string;
  type?: "text" | "number" | "date" | "time" | "textarea" | "select";
  options?: string[]; required?: boolean;
};

type CertTemplate = {
  id: CertificadoTipo; label: string; desc: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  accent: string; requiresDiagnostico?: boolean; fields: CertField[];
};

// ── Templates ─────────────────────────────────────────────────────────────────

const templates: CertTemplate[] = [
  {
    id: "ausentismo_laboral", label: "Ausentismo laboral", desc: "Justificación para trabajo, empresa u organismo",
    icon: BriefcaseBusiness, accent: "#14b8a6", requiresDiagnostico: true,
    fields: [
      { key: "presentar_ante", label: "Presentar ante", placeholder: "Empresa / empleador / organismo", required: true },
      { key: "tipo_indicacion", label: "Tipo de indicación", placeholder: "", type: "select", required: true, options: ["ausencia laboral justificada", "reposo domiciliario absoluto", "reposo relativo", "reducción de tareas"] },
      { key: "dias_indicados", label: "Días indicados", placeholder: "3", type: "number", required: true },
      { key: "fecha_inicio", label: "Fecha inicio", placeholder: "", type: "date", required: true },
      { key: "fecha_fin", label: "Fecha fin", placeholder: "", type: "date", required: true },
      { key: "tratamiento_indicacion", label: "Tratamiento e indicacion de reposo laboral", placeholder: "Reposo laboral indicado, tratamiento y aclaraciones clinicas", type: "textarea", required: true },
    ],
  },
  {
    id: "ausentismo_escolar", label: "Ausentismo escolar", desc: "Justificación de inasistencia para institución educativa",
    icon: School, accent: "#0ea5e9", requiresDiagnostico: true,
    fields: [
      { key: "responsable", label: "Padre, madre o tutor", placeholder: "Nombre del responsable", required: true },
      { key: "institucion", label: "Institución educativa", placeholder: "Nombre de la escuela / jardín", required: true },
      { key: "fecha_desde", label: "Desde", placeholder: "", type: "date", required: true },
      { key: "fecha_hasta", label: "Hasta", placeholder: "", type: "date", required: true },
      { key: "dias_habiles", label: "Días hábiles", placeholder: "2", type: "number", required: true },
    ],
  },
  {
    id: "constancia_asistencia", label: "Constancia de Atención", desc: "Acredita concurrencia a consulta médica",
    icon: Stethoscope, accent: "#22c55e",
    fields: [
      { key: "fecha_asistencia", label: "Fecha de asistencia", placeholder: "", type: "date", required: true },
      { key: "hora_asistencia", label: "Hora", placeholder: "", type: "time", required: true },
      { key: "duracion_minutos", label: "Duración en minutos", placeholder: "30", type: "number", required: true },
      { key: "motivo_consulta", label: "Motivo de consulta", placeholder: "Control clínico / seguimiento / síntomas", required: true },
    ],
  },
  {
    id: "reposo_domiciliario", label: "Reposo domiciliario", desc: "Indicación formal de reposo con período e indicaciones",
    icon: House, accent: "#f59e0b", requiresDiagnostico: true,
    fields: [
      { key: "tipo_reposo", label: "Tipo de reposo", placeholder: "", type: "select", required: true, options: ["absoluto", "relativo", "en cama"] },
      { key: "dias_indicados", label: "Días indicados", placeholder: "4", type: "number", required: true },
      { key: "fecha_inicio", label: "Fecha inicio", placeholder: "", type: "date", required: true },
      { key: "fecha_fin", label: "Fecha fin", placeholder: "", type: "date", required: true },
      { key: "tratamiento_indicacion", label: "Tratamiento e indicacion de reposo", placeholder: "Reposo, tratamiento indicado, signos de alarma y control", type: "textarea", required: true },
    ],
  },
];

const templateMap = Object.fromEntries(templates.map((t) => [t.id, t])) as Record<CertificadoTipo, CertTemplate>;

// ── Estilos ───────────────────────────────────────────────────────────────────

const inp: CSSProperties = {
  width: "100%", background: "var(--input-bg)", border: "1px solid var(--glass-border)",
  borderRadius: 10, padding: "0.82rem 1rem", color: "var(--text-main)",
  fontSize: "0.92rem", fontFamily: "Outfit, sans-serif", outline: "none",
};

const lbl: CSSProperties = {
  display: "block", marginBottom: 6, fontSize: "0.74rem", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)",
};

const section: CSSProperties = {
  background: "var(--bg-card)", border: "1px solid var(--glass-border)",
  borderRadius: 18, padding: "1.25rem",
};

function focusOn(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--primary)";
  e.target.style.boxShadow = "0 0 0 3px rgba(10,230,199,0.12)";
}
function focusOff(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--glass-border)";
  e.target.style.boxShadow = "none";
}

function renderField(field: CertField, value: string, onChange: (v: string) => void) {
  if (field.type === "textarea")
    return <textarea style={{ ...inp, resize: "vertical", minHeight: 92 }} rows={4} placeholder={field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} onFocus={focusOn as never} onBlur={focusOff as never} />;
  if (field.type === "select")
    return (
      <select style={inp} value={value} onChange={(e) => onChange(e.target.value)} onFocus={focusOn} onBlur={focusOff}>
        <option value="">Seleccioná...</option>
        {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  return <input style={inp} type={field.type ?? "text"} placeholder={field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} onFocus={focusOn} onBlur={focusOff} />;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PreviewCertificado({ template, paciente, campos }: { template: CertTemplate; paciente?: Paciente; campos: Record<string, string> }) {
  const nombre   = paciente ? `${paciente.nombre} ${paciente.apellido}` : "Nombre y apellido";
  const dni      = paciente?.nro_documento ?? "00.000.000";
  const edad     = (() => {
    if (!paciente?.fecha_nacimiento) return "XX";
    const nac = new Date(paciente.fecha_nacimiento);
    if (isNaN(nac.getTime())) return "XX";
    const hoy = new Date();
    let y = hoy.getFullYear() - nac.getFullYear();
    if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) y--;
    return String(y);
  })();

  const muted: CSSProperties = { color: "var(--text-muted)", fontStyle: "italic" };
  const strong: CSSProperties = { color: "var(--primary)", fontWeight: 800, letterSpacing: "0.08em" };
  const p: CSSProperties = { color: "var(--text-main)", fontSize: "0.93rem", lineHeight: 1.9 };

  if (template.id === "ausentismo_laboral") return (
    <>
      <p style={p}><span style={strong}>CERTIFICO</span> que el/la Sr./Sra. <span style={muted}>{nombre}</span>, de <span style={muted}>{edad}</span> años, DNI <span style={muted}>{dni}</span>.</p>
      <p style={{ ...p, marginTop: 10 }}>Se indica <span style={muted}>{campos.dias_indicados || "Nro."}</span> días de <span style={muted}>{campos.tipo_indicacion || "tipo de indicación"}</span>, con inicio el <span style={muted}>{campos.fecha_inicio || "dd/mm/aaaa"}</span> y alta el <span style={muted}>{campos.fecha_fin || "dd/mm/aaaa"}</span>.</p>
      <p style={{ ...p, marginTop: 10 }}>Tratamiento e indicacion de reposo laboral: <span style={muted}>{campos.tratamiento_indicacion || "tratamiento, dias y aclaraciones clinicas"}</span>.</p>
    </>
  );

  if (template.id === "ausentismo_escolar") return (
    <>
      <p style={p}><span style={strong}>CERTIFICO</span> que el/la menor <span style={muted}>{nombre}</span>, de <span style={muted}>{edad}</span> años, DNI <span style={muted}>{dni}</span>, hijo/a de <span style={muted}>{campos.responsable || "nombre del responsable"}</span>.</p>
      <p style={{ ...p, marginTop: 10 }}>Imposibilitado/a de concurrir al establecimiento educativo desde el <span style={muted}>{campos.fecha_desde || "dd/mm/aaaa"}</span> hasta el <span style={muted}>{campos.fecha_hasta || "dd/mm/aaaa"}</span> ({campos.dias_habiles || "Nro."} días hábiles).</p>
    </>
  );

  if (template.id === "constancia_asistencia") return (
    <p style={p}><span style={strong}>HAGO CONSTAR</span> que el/la Sr./Sra. <span style={muted}>{nombre}</span>, de <span style={muted}>{edad}</span> años, DNI <span style={muted}>{dni}</span>, concurrió a consulta médica el <span style={muted}>{campos.fecha_asistencia || "dd/mm/aaaa"}</span> a las <span style={muted}>{campos.hora_asistencia || "HH:MM"}</span> hs, con una duración de <span style={muted}>{campos.duracion_minutos || "XX"}</span> minutos.</p>
  );

  return (
    <>
      <p style={p}><span style={strong}>CERTIFICO Y PRESCRIBO</span> que el/la Sr./Sra. <span style={muted}>{nombre}</span>, de <span style={muted}>{edad}</span> años, DNI <span style={muted}>{dni}</span>, requiere reposo.</p>
      <p style={{ ...p, marginTop: 10 }}>Reposo domiciliario <span style={muted}>{campos.tipo_reposo || "absoluto"}</span> por <span style={muted}>{campos.dias_indicados || "XX"}</span> días, desde el <span style={muted}>{campos.fecha_inicio || "dd/mm/aaaa"}</span> hasta el <span style={muted}>{campos.fecha_fin || "dd/mm/aaaa"}</span>.</p>
      <p style={{ ...p, marginTop: 10 }}>Tratamiento e indicacion de reposo: <span style={muted}>{campos.tratamiento_indicacion || "tratamiento, signos de alarma y control"}</span>.</p>
    </>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function NuevoCertificadoPage() {
  const router = useRouter();
  const token  = getToken() ?? "";

  const [pacientes, setPacientes]       = useState<Paciente[]>([]);
  const [tipo, setTipo]                 = useState<CertificadoTipo>("ausentismo_laboral");
  const [pacienteId, setPacienteId]     = useState(0);
  const [diagnostico, setDiagnostico]   = useState("");
  const [reposoDias, setReposoDias]     = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [campos, setCampos]             = useState<Record<string, string>>({});
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");

  const template = templateMap[tipo];
  const paciente = pacientes.find((p) => p.id === pacienteId);

  useEffect(() => {
    if (!token) return;
    listarPacientes(token).then((r) => setPacientes(r.pacientes)).catch(() => {});
  }, [token]);

  function handleTipoChange(next: CertificadoTipo) {
    setTipo(next); setCampos({}); setReposoDias(""); setObservaciones(""); setDiagnostico("");
  }

  function updateCampo(key: string, value: string) { setCampos((prev) => ({ ...prev, [key]: value })); }

  async function handleSave() {
    if (!pacienteId) { setError("Seleccioná un paciente"); return; }
    if (template.requiresDiagnostico && !diagnostico.trim()) { setError("El diagnóstico es obligatorio para este modelo"); return; }
    for (const field of template.fields) {
      if (field.required && !String(campos[field.key] ?? "").trim()) { setError(`Completá el campo "${field.label}"`); return; }
    }
    setSaving(true); setError("");
    try {
      await emitirCertificado({ paciente_id: pacienteId, tipo_certificado: tipo, diagnostico: diagnostico || undefined, reposo_dias: reposoDias ? Number(reposoDias) : undefined, observaciones: observaciones || undefined, campos }, token);
      router.push("/dashboard/certificados?emitido=1");
    } catch (err) {
      if (handleSessionExpired(err, router)) return;
      setError(err instanceof Error ? err.message : "Error al emitir");
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up pb-12" style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
        <button onClick={() => router.back()} style={{ background: "var(--bg-card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-pill)", padding: "0.45rem 1rem", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontFamily: "inherit" }}>
          <ArrowLeft size={15} strokeWidth={2} /> Volver
        </button>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <FileCheck2 size={20} color="var(--primary)" strokeWidth={1.8} />
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-main)" }}>Nuevo Certificado</h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.86rem", marginTop: 2 }}>
            Elegí un modelo y completá los campos. Los datos del paciente y médico se completan automáticamente.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr]" style={{ gap: "1.25rem", alignItems: "start" }}>

        {/* Columna izquierda */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Selector de modelo */}
          <div style={section}>
            <div style={{ ...lbl, marginBottom: 12 }}>Modelo de certificado</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1" style={{ gap: "0.6rem" }}>
              {templates.map(({ id, label, desc, icon: Icon, accent }) => {
                const active = id === tipo;
                return (
                  <button key={id} type="button" onClick={() => handleTipoChange(id as CertificadoTipo)} style={{
                    textAlign: "left", borderRadius: 14, padding: "0.85rem 1rem", cursor: "pointer",
                    border: active ? `1.5px solid ${accent}` : "1px solid var(--glass-border)",
                    background: active ? `${accent}12` : "var(--input-bg)",
                    transition: "all .18s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={17} color={accent} strokeWidth={2} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-main)" }}>{label}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paciente seleccionado */}
          <div style={{ ...section, background: "rgba(10,230,199,0.05)", border: "1px solid rgba(10,230,199,0.18)" }}>
            <div style={{ ...lbl, marginBottom: 8 }}>Paciente seleccionado</div>
            {paciente ? (
              <>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-main)" }}>{paciente.apellido}, {paciente.nombre}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.84rem", marginTop: 4 }}>{paciente.tipo_documento} {paciente.nro_documento}</div>
                {paciente.obra_social && <div style={{ color: "var(--text-muted)", fontSize: "0.84rem", marginTop: 2 }}>{paciente.obra_social}{paciente.plan ? ` · ${paciente.plan}` : ""}</div>}
              </>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>Elegí un paciente para precompletar el certificado.</div>
            )}
          </div>

        </div>

        {/* Columna derecha — formulario */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={section}>
            <div style={{ display: "grid", gap: "1rem" }}>

              {/* Paciente */}
              <div>
                <label style={lbl}>Paciente *</label>
                <select style={inp} value={pacienteId} onChange={(e) => setPacienteId(Number(e.target.value))} onFocus={focusOn} onBlur={focusOff}>
                  <option value={0}>Seleccioná un paciente...</option>
                  {pacientes.map((p) => <option key={p.id} value={p.id}>{p.apellido}, {p.nombre} — {p.tipo_documento} {p.nro_documento}</option>)}
                </select>
              </div>

              {/* Diagnóstico */}
              {template.requiresDiagnostico && (
                <div>
                  <label style={lbl}>Diagnóstico *</label>
                  <input style={inp} placeholder="Ej: cuadro gripal, lumbalgia aguda, síndrome febril..." value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} onFocus={focusOn} onBlur={focusOff} />
                </div>
              )}

              {/* Campos dinámicos */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                {template.fields.map((field) => (
                  <div key={field.key} style={field.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                    <label style={lbl}>{field.label}{field.required ? " *" : ""}</label>
                    {renderField(field, campos[field.key] ?? "", (v) => updateCampo(field.key, v))}
                  </div>
                ))}
              </div>

              {/* Días de reposo */}
              {(tipo === "reposo_domiciliario" || tipo === "ausentismo_laboral") && (
                <div style={{ maxWidth: 220 }}>
                  <label style={lbl}>Días de reposo</label>
                  <input style={inp} type="number" min={0} max={365} placeholder="0" value={reposoDias} onChange={(e) => setReposoDias(e.target.value)} onFocus={focusOn} onBlur={focusOff} />
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label style={lbl}>Observaciones</label>
                <textarea style={{ ...inp, resize: "vertical", minHeight: 88 }} rows={3} placeholder="Observaciones opcionales que se agregan al pie del certificado" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} onFocus={focusOn as never} onBlur={focusOff as never} />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: "1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "0.85rem 1rem", color: "#f43f5e", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertCircle size={15} strokeWidth={2} /> {error}
              </div>
            )}
          </div>

          {/* Botones */}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="btn-outline" onClick={() => router.back()} disabled={saving}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleSave} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.45rem", flex: 1 }}>
              {saving
                ? <><span className="spin" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#030b12", borderRadius: "50%", display: "inline-block" }} /> Emitiendo...</>
                : <><Check size={15} strokeWidth={2.5} /> Emitir certificado</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
