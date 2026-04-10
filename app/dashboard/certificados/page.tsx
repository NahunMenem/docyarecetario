"use client";

import { useEffect, useState, useCallback, type CSSProperties, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  FileCheck2, Plus, Printer, CalendarDays, User, ClipboardList,
  BedDouble, X, Check, AlertCircle, ChevronRight, BriefcaseBusiness,
  School, Stethoscope, House,
} from "lucide-react";
import { getToken, handleSessionExpired } from "@/lib/auth";
import {
  listarPacientes, listarCertificados, emitirCertificado,
  type Paciente, type CertificadoResumen, type CertificadoIn,
} from "@/lib/api";

type CertificadoTipo =
  | "ausentismo_laboral"
  | "ausentismo_escolar"
  | "constancia_asistencia"
  | "reposo_domiciliario";

type CertField = {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "number" | "date" | "time" | "textarea" | "select";
  options?: string[];
  required?: boolean;
};

type CertTemplate = {
  id: CertificadoTipo;
  label: string;
  desc: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  accent: string;
  requiresDiagnostico?: boolean;
  fields: CertField[];
};

const inp: CSSProperties = {
  width: "100%",
  background: "var(--input-bg)",
  border: "1px solid var(--glass-border)",
  borderRadius: 10,
  padding: "0.82rem 1rem",
  color: "var(--text-main)",
  fontSize: "0.92rem",
  fontFamily: "Outfit, sans-serif",
  outline: "none",
};

const lbl: CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: "0.74rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};

const templates: CertTemplate[] = [
  {
    id: "ausentismo_laboral",
    label: "Ausentismo laboral",
    desc: "Justificación para trabajo, empresa u organismo",
    icon: BriefcaseBusiness,
    accent: "#14b8a6",
    requiresDiagnostico: true,
    fields: [
      { key: "presentar_ante", label: "Presentar ante", placeholder: "Empresa / empleador / organismo", required: true },
      {
        key: "tipo_indicacion",
        label: "Tipo de indicación",
        placeholder: "",
        type: "select",
        required: true,
        options: ["ausencia laboral justificada", "reposo domiciliario absoluto", "reposo relativo", "reducción de tareas"],
      },
      { key: "dias_indicados", label: "Días indicados", placeholder: "3", type: "number", required: true },
      { key: "fecha_inicio", label: "Fecha inicio", placeholder: "", type: "date", required: true },
      { key: "fecha_fin", label: "Fecha fin", placeholder: "", type: "date", required: true },
    ],
  },
  {
    id: "ausentismo_escolar",
    label: "Ausentismo escolar",
    desc: "Justificación de inasistencia para institución educativa",
    icon: School,
    accent: "#0ea5e9",
    requiresDiagnostico: true,
    fields: [
      { key: "responsable", label: "Padre, madre o tutor", placeholder: "Nombre del responsable", required: true },
      { key: "institucion", label: "Institución educativa", placeholder: "Nombre de la escuela / jardín", required: true },
      { key: "fecha_desde", label: "Desde", placeholder: "", type: "date", required: true },
      { key: "fecha_hasta", label: "Hasta", placeholder: "", type: "date", required: true },
      { key: "dias_habiles", label: "Días hábiles", placeholder: "2", type: "number", required: true },
    ],
  },
  {
    id: "constancia_asistencia",
    label: "Constancia de asistencia",
    desc: "Acredita concurrencia a consulta sin exponer datos clínicos de más",
    icon: Stethoscope,
    accent: "#22c55e",
    fields: [
      { key: "fecha_asistencia", label: "Fecha de asistencia", placeholder: "", type: "date", required: true },
      { key: "hora_asistencia", label: "Hora", placeholder: "", type: "time", required: true },
      { key: "duracion_minutos", label: "Duración en minutos", placeholder: "30", type: "number", required: true },
      { key: "motivo_consulta", label: "Motivo de consulta", placeholder: "Control clínico / seguimiento / síntomas", required: true },
    ],
  },
  {
    id: "reposo_domiciliario",
    label: "Reposo domiciliario",
    desc: "Indicación formal de reposo con período e indicaciones",
    icon: House,
    accent: "#f59e0b",
    requiresDiagnostico: true,
    fields: [
      {
        key: "tipo_reposo",
        label: "Tipo de reposo",
        placeholder: "",
        type: "select",
        required: true,
        options: ["absoluto", "relativo", "en cama"],
      },
      { key: "dias_indicados", label: "Días indicados", placeholder: "4", type: "number", required: true },
      { key: "fecha_inicio", label: "Fecha inicio", placeholder: "", type: "date", required: true },
      { key: "fecha_fin", label: "Fecha fin", placeholder: "", type: "date", required: true },
      { key: "indicaciones_adicionales", label: "Indicaciones adicionales", placeholder: "Hidratación, control, medicación...", type: "textarea" },
    ],
  },
];

const templateMap = Object.fromEntries(templates.map((t) => [t.id, t])) as Record<CertificadoTipo, CertTemplate>;

function focusOn(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--primary-dark)";
  e.target.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.15)";
}

function focusOff(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--glass-border)";
  e.target.style.boxShadow = "none";
}

function renderField(
  field: CertField,
  value: string,
  onChange: (value: string) => void,
) {
  if (field.type === "textarea") {
    return (
      <textarea
        style={{ ...inp, resize: "vertical", minHeight: 92 }}
        rows={4}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={focusOn as never}
        onBlur={focusOff as never}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        style={inp}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={focusOn}
        onBlur={focusOff}
      >
        <option value="">Seleccioná...</option>
        {field.options?.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      style={inp}
      type={field.type ?? "text"}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={focusOn}
      onBlur={focusOff}
    />
  );
}

function patientDisplay(paciente?: Paciente) {
  const edad = (() => {
    if (!paciente?.fecha_nacimiento) return "XX";
    const nacimiento = new Date(paciente.fecha_nacimiento);
    if (Number.isNaN(nacimiento.getTime())) return "XX";
    const hoy = new Date();
    let years = hoy.getFullYear() - nacimiento.getFullYear();
    const pasoCumple =
      hoy.getMonth() > nacimiento.getMonth() ||
      (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() >= nacimiento.getDate());
    if (!pasoCumple) years -= 1;
    return String(years);
  })();

  if (!paciente) {
    return {
      nombre: "Nombre y apellido completo",
      documento: "00.000.000",
      edad,
    };
  }

  return {
    nombre: `${paciente.nombre} ${paciente.apellido}`,
    documento: paciente.nro_documento,
    edad,
  };
}

function renderTemplateGuide(
  template: CertTemplate,
  paciente: Paciente | undefined,
  campos: Record<string, string>,
) {
  const data = patientDisplay(paciente);

  if (template.id === "ausentismo_laboral") {
    return (
      <>
        <p style={{ color: "var(--text-main)", fontSize: "0.95rem", lineHeight: 1.9 }}>
          <strong style={{ color: "var(--primary-dark)", letterSpacing: "0.08em" }}>CERTIFICO</strong> que el/la Sr./Sra.
          {" "}<span style={{ color: "var(--text-muted)" }}>{data.nombre}</span>, de <span style={{ color: "var(--text-muted)" }}>{data.edad}</span> años,
          DNI Nro. <span style={{ color: "var(--text-muted)" }}>{data.documento}</span>.
        </p>
        <p style={{ color: "var(--text-main)", fontSize: "0.95rem", lineHeight: 1.9, marginTop: 12 }}>
          Por lo expuesto, se indica <span style={{ color: "var(--text-muted)" }}>{campos.dias_indicados || "Nro."}</span> días de{" "}
          <span style={{ color: "var(--text-muted)" }}>{campos.tipo_indicacion || "Seleccionar"}</span>, con fecha de inicio el{" "}
          <span style={{ color: "var(--text-muted)" }}>{campos.fecha_inicio || "dd/mm/aaaa"}</span> y alta estimada el{" "}
          <span style={{ color: "var(--text-muted)" }}>{campos.fecha_fin || "dd/mm/aaaa"}</span>.
        </p>
      </>
    );
  }

  if (template.id === "ausentismo_escolar") {
    return (
      <>
        <p style={{ color: "var(--text-main)", fontSize: "0.95rem", lineHeight: 1.9 }}>
          <strong style={{ color: "var(--primary-dark)", letterSpacing: "0.08em" }}>CERTIFICO</strong> que el/la menor{" "}
          <span style={{ color: "var(--text-muted)" }}>{data.nombre}</span>, de <span style={{ color: "var(--text-muted)" }}>{data.edad}</span> años,
          DNI Nro. <span style={{ color: "var(--text-muted)" }}>{data.documento}</span>, hijo/a de{" "}
          <span style={{ color: "var(--text-muted)" }}>{campos.responsable || "Nombre del padre / madre / tutor"}</span>.
        </p>
        <p style={{ color: "var(--text-main)", fontSize: "0.95rem", lineHeight: 1.9, marginTop: 12 }}>
          Motivo por el cual estuvo imposibilitado/a de concurrir al establecimiento educativo desde el día{" "}
          <span style={{ color: "var(--text-muted)" }}>{campos.fecha_desde || "dd/mm/aaaa"}</span> hasta el día{" "}
          <span style={{ color: "var(--text-muted)" }}>{campos.fecha_hasta || "dd/mm/aaaa"}</span>, inclusive ({campos.dias_habiles || "Nro."} días hábiles).
        </p>
      </>
    );
  }

  if (template.id === "constancia_asistencia") {
    return (
      <p style={{ color: "var(--text-main)", fontSize: "0.95rem", lineHeight: 1.9 }}>
        <strong style={{ color: "var(--primary-dark)", letterSpacing: "0.08em" }}>HAGO CONSTAR</strong> que el/la Sr./Sra.{" "}
        <span style={{ color: "var(--text-muted)" }}>{data.nombre}</span>, de <span style={{ color: "var(--text-muted)" }}>{data.edad}</span> años,
        DNI Nro. <span style={{ color: "var(--text-muted)" }}>{data.documento}</span>, concurrió a consulta médica el día{" "}
        <span style={{ color: "var(--text-muted)" }}>{campos.fecha_asistencia || "dd/mm/aaaa"}</span> a las{" "}
        <span style={{ color: "var(--text-muted)" }}>{campos.hora_asistencia || "HH:MM"}</span> horas, con una duración aproximada de{" "}
        <span style={{ color: "var(--text-muted)" }}>{campos.duracion_minutos || "XX"}</span> minutos.
      </p>
    );
  }

  return (
    <>
      <p style={{ color: "var(--text-main)", fontSize: "0.95rem", lineHeight: 1.9 }}>
        <strong style={{ color: "var(--primary-dark)", letterSpacing: "0.08em" }}>CERTIFICO Y PRESCRIBO</strong> que el/la Sr./Sra.{" "}
        <span style={{ color: "var(--text-muted)" }}>{data.nombre}</span>, de <span style={{ color: "var(--text-muted)" }}>{data.edad}</span> años,
        DNI Nro. <span style={{ color: "var(--text-muted)" }}>{data.documento}</span>, requiere reposo.
      </p>
      <p style={{ color: "var(--text-main)", fontSize: "0.95rem", lineHeight: 1.9, marginTop: 12 }}>
        Reposo domiciliario <span style={{ color: "var(--text-muted)" }}>{campos.tipo_reposo || "absoluto"}</span> por{" "}
        <span style={{ color: "var(--text-muted)" }}>{campos.dias_indicados || "XX"}</span> días, desde el{" "}
        <span style={{ color: "var(--text-muted)" }}>{campos.fecha_inicio || "dd/mm/aaaa"}</span> hasta el{" "}
        <span style={{ color: "var(--text-muted)" }}>{campos.fecha_fin || "dd/mm/aaaa"}</span>.
      </p>
    </>
  );
}

function NuevoCertificadoModal({
  pacientes, onSave, onClose, loading, error,
}: {
  pacientes: Paciente[];
  onSave: (d: CertificadoIn) => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}) {
  const [tipo, setTipo] = useState<CertificadoTipo>("ausentismo_laboral");
  const [pacienteId, setPacienteId] = useState(0);
  const [diagnostico, setDiagnostico] = useState("");
  const [reposoDias, setReposoDias] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});

  const template = templateMap[tipo];

  function updateCampo(key: string, value: string) {
    setCampos((prev) => ({ ...prev, [key]: value }));
  }

  function handleTipoChange(next: CertificadoTipo) {
    setTipo(next);
    setCampos({});
    setReposoDias("");
    setObservaciones("");
    setDiagnostico("");
  }

  const paciente = pacientes.find((p) => p.id === pacienteId);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(2,6,23,0.84)", backdropFilter: "blur(14px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1.25rem", overflowY: "auto",
    }}>
      <div className="glass-card" style={{ width: "min(1240px, 100%)", padding: "1.6rem", margin: "auto", maxHeight: "92vh", overflowY: "auto", background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(15,23,42,0.93))", border: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: 4 }}>
              <FileCheck2 size={20} color="var(--primary)" strokeWidth={1.8} />
              <h2 style={{ fontWeight: 800, fontSize: "1.15rem", color: "var(--text-main)" }}>Nuevo Certificado</h2>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>
              Elegí un modelo y completá solo los campos necesarios. El resto se toma del paciente y del perfil médico.
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}>
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            <div style={{ padding: "1rem", borderRadius: 18, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", minHeight: "100%" }}>
              <div style={{ ...lbl, marginBottom: 10 }}>Modelo</div>
              <div style={{ display: "grid", gap: "0.7rem" }}>
                {templates.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === tipo;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTipoChange(item.id)}
                      style={{
                        textAlign: "left",
                        borderRadius: 16,
                        padding: "0.95rem 1rem",
                        border: active ? `1px solid ${item.accent}` : "1px solid var(--glass-border)",
                        background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                        color: "var(--text-main)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div style={{ width: 38, height: 38, borderRadius: 12, background: `${item.accent}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon size={18} color={item.accent} strokeWidth={2} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{item.label}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 2 }}>{item.desc}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: "1rem", borderRadius: 18, background: "linear-gradient(180deg, rgba(10,230,199,0.16), rgba(10,230,199,0.07))", border: "1px solid rgba(10,230,199,0.24)" }}>
              <div style={{ ...lbl, marginBottom: 10 }}>Paciente seleccionado</div>
              {paciente ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-main)" }}>
                    {paciente.apellido}, {paciente.nombre}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.84rem", marginTop: 6 }}>
                    {paciente.tipo_documento} {paciente.nro_documento}
                  </div>
                  {paciente.obra_social && (
                    <div style={{ color: "var(--text-muted)", fontSize: "0.84rem", marginTop: 4 }}>
                      {paciente.obra_social}{paciente.plan ? ` · ${paciente.plan}` : ""}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>
                  Elegí un paciente para precompletar el certificado.
                </div>
              )}
            </div>

            <div style={{ padding: "1rem", borderRadius: 18, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ ...lbl, marginBottom: 10 }}>Estructura del modelo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ textAlign: "center", color: "var(--primary-dark)", fontSize: "0.84rem", fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase" }}>
                  {template.label}
                </div>
                <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }} />
                <div style={{ fontFamily: "Georgia, serif" }}>
                  {renderTemplateGuide(template, paciente, campos)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ padding: "1rem", borderRadius: 18, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.9rem" }}>
                <div>
                  <label style={lbl}>Paciente *</label>
                  <select
                    style={inp}
                    value={pacienteId}
                    onChange={(e) => setPacienteId(Number(e.target.value))}
                    onFocus={focusOn}
                    onBlur={focusOff}
                  >
                    <option value={0}>Seleccioná un paciente...</option>
                    {pacientes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.apellido}, {p.nombre} — {p.tipo_documento} {p.nro_documento}
                      </option>
                    ))}
                  </select>
                </div>

                {template.requiresDiagnostico && (
                  <div>
                    <label style={lbl}>Diagnóstico *</label>
                    <input
                      style={inp}
                      placeholder="Ej: cuadro gripal, lumbalgia aguda, síndrome febril..."
                      value={diagnostico}
                      onChange={(e) => setDiagnostico(e.target.value)}
                      onFocus={focusOn}
                      onBlur={focusOff}
                    />
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.9rem" }}>
                  {template.fields.map((field) => (
                    <div key={field.key} style={field.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                      <label style={lbl}>{field.label}{field.required ? " *" : ""}</label>
                      {renderField(field, campos[field.key] ?? "", (value) => updateCampo(field.key, value))}
                    </div>
                  ))}
                </div>

                {tipo === "reposo_domiciliario" || tipo === "ausentismo_laboral" ? (
                  <div style={{ maxWidth: 220 }}>
                    <label style={lbl}>Días de reposo</label>
                    <input
                      style={inp}
                      type="number"
                      min={0}
                      max={365}
                      placeholder="0"
                      value={reposoDias}
                      onChange={(e) => setReposoDias(e.target.value)}
                      onFocus={focusOn}
                      onBlur={focusOff}
                    />
                  </div>
                ) : null}

                <div>
                  <label style={lbl}>Observaciones</label>
                  <textarea
                    style={{ ...inp, resize: "vertical", minHeight: 88 }}
                    rows={4}
                    placeholder="Observaciones opcionales que se agregan al pie del certificado"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    onFocus={focusOn as never}
                    onBlur={focusOff as never}
                  />
                </div>
              </div>

              {error && (
                <div style={{ marginTop: "1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "0.85rem 1rem", color: "#fda4af", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <AlertCircle size={15} strokeWidth={2} /> {error}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", paddingTop: "0.25rem", position: "sticky", bottom: 0, background: "linear-gradient(180deg, rgba(15,23,42,0), rgba(15,23,42,0.96) 30%)", paddingBottom: "0.2rem" }}>
              <button className="btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
              <button
                className="btn-primary"
                disabled={loading}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                onClick={() => onSave({
                  paciente_id: pacienteId,
                  tipo_certificado: tipo,
                  diagnostico: diagnostico || undefined,
                  reposo_dias: reposoDias ? Number(reposoDias) : undefined,
                  observaciones: observaciones || undefined,
                  campos,
                })}
              >
                {loading
                  ? <><span className="spin" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} /> Emitiendo...</>
                  : <><Check size={15} strokeWidth={2.5} /> Emitir certificado</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CertificadosPage() {
  const router = useRouter();
  const [certificados, setCertificados] = useState<CertificadoResumen[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const token = getToken() ?? "";

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [certs, pacs] = await Promise.all([
        listarCertificados(token),
        listarPacientes(token),
      ]);
      setCertificados(certs.certificados);
      setPacientes(pacs.pacientes);
    } catch (err: unknown) {
      if (handleSessionExpired(err, router)) return;
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token, router]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form: CertificadoIn) {
    const template = templateMap[form.tipo_certificado];
    if (!form.paciente_id) {
      setError("Seleccioná un paciente");
      return;
    }
    if (template.requiresDiagnostico && !form.diagnostico?.trim()) {
      setError("El diagnóstico es obligatorio para este modelo");
      return;
    }
    for (const field of template.fields) {
      if (field.required && !String(form.campos?.[field.key] ?? "").trim()) {
        setError(`Completá el campo "${field.label}"`);
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      await emitirCertificado(form, token);
      setModal(false);
      showToast("Certificado emitido correctamente");
      load();
    } catch (err: unknown) {
      if (handleSessionExpired(err, router)) return;
      setError(err instanceof Error ? err.message : "Error al emitir");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-up pb-12">
      {toast && (
        <div style={{ position: "fixed", bottom: "2rem", right: "2rem", zIndex: 300, background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)", borderRadius: 10, padding: "0.85rem 1.5rem", color: "var(--primary)", fontWeight: 600, fontSize: "0.9rem", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Check size={16} strokeWidth={2.5} /> {toast}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)" }}>Certificados Médicos</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: 4 }}>
            Modelos profesionales DocYa con campos dinámicos por tipo de certificado.
          </p>
        </div>
        <button
          className="btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          onClick={() => { setError(""); setModal(true); }}
        >
          <Plus size={16} strokeWidth={2.5} /> Nuevo Certificado
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.85rem" }}>
        {templates.map((template) => {
          const Icon = template.icon;
          return (
            <div key={template.id} className="glass-card" style={{ padding: "1rem", borderLeft: `3px solid ${template.accent}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: `${template.accent}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={17} color={template.accent} strokeWidth={2} />
                </div>
                <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{template.label}</div>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", lineHeight: 1.5 }}>{template.desc}</div>
            </div>
          );
        })}
      </div>

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
          <h3 style={{ fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-main)" }}>
            Todavía no emitiste certificados
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            Podés emitir ausentismo laboral, escolar, constancia de asistencia y reposo domiciliario con diseño DocYa.
          </p>
          <button className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }} onClick={() => { setError(""); setModal(true); }}>
            <Plus size={15} strokeWidth={2.5} /> Emitir primer certificado
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {certificados.map((c) => {
            const template = templates.find((item) => item.id === c.tipo_certificado as CertificadoTipo);
            const Icon = template?.icon ?? FileCheck2;
            const accent = template?.accent ?? "#14b8a6";
            return (
              <div key={c.id} className="glass-card" style={{ padding: "1.1rem 1.4rem", borderLeft: `3px solid ${accent}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ width: 42, height: 42, borderRadius: "var(--radius-md)", background: `${accent}18`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={20} color={accent} strokeWidth={1.8} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-main)" }}>
                        {c.paciente}
                      </div>
                      <span style={{ fontSize: "0.72rem", borderRadius: 999, padding: "0.2rem 0.55rem", background: `${accent}18`, color: accent, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
                        {c.tipo_label}
                      </span>
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <User size={11} strokeWidth={1.8} /> {c.documento}
                      </span>
                      {c.diagnostico && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <ClipboardList size={11} strokeWidth={1.8} /> {c.diagnostico}
                        </span>
                      )}
                      {c.reposo_dias != null && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <BedDouble size={11} strokeWidth={1.8} /> {c.reposo_dias} día{c.reposo_dias !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <CalendarDays size={11} strokeWidth={1.8} /> {c.fecha}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>ID #{c.id}</span>
                    </div>
                  </div>

                  <a
                    href={`${base}/recetario/certificados/${c.id}/html?token=${token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: `${accent}15`, border: `1px solid ${accent}33`, color: accent, borderRadius: 8, padding: "0.45rem 0.9rem", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, textDecoration: "none", flexShrink: 0 }}
                  >
                    <Printer size={13} strokeWidth={2} /> Ver
                    <ChevronRight size={12} strokeWidth={2.5} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <NuevoCertificadoModal
          pacientes={pacientes}
          onSave={handleSave}
          onClose={() => setModal(false)}
          loading={saving}
          error={error}
        />
      )}
    </div>
  );
}
