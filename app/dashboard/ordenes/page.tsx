"use client";
import { useEffect, useState } from "react";
import { getMedico, type MedicoSession } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { FlaskConical, ScanLine, UserRoundCog, X, Plus } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL!;

// ── Catálogo ──────────────────────────────────────────────────────────────────

const CATALOGO = {
  laboratorio: {
    label: "Orden de laboratorio",
    Icon: FlaskConical,
    grupos: [
      { grupo: "Hematología", items: ["Hemograma completo", "Coagulograma (APTT, TP, fibrinógeno)", "VSG (eritrosedimentación)", "Reticulocitos"] },
      { grupo: "Bioquímica",  items: ["Glucemia en ayunas", "Hemoglobina glicosilada (HbA1c)", "Urea", "Creatinina", "Ácido úrico", "Perfil lipídico completo", "Transaminasas (TGO / TGP)", "Fosfatasa alcalina", "Bilirrubina total y directa", "Proteínas totales y albúmina", "LDH", "CPK"] },
      { grupo: "Tiroides",    items: ["TSH ultrasensible", "T3 libre", "T4 libre", "Anticuerpos antitiroideos (anti-TPO)"] },
      { grupo: "Orina y riñón", items: ["Orina completa con sedimento", "Microalbuminuria", "Proteinuria de 24 hs", "Clearance de creatinina", "Urocultivo"] },
      { grupo: "Infecciosos / Inflamación", items: ["PCR ultrasensible", "Hemocultivo", "Cultivo de fauces", "ASTO", "Ferritina", "Hierro sérico y TIBC"] },
      { grupo: "Hormonas",    items: ["Testosterona total", "FSH / LH", "Estradiol", "Prolactina", "Cortisol basal", "Insulina en ayunas"] },
    ],
  },
  imagenes: {
    label: "Orden de imágenes",
    Icon: ScanLine,
    grupos: [
      { grupo: "Radiografía", items: ["Rx tórax (frente y perfil)", "Rx columna cervical", "Rx columna dorsal", "Rx columna lumbar", "Rx pelvis", "Rx rodilla", "Rx tobillo / pie", "Rx mano / muñeca", "Rx abdomen", "Rx cráneo"] },
      { grupo: "Ecografía",   items: ["Eco abdominal completa", "Eco pelviana", "Eco renal y vías urinarias", "Eco tiroidea", "Eco partes blandas", "Eco obstétrica", "Eco doppler venoso miembros inferiores", "Eco doppler carotídeo"] },
      { grupo: "Tomografía (TAC)", items: ["TAC de cráneo sin contraste", "TAC de cráneo con contraste", "TAC de tórax", "TAC de abdomen y pelvis", "TAC de columna lumbar", "TAC de columna cervical"] },
      { grupo: "Resonancia (RMN)", items: ["RMN de cerebro", "RMN de columna lumbar", "RMN de columna cervical", "RMN de rodilla", "RMN de hombro", "RMN de cadera", "RMN cardíaca"] },
      { grupo: "Otros", items: ["Mamografía bilateral", "Densitometría ósea", "Ecocardiograma", "Holter de ritmo 24 hs", "Ergometría", "Endoscopía digestiva alta", "Colonoscopía"] },
    ],
  },
  derivacion: {
    label: "Derivación / Interconsulta",
    Icon: UserRoundCog,
    grupos: [
      { grupo: "Especialidades médicas",     items: ["Cardiología", "Neumonología", "Gastroenterología", "Endocrinología", "Reumatología", "Nefrología", "Hematología", "Infectología", "Oncología", "Neurología"] },
      { grupo: "Especialidades quirúrgicas", items: ["Traumatología y Ortopedia", "Cirugía general", "Cirugía vascular", "Urología", "Ginecología", "Oftalmología", "Otorrinolaringología", "Neurocirugía"] },
      { grupo: "Salud mental",   items: ["Psiquiatría", "Psicología clínica"] },
      { grupo: "Rehabilitación", items: ["Kinesiología y fisioterapia", "Fonoaudiología", "Nutrición y dietética", "Terapia ocupacional"] },
    ],
  },
} as const;

type TipoOrden = keyof typeof CATALOGO;

const CIE10_COMUNES = [
  { code: "J06.9", label: "IVAS" },
  { code: "E11.9", label: "DBT tipo 2" },
  { code: "I10",   label: "HTA esencial" },
  { code: "E88.9", label: "S. metabólico" },
  { code: "M54.5", label: "Lumbalgia" },
  { code: "J18.9", label: "Neumonía" },
  { code: "K29.7", label: "Gastritis" },
];

const PRIORIDADES = ["Normal", "Preferencial", "Urgente"] as const;
type Prioridad = (typeof PRIORIDADES)[number];

const PRIO_COLORS: Record<Prioridad, { color: string; bg: string }> = {
  Normal:       { color: "#0F6E56", bg: "#E1F5EE" },
  Preferencial: { color: "#BA7517", bg: "#FAEEDA" },
  Urgente:      { color: "#A32D2D", bg: "#FCEBEB" },
};

interface Paciente { id: number; nombre: string; apellido: string; }
interface Estudio  { nombre: string; obs: string; }
interface HistorialOrden {
  id: number;
  cuir: string;
  tipo_orden: TipoOrden;
  tipo_label: string;
  paciente: string;
  fecha: string;
  prioridad: Prioridad;
}

// ── Estilos base ──────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--glass-border)",
  borderRadius: "var(--radius-md)",
  padding: "1.5rem",
  backdropFilter: "blur(8px)",
};

const lbl: React.CSSProperties = {
  fontSize: "0.75rem", fontWeight: 700, letterSpacing: ".12em",
  textTransform: "uppercase", color: "var(--text-muted)",
  display: "block", marginBottom: "0.5rem",
};

const inp: React.CSSProperties = {
  width: "100%", padding: "0.6rem 0.85rem",
  background: "var(--input-bg)", border: "1px solid var(--glass-border)",
  borderRadius: "var(--radius-sm)", color: "var(--text-main)",
  fontSize: "0.9rem", outline: "none", fontFamily: "inherit",
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function OrdenesPage() {
  const router = useRouter();
  const [medico, setMedico]         = useState<MedicoSession | null>(null);
  const [pacientes, setPacientes]   = useState<Paciente[]>([]);
  const [pacienteId, setPacienteId] = useState<number | "">("");

  const [tipoOrden, setTipoOrden]     = useState<TipoOrden | "">("");
  const [estudios, setEstudios]       = useState<Estudio[]>([]);
  const [grupoActivo, setGrupoActivo] = useState("");
  const [estudioInput, setEstudioInput] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [cie10, setCie10]             = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const [prioridad, setPrioridad]     = useState<Prioridad>("Normal");
  const [step, setStep]               = useState(1);

  const [enviando, setEnviando]       = useState(false);
  const [error, setError]             = useState("");
  const [ordenEmitida, setOrdenEmitida] = useState<{ id: number; cuir: string; url_html: string } | null>(null);
  const [historial, setHistorial]     = useState<HistorialOrden[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const cat = tipoOrden ? CATALOGO[tipoOrden] : null;

  useEffect(() => {
    const m = getMedico();
    if (!m) { router.replace("/login"); return; }
    setMedico(m);
    fetchPacientes(m.access_token);
    fetchHistorial(m.access_token);
  }, [router]);

  async function fetchPacientes(token: string) {
    try {
      const res = await fetch(`${BASE}/recetario/pacientes`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setPacientes(data.pacientes || []);
    } catch { /* silencioso */ }
  }

  async function fetchHistorial(token: string) {
    setLoadingHistorial(true);
    try {
      const res = await fetch(`${BASE}/recetario/ordenes`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setHistorial(data.ordenes || []);
    } catch { /* silencioso */ } finally {
      setLoadingHistorial(false);
    }
  }

  function agregarEstudio(nombre: string) {
    if (!nombre.trim() || estudios.find((e) => e.nombre === nombre)) return;
    setEstudios([...estudios, { nombre, obs: "" }]);
    setEstudioInput("");
  }

  function quitarEstudio(idx: number) { setEstudios(estudios.filter((_, i) => i !== idx)); }

  function actualizarObs(idx: number, obs: string) {
    const arr = [...estudios]; arr[idx].obs = obs; setEstudios(arr);
  }

  function resetear() {
    setTipoOrden(""); setEstudios([]); setGrupoActivo("");
    setDiagnostico(""); setCie10(""); setIndicaciones("");
    setPrioridad("Normal"); setPacienteId(""); setStep(1);
    setOrdenEmitida(null); setError("");
  }

  function puedeAvanzar() {
    if (step === 1) return !!tipoOrden && !!pacienteId;
    if (step === 2) return estudios.length > 0;
    if (step === 3) return diagnostico.trim().length > 2;
    return true;
  }

  async function emitirOrden() {
    if (!medico || !tipoOrden || !pacienteId) return;
    setEnviando(true); setError("");
    try {
      const res = await fetch(`${BASE}/recetario/ordenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${medico.access_token}` },
        body: JSON.stringify({ paciente_id: pacienteId, tipo_orden: tipoOrden, estudios, diagnostico, cie10: cie10 || null, indicaciones: indicaciones || null, prioridad }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al emitir la orden");
      setOrdenEmitida({ id: data.id, cuir: data.cuir, url_html: data.url_html });
      fetchHistorial(medico.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setEnviando(false);
    }
  }

  if (!medico) return null;

  const STEPS = ["Tipo y paciente", "Estudios", "Datos clínicos", "Confirmar"];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>

      {/* Título */}
      <div style={{ marginBottom: "1.8rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.3rem" }}>
          Órdenes médicas
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Emití órdenes de laboratorio, imágenes y derivaciones con CUIR oficial.
        </p>
      </div>

      {!ordenEmitida ? (
        <div style={card}>

          {/* Stepper */}
          <div style={{
            display: "flex", gap: 0, marginBottom: "1.75rem",
            background: "var(--input-bg)", borderRadius: "var(--radius-sm)",
            padding: "4px", border: "1px solid var(--glass-border)",
          }}>
            {STEPS.map((s, i) => {
              const n = i + 1;
              const activo = step === n;
              const listo  = step > n;
              return (
                <div key={s} onClick={() => { if (listo) setStep(n); }} style={{
                  flex: 1, padding: "8px 4px", textAlign: "center", borderRadius: "6px",
                  background: activo ? "var(--primary)" : "transparent",
                  cursor: listo ? "pointer" : "default", transition: "all .2s",
                }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: activo ? "#030b12" : listo ? "var(--primary)" : "var(--text-muted)" }}>
                    {listo ? "✓ " : ""}{s}
                  </div>
                </div>
              );
            })}
          </div>

          {/* STEP 1: Tipo + paciente */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <span style={lbl}>Paciente</span>
                <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value ? Number(e.target.value) : "")} style={inp}>
                  <option value="">— Seleccioná un paciente —</option>
                  {pacientes.map((p) => <option key={p.id} value={p.id}>{p.apellido}, {p.nombre}</option>)}
                </select>
              </div>

              <div>
                <span style={lbl}>Tipo de orden</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem" }}>
                  {(Object.entries(CATALOGO) as [TipoOrden, typeof CATALOGO[TipoOrden]][]).map(([key, val]) => {
                    const activo = tipoOrden === key;
                    return (
                      <div key={key} onClick={() => { setTipoOrden(key); setEstudios([]); setGrupoActivo(""); }} style={{
                        background: activo ? "rgba(10,230,199,0.08)" : "var(--bg-card)",
                        border: `2px solid ${activo ? "var(--primary)" : "var(--glass-border)"}`,
                        borderRadius: "var(--radius-sm)", padding: "1.25rem 0.75rem",
                        cursor: "pointer", transition: "all .18s", textAlign: "center",
                      }}>
                        <val.Icon size={28} strokeWidth={1.6} style={{ color: activo ? "var(--primary)" : "var(--text-muted)", marginBottom: "0.6rem" }} />
                        <div style={{ fontWeight: 600, fontSize: "0.82rem", color: activo ? "var(--primary)" : "var(--text-main)", lineHeight: 1.3 }}>
                          {val.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Estudios */}
          {step === 2 && cat && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <span style={lbl}>Seleccioná estudios</span>
                <select value={grupoActivo} onChange={(e) => setGrupoActivo(e.target.value)} style={{ ...inp, marginBottom: "0.6rem" }}>
                  <option value="">— Seleccionar grupo —</option>
                  {cat.grupos.map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
                </select>

                {grupoActivo && (
                  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", overflow: "hidden", marginBottom: "0.6rem" }}>
                    {cat.grupos.find((g) => g.grupo === grupoActivo)?.items.map((item) => {
                      const ya = estudios.find((e) => e.nombre === item);
                      return (
                        <div key={item} onClick={() => ya ? quitarEstudio(estudios.findIndex(e => e.nombre === item)) : agregarEstudio(item)} style={{
                          padding: "0.55rem 0.75rem", fontSize: "0.85rem", cursor: "pointer",
                          background: ya ? "rgba(10,230,199,0.08)" : "transparent",
                          color: ya ? "var(--primary)" : "var(--text-main)",
                          borderBottom: "1px solid var(--glass-border)",
                          display: "flex", alignItems: "center", gap: "0.5rem", transition: "background .12s",
                        }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            background: ya ? "var(--primary)" : "var(--glass-border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {ya && <span style={{ color: "#030b12", fontSize: 10, fontWeight: 700 }}>✓</span>}
                          </span>
                          {item}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input value={estudioInput} onChange={(e) => setEstudioInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregarEstudio(estudioInput)} placeholder="Agregar estudio libre..." style={{ ...inp, flex: 1 }} />
                  <button onClick={() => agregarEstudio(estudioInput)} style={{
                    padding: "0.55rem 0.9rem", borderRadius: "var(--radius-sm)", border: "none",
                    background: "var(--primary)", color: "#030b12", fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center",
                  }}><Plus size={16} /></button>
                </div>
              </div>

              <div>
                <span style={lbl}>Orden actual ({estudios.length})</span>
                {estudios.length === 0 ? (
                  <div style={{ background: "var(--bg-surface)", border: "1.5px dashed var(--glass-border)", borderRadius: "var(--radius-sm)", padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Ningún estudio agregado aún
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {estudios.map((e, idx) => (
                      <div key={idx} style={{ background: "var(--bg-surface)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", padding: "0.65rem 0.75rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                          <span style={{ fontWeight: 500, fontSize: "0.85rem", color: "var(--text-main)" }}>{e.nombre}</span>
                          <button onClick={() => quitarEstudio(idx)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}>
                            <X size={14} />
                          </button>
                        </div>
                        <input value={e.obs} onChange={(ev) => actualizarObs(idx, ev.target.value)} placeholder="Observación (opcional)" style={{ ...inp, fontSize: "0.78rem", padding: "0.35rem 0.6rem" }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Datos clínicos */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <span style={lbl}>Diagnóstico *</span>
                <textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} placeholder="Ej: HTA estadio II. Solicito perfil cardiovascular completo." rows={3}
                  style={{ ...inp, resize: "vertical", border: diagnostico ? "1px solid var(--primary)" : "1px solid var(--glass-border)" }} />
              </div>

              <div>
                <span style={lbl}>Código CIE-10</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
                  {CIE10_COMUNES.map((c) => (
                    <button key={c.code} onClick={() => setCie10(cie10 === c.code ? "" : c.code)} style={{
                      padding: "4px 10px", borderRadius: "var(--radius-pill)",
                      border: `1px solid ${cie10 === c.code ? "var(--primary)" : "var(--glass-border)"}`,
                      background: cie10 === c.code ? "rgba(10,230,199,0.1)" : "transparent",
                      color: cie10 === c.code ? "var(--primary)" : "var(--text-muted)",
                      fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    }}>
                      <span style={{ fontFamily: "monospace", marginRight: 4 }}>{c.code}</span>{c.label}
                    </button>
                  ))}
                </div>
                <input value={cie10} onChange={(e) => setCie10(e.target.value.toUpperCase())} placeholder="O escribí el código (ej: M54.5)" style={{ ...inp, fontFamily: "monospace" }} />
              </div>

              <div>
                <span style={lbl}>Indicaciones para el paciente</span>
                <textarea value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} placeholder="Ej: Ayuno de 8 horas. Evitar ejercicio 24 hs previas." rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>

              <div>
                <span style={lbl}>Prioridad</span>
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  {PRIORIDADES.map((p) => {
                    const pc = PRIO_COLORS[p];
                    const sel = prioridad === p;
                    return (
                      <button key={p} onClick={() => setPrioridad(p)} style={{
                        flex: 1, padding: "0.6rem 0", borderRadius: "var(--radius-sm)",
                        border: `1.5px solid ${sel ? pc.color : "var(--glass-border)"}`,
                        background: sel ? pc.bg : "transparent",
                        color: sel ? pc.color : "var(--text-muted)",
                        fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
                      }}>{p}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Confirmar */}
          {step === 4 && cat && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <span style={lbl}>Resumen de la orden</span>

              {/* Tipo */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", background: "rgba(10,230,199,0.06)", border: "1px solid rgba(10,230,199,0.2)", borderRadius: "var(--radius-sm)", padding: "0.9rem 1rem" }}>
                <cat.Icon size={22} strokeWidth={1.6} style={{ color: "var(--primary)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "0.95rem" }}>{cat.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Prioridad: {prioridad}</div>
                </div>
              </div>

              {/* Paciente */}
              {(() => {
                const pac = pacientes.find((p) => p.id === pacienteId);
                return pac ? (
                  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", padding: "0.75rem 1rem" }}>
                    <span style={{ ...lbl, marginBottom: "0.2rem" }}>Paciente</span>
                    <div style={{ fontSize: "0.9rem", color: "var(--text-main)", fontWeight: 500 }}>{pac.apellido}, {pac.nombre}</div>
                  </div>
                ) : null;
              })()}

              {/* Estudios */}
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid var(--glass-border)" }}>
                  <span style={{ ...lbl, marginBottom: 0 }}>{estudios.length} estudio{estudios.length !== 1 ? "s" : ""}</span>
                </div>
                {estudios.map((e, i) => (
                  <div key={i} style={{ padding: "0.55rem 1rem", borderBottom: i < estudios.length - 1 ? "1px solid var(--glass-border)" : "none", fontSize: "0.88rem", color: "var(--text-main)", display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                    <span style={{ color: "var(--primary)", fontWeight: 700 }}>·</span>
                    {e.nombre}
                    {e.obs && <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontStyle: "italic" }}>— {e.obs}</span>}
                  </div>
                ))}
              </div>

              {/* Diagnóstico */}
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", padding: "0.75rem 1rem" }}>
                <span style={{ ...lbl, marginBottom: "0.3rem" }}>
                  Diagnóstico {cie10 && <span style={{ fontFamily: "monospace", color: "var(--primary)", fontWeight: 700 }}>· {cie10}</span>}
                </span>
                <div style={{ fontSize: "0.88rem", color: "var(--text-main)" }}>{diagnostico}</div>
                {indicaciones && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem", fontStyle: "italic" }}>{indicaciones}</div>}
              </div>

              {error && (
                <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "var(--radius-sm)", padding: "0.75rem 1rem", color: "#f43f5e", fontSize: "0.85rem" }}>
                  {error}
                </div>
              )}

              <button onClick={emitirOrden} disabled={enviando} style={{
                width: "100%", padding: "0.9rem", borderRadius: "var(--radius-sm)", border: "none",
                background: enviando ? "var(--glass-border)" : "linear-gradient(135deg, var(--primary), var(--secondary))",
                color: enviando ? "var(--text-muted)" : "#030b12",
                fontWeight: 700, fontSize: "0.95rem", cursor: enviando ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "opacity .2s",
              }}>
                {enviando ? "Generando orden y CUIR..." : `Emitir ${cat.label}`}
              </button>
            </div>
          )}

          {/* Navegación */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5rem" }}>
            <button onClick={() => setStep(step - 1)} disabled={step === 1} style={{
              padding: "0.5rem 1.1rem", borderRadius: "var(--radius-pill)",
              border: "1px solid var(--glass-border)", background: "transparent",
              color: step === 1 ? "var(--text-muted)" : "var(--text-main)",
              fontSize: "0.85rem", fontWeight: 500, cursor: step === 1 ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}>← Atrás</button>

            {step < 4 && (
              <button onClick={() => { if (puedeAvanzar()) setStep(step + 1); }} disabled={!puedeAvanzar()} style={{
                padding: "0.5rem 1.4rem", borderRadius: "var(--radius-pill)", border: "none",
                background: puedeAvanzar() ? "linear-gradient(135deg, var(--primary), var(--secondary))" : "var(--glass-border)",
                color: puedeAvanzar() ? "#030b12" : "var(--text-muted)",
                fontSize: "0.85rem", fontWeight: 700, cursor: puedeAvanzar() ? "pointer" : "not-allowed", fontFamily: "inherit",
              }}>Continuar →</button>
            )}
          </div>
        </div>
      ) : (
        /* Orden emitida */
        <div style={{ ...card, textAlign: "center", padding: "2.5rem 1.5rem" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(10,230,199,0.1)", border: "2px solid var(--primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 1rem",
          }}>
            <span style={{ color: "var(--primary)", fontSize: "1.6rem", fontWeight: 700 }}>✓</span>
          </div>
          <h2 style={{ fontWeight: 700, fontSize: "1.2rem", color: "var(--text-main)", marginBottom: "0.4rem" }}>Orden emitida exitosamente</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "0.75rem" }}>CUIR generado</p>
          <div style={{
            fontFamily: "monospace", fontSize: "0.78rem", color: "var(--primary)",
            background: "rgba(10,230,199,0.08)", display: "inline-block",
            padding: "6px 16px", borderRadius: "var(--radius-pill)", marginBottom: "1.75rem",
            border: "1px solid rgba(10,230,199,0.2)", wordBreak: "break-all",
          }}>
            {ordenEmitida.cuir}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href={`${ordenEmitida.url_html}?token=${medico?.access_token}`} target="_blank" rel="noreferrer" style={{
              padding: "0.6rem 1.2rem", borderRadius: "var(--radius-pill)",
              border: "1px solid var(--primary)", color: "var(--primary)",
              fontWeight: 600, fontSize: "0.88rem", textDecoration: "none",
              background: "rgba(10,230,199,0.08)",
            }}>Ver / Imprimir PDF</a>
            <button onClick={resetear} style={{
              padding: "0.6rem 1.2rem", borderRadius: "var(--radius-pill)", border: "none",
              background: "linear-gradient(135deg, var(--primary), var(--secondary))",
              color: "#030b12", fontWeight: 600, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit",
            }}>Nueva orden</button>
          </div>
        </div>
      )}

      {/* Historial */}
      <div style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "1rem" }}>Órdenes emitidas</h2>

        {loadingHistorial ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>Cargando...</div>
        ) : historial.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
            Aún no emitiste ninguna orden.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {historial.map((o) => {
              const col = CATALOGO[o.tipo_orden as TipoOrden];
              const pc  = PRIO_COLORS[o.prioridad as Prioridad] ?? PRIO_COLORS.Normal;
              return (
                <div key={o.id} style={{ ...card, display: "flex", alignItems: "center", gap: "1rem", padding: "0.9rem 1.2rem" }}>
                  {col && <col.Icon size={20} strokeWidth={1.6} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>{o.tipo_label}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{o.paciente} · {o.fecha}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.cuir}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "3px 8px", borderRadius: "var(--radius-pill)", background: pc.bg, color: pc.color }}>
                      {o.prioridad}
                    </span>
                    <a href={`${BASE}/recetario/ordenes/${o.id}/html?token=${medico?.access_token}`} target="_blank" rel="noreferrer" style={{
                      padding: "0.35rem 0.8rem", borderRadius: "var(--radius-pill)",
                      border: "1px solid var(--primary)", color: "var(--primary)",
                      fontSize: "0.78rem", fontWeight: 600, textDecoration: "none",
                      background: "transparent", whiteSpace: "nowrap",
                    }}>Ver PDF</a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
