"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getMedico, getToken, handleSessionExpired } from "@/lib/auth";
import { listarPacientes, emitirReceta, type Paciente, type MedicamentoItem } from "@/lib/api";
import { Medicamento } from "@/lib/api";
import MedicamentoSearch from "@/components/MedicamentoSearch";
import DiagnosticoSearch from "@/components/DiagnosticoSearch";
import FinanciadorSearch from "@/components/FinanciadorSearch";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LineaReceta {
  medicamento: Medicamento;
  concentracion: string;
  presentacion: string;
  cantidad: number;
  indicaciones: string;
}

function getIfaMedicamento(m: Medicamento) {
  return (m.principio_activo_str || m.nombre_comercial || "").trim();
}

function getNombreComercialSugerido(m: Medicamento) {
  const nombre = (m.nombre_comercial || "").trim();
  const ifa = getIfaMedicamento(m).toLowerCase();
  return nombre && nombre.toLowerCase() !== ifa ? nombre : "";
}

function getRctaFinanciadorId(obraSocial: string) {
  const normalized = obraSocial.trim().toLowerCase();
  if (normalized.includes("osde")) return 28;
  if (normalized.includes("accord")) return 96;
  if (normalized.includes("luis pasteur") || normalized.includes("pasteur")) return 9;
  return undefined;
}

function getFormaConcentracion(forma?: string | null, concentracion?: string | null) {
  return [forma, concentracion].filter(Boolean).join(" ").trim();
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", background: "var(--input-bg)", border: "1px solid var(--glass-border)",
  borderRadius: 8, padding: "0.75rem 1rem", color: "var(--text-main)",
  fontSize: "0.9rem", fontFamily: "Outfit, sans-serif", outline: "none",
};
const lbl: React.CSSProperties = {
  display: "block", marginBottom: 6, fontSize: "0.75rem", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)",
};
function focusOn(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--primary-dark)";
  e.target.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.15)";
}
function focusOff(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--glass-border)";
  e.target.style.boxShadow = "none";
}

const FRECUENCIAS = [
  "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas",
  "Una vez al día","Dos veces al día","Tres veces al día",
  "Cuatro veces al día","A demanda","Según necesidad",
];

// ── PDF generation (sin cambios) ──────────────────────────────────────────────
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

async function generarPDF(
  paciente: Paciente,
  lineas: LineaReceta[],
  medico: ReturnType<typeof getMedico>,
  extras: { obra_social?: string; plan?: string; nro_credencial?: string; diagnostico?: string }
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const teal  = [20, 184, 166] as const;
  const dark  = [31, 41, 55]   as const;
  const gris  = [75, 85, 99]   as const;
  const grisL = [156, 163, 175] as const;
  const PW = 210, M = 15, INNER = PW - M * 2;

  const logoB64  = await loadImageAsBase64("https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logo_1_svfdye.png");
  const firmaB64 = medico?.firma_url ? await loadImageAsBase64(medico.firma_url) : null;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PW, 36, "F");
  doc.setDrawColor(...teal); doc.setLineWidth(0.8);
  doc.line(M, 38, PW - M, 38);
  if (logoB64) doc.addImage(logoB64, "PNG", M, 6, 22, 22);

  doc.setTextColor(...teal); doc.setFontSize(18); doc.setFont("helvetica", "bold");
  doc.text("Receta Médica Digital", M + (logoB64 ? 26 : 0), 16);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...gris);
  doc.text("Sistema de Recetas Médicas Digitales · DocYa", M + (logoB64 ? 26 : 0), 22);

  let y = 46;
  const sec = (label: string) => {
    doc.setTextColor(...teal); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(label, M, y); y += 5;
  };
  const field = (label: string, value: string, x = M, col2?: number) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...dark);
    doc.text(value || "—", x + doc.getTextWidth(label + " "), y);
    if (!col2) y += 6;
  };

  const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  sec("Médico");
  field("Médico:", medico?.full_name ?? "—");
  field("Especialidad:", medico?.especialidad ?? medico?.tipo ?? "—");
  field("Matrícula:", medico?.matricula ?? "—");
  field("Fecha:", fecha);
  y += 4;

  sec("Paciente");
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...gris);
  doc.text("Nombre:", M, y); doc.setFont("helvetica","normal"); doc.setTextColor(...dark);
  doc.text(`${paciente.apellido}, ${paciente.nombre}`, M + doc.getTextWidth("Nombre: "), y);
  doc.setFont("helvetica","bold"); doc.setTextColor(...gris);
  doc.text("DNI:", PW/2, y); doc.setFont("helvetica","normal"); doc.setTextColor(...dark);
  doc.text(paciente.nro_documento || "—", PW/2 + doc.getTextWidth("DNI: "), y); y += 6;
  doc.setFont("helvetica","bold"); doc.setTextColor(...gris);
  doc.text("Obra social:", M, y); doc.setFont("helvetica","normal"); doc.setTextColor(...dark);
  doc.text(extras.obra_social || paciente.obra_social || "—", M + doc.getTextWidth("Obra social: "), y);
  doc.setFont("helvetica","bold"); doc.setTextColor(...gris);
  doc.text("Credencial:", PW/2, y); doc.setFont("helvetica","normal"); doc.setTextColor(...dark);
  doc.text(extras.nro_credencial || paciente.nro_credencial || "—", PW/2 + doc.getTextWidth("Credencial: "), y); y += 8;

  sec("Diagnóstico");
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(...dark);
  doc.text(extras.diagnostico || "—", M, y); y += 10;

  sec("Rp / Indicaciones");
  lineas.forEach((l, i) => {
    if (y > 250) { doc.addPage(); y = 20; }
    const bh = l.indicaciones ? 32 : 26;
    doc.setFillColor(240,253,250); doc.setDrawColor(...teal); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, INNER, bh, 2, 2, "FD");
    doc.setFillColor(...teal); doc.circle(M+6, y+7, 4.5, "F");
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont("helvetica","bold");
    doc.text(String(i+1), M+6, y+9, { align: "center" });
    const tx = M+14;
    doc.setTextColor(...dark); doc.setFontSize(10); doc.setFont("helvetica","bold");
    const ifa = getIfaMedicamento(l.medicamento);
    const nombreComercial = getNombreComercialSugerido(l.medicamento);
    const formaConcentracion = getFormaConcentracion(l.medicamento.forma, l.concentracion);
    doc.text(ifa || l.medicamento.nombre_comercial, tx, y+7);
    doc.setTextColor(...gris); doc.setFontSize(7.5); doc.setFont("helvetica","normal");
    const sub = [
      nombreComercial ? `Marca sugerida: ${nombreComercial}` : "",
      formaConcentracion,
      l.presentacion || "",
      l.medicamento.laboratorio || "",
    ].filter(Boolean).join(" · ");
    if (sub) doc.text(sub, tx, y+12);
    if (l.medicamento.alertas?.length) { doc.setTextColor(180,83,9); doc.setFontSize(7); doc.text(`⚠ ${l.medicamento.alertas[0]}`, PW-M-2, y+7, { align:"right" }); }
    doc.setTextColor(...dark); doc.setFontSize(8);
    doc.text(`Cant.: ${l.cantidad}`, tx, y+19);
    doc.text(`Presentación: ${l.presentacion || "—"}`, tx+25, y+19);
    if (l.indicaciones) { doc.setTextColor(...gris); doc.setFontSize(7.5); doc.text(`Indicaciones: ${l.indicaciones}`, tx, y+26); }
    y += bh + 4;
  });
  y += 4;

  if (y > 240) { doc.addPage(); y = 20; }
  sec("Firma digital");
  if (firmaB64) { doc.addImage(firmaB64,"PNG",M,y,50,20); y += 24; }
  else { doc.setFont("helvetica","italic"); doc.setFontSize(9); doc.setTextColor(...gris); doc.text("Firma no registrada",M,y); y+=7; }
  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...grisL);
  doc.text("Documento firmado electrónicamente conforme Ley 25.506.", M, y); y+=5;
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...dark);
  doc.text(medico?.full_name ?? "", M, y);

  doc.setDrawColor(...teal); doc.setLineWidth(0.4);
  doc.line(M, 282, PW-M, 282);
  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...grisL);
  doc.text(`© ${new Date().getFullYear()} DocYa — Atención médica a domicilio`, PW/2, 287, { align:"center" });

  const nombre = `${paciente.apellido}_${paciente.nombre}`.replace(/\s+/g,"_");
  doc.save(`receta_${nombre}_${Date.now()}.pdf`);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NuevaRecetaPage() {
  const medico = getMedico();
  const router = useRouter();

  const [pacientes, setPacientes]         = useState<Paciente[]>([]);
  const [loadingPacs, setLoadingPacs]     = useState(true);
  const [pacienteId, setPacienteId]       = useState<number | null>(null);
  const [extras, setExtras]               = useState({ obra_social: "", plan: "", nro_credencial: "", diagnostico: "", id_financiador: undefined as number | undefined });
  const [lineas, setLineas]               = useState<LineaReceta[]>([]);
  const [generando, setGenerando]         = useState(false);
  const [emitiendo, setEmitiendo]         = useState(false);
  const [success, setSuccess]             = useState<{ receta_id: number; url_html: string } | null>(null);
  const [error, setError]                 = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    listarPacientes(token)
      .then((d) => setPacientes(d.pacientes))
      .catch((error: unknown) => {
        handleSessionExpired(error, router);
      })
      .finally(() => setLoadingPacs(false));
  }, []);

  const pacienteSeleccionado = pacientes.find((p) => p.id === pacienteId) ?? null;

  function agregarMedicamento(m: Medicamento) {
    setLineas((prev) => [...prev, { medicamento: m, concentracion: m.concentracion ?? "", presentacion: m.presentacion ?? "", cantidad: 1, indicaciones: "" }]);
  }
  function updateLinea(idx: number, k: keyof Omit<LineaReceta, "medicamento">, v: string | number) {
    setLineas((prev) => prev.map((l, i) => i === idx ? { ...l, [k]: v } : l));
  }
  function quitarLinea(idx: number) { setLineas((prev) => prev.filter((_, i) => i !== idx)); }

  const puedeEmitir = pacienteId !== null && lineas.length > 0;

  async function handleEmitir() {
    if (!puedeEmitir) return;
    const token = getToken();
    if (!token) return;
    setEmitiendo(true); setError("");
    try {
      const meds: MedicamentoItem[] = lineas.map((l) => ({
        nombre: getIfaMedicamento(l.medicamento) || l.medicamento.nombre_comercial,
        ifa: getIfaMedicamento(l.medicamento) || undefined,
        nombre_comercial: getNombreComercialSugerido(l.medicamento) || undefined,
        regNo: l.medicamento.regNo || l.medicamento.codigo_alfabeta || undefined,
        nombreProducto: l.medicamento.nombreProducto || l.medicamento.nombre_comercial || undefined,
        nombreDroga: l.medicamento.nombreDroga || getIfaMedicamento(l.medicamento) || undefined,
        forma_farmaceutica: l.medicamento.forma || undefined,
        concentracion: l.concentracion || undefined,
        presentacion: l.presentacion || undefined,
        cantidad: l.cantidad,
        indicaciones: l.indicaciones,
        permiteSustitucion: "N",
        tratamiento: 0,
        posologia: l.indicaciones,
        forzarDuplicado: Boolean(l.medicamento.requiereDuplicado),
      }));
      const res = await emitirReceta({
        paciente_id: pacienteId!,
        obra_social: extras.obra_social || undefined,
        plan: extras.plan || undefined,
        nro_credencial: extras.nro_credencial || undefined,
        id_financiador: extras.id_financiador || getRctaFinanciadorId(extras.obra_social),
        diagnostico: extras.diagnostico || undefined,
        medicamentos: meds,
      }, token);
      setSuccess({ receta_id: res.receta_id, url_html: res.url_html });
    } catch (e: unknown) {
      if (handleSessionExpired(e, router)) return;
      setError(e instanceof Error ? e.message : "Error al emitir");
    } finally {
      setEmitiendo(false);
    }
  }

  async function handlePDF() {
    if (!pacienteSeleccionado) return;
    setGenerando(true);
    await generarPDF(pacienteSeleccionado, lineas, medico, extras);
    setGenerando(false);
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 animate-fade-up">
        <div style={{ fontSize: "4rem" }}>✅</div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--primary)", marginBottom: "0.5rem" }}>Receta emitida</h2>
          <p style={{ color: "var(--text-muted)" }}>ID #{success.receta_id} — guardada en tu historial</p>
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <a href={`${success.url_html}?token=${getToken() ?? ""}`} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ textDecoration: "none" }}>
            🖨 Ver / Imprimir receta
          </a>
          <button className="btn-outline" onClick={() => { setSuccess(null); setLineas([]); setPacienteId(null); setExtras({ obra_social:"",plan:"",nro_credencial:"",diagnostico:"",id_financiador:undefined }); }}>
            + Nueva receta
          </button>
          <Link href="/dashboard/historial" className="btn-outline" style={{ textDecoration: "none" }}>Ver historial</Link>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-12 animate-fade-up">
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800 }}>Nueva Receta</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
          Seleccioná un paciente, agregá los medicamentos y emití la receta
        </p>
      </div>

      {/* ── 1. Paciente ── */}
      <div className="glass-card">
        <div className="section-title">👤 Paciente</div>

        {loadingPacs ? (
          <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", color:"var(--text-muted)", fontSize:"0.9rem" }}>
            <div className="spin" style={{ width:20,height:20,border:"2px solid rgba(10,230,199,0.2)",borderTopColor:"var(--primary)",borderRadius:"50%" }} />
            Cargando pacientes...
          </div>
        ) : pacientes.length === 0 ? (
          <div style={{ background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.25)", borderRadius:8, padding:"1rem 1.25rem", fontSize:"0.9rem", color:"#fbbf24" }}>
            ⚠ No tenés pacientes registrados.{" "}
            <Link href="/dashboard/pacientes" style={{ color:"var(--primary)", fontWeight:700 }}>Registrá uno primero →</Link>
          </div>
        ) : (
          <div>
            <label style={lbl}>Seleccionar paciente *</label>
            <select style={{ ...inp, cursor:"pointer" }} value={pacienteId ?? ""}
              onChange={(e) => {
                const p = pacientes.find((x) => x.id === Number(e.target.value));
                setPacienteId(Number(e.target.value) || null);
                if (p) setExtras((ex) => ({ ...ex, obra_social: p.obra_social ?? "", plan: p.plan ?? "", nro_credencial: p.nro_credencial ?? "", id_financiador: getRctaFinanciadorId(p.obra_social ?? "") }));
              }}
              onFocus={focusOn} onBlur={focusOff}>
              <option value="">— Seleccioná un paciente —</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>{p.apellido}, {p.nombre} · {p.tipo_documento} {p.nro_documento}</option>
              ))}
            </select>

            {/* Chip del paciente seleccionado */}
            {pacienteSeleccionado && (
              <div style={{ marginTop:"0.75rem", display:"flex", alignItems:"center", gap:"0.75rem", background:"rgba(10,230,199,0.06)", border:"1px solid rgba(10,230,199,0.2)", borderRadius:10, padding:"0.75rem 1rem" }}>
                <div style={{ width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,rgba(10,230,199,0.3),rgba(0,166,206,0.3))",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:"0.9rem",color:"var(--primary)",flexShrink:0 }}>
                  {pacienteSeleccionado.apellido[0]}{pacienteSeleccionado.nombre[0]}
                </div>
                <div style={{ fontSize:"0.88rem" }}>
                  <span style={{ fontWeight:700 }}>{pacienteSeleccionado.apellido}, {pacienteSeleccionado.nombre}</span>
                  <span style={{ color:"var(--text-muted)", marginLeft:"0.5rem" }}>{pacienteSeleccionado.tipo_documento} {pacienteSeleccionado.nro_documento}</span>
                  {pacienteSeleccionado.fecha_nacimiento && (
                    <span style={{ color:"var(--text-muted)", marginLeft:"0.5rem" }}>· Nac: {new Date(pacienteSeleccionado.fecha_nacimiento+"T00:00").toLocaleDateString("es-AR")}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Extras cobertura */}
        {pacienteId && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {[
              { label:"Obra social / Prepaga", key:"obra_social", placeholder:"OSDE, PAMI, Swiss Medical..." },
              { label:"Plan", key:"plan", placeholder:"210, 410..." },
              { label:"N° Credencial", key:"nro_credencial", placeholder:"15205733603" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={key === "obra_social" ? { position: "relative", zIndex: 25 } : undefined}>
                <label style={lbl}>{label}</label>
                {key === "obra_social" ? (
                  <FinanciadorSearch
                    value={extras.obra_social}
                    onChange={(obraSocial, financiador) =>
                      setExtras((ex) => ({
                        ...ex,
                        obra_social: obraSocial,
                        id_financiador: financiador?.idfinanciador,
                      }))
                    }
                  />
                ) : (
                  <input style={inp} placeholder={placeholder}
                    value={extras[key as "plan" | "nro_credencial"]}
                    onChange={(e) => setExtras((ex) => ({ ...ex, [key]: e.target.value }))}
                    onFocus={focusOn} onBlur={focusOff} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 2. Diagnóstico ── */}
      {pacienteId && (
        <div className="glass-card" style={{ overflow: "visible", position: "relative", zIndex: 30 }}>
          <div className="section-title">🩺 Diagnóstico</div>
          <DiagnosticoSearch
            value={extras.diagnostico}
            onChange={(diagnostico) => setExtras((ex) => ({ ...ex, diagnostico }))}
          />
        </div>
      )}

      {/* ── 3. Medicamentos ── */}
      {pacienteId && (
        <div className="glass-card" style={{ overflow: "visible", position: "relative", zIndex: 20 }}>
          <div className="section-title">💊 Agregar Medicamento</div>
          <MedicamentoSearch onSelect={agregarMedicamento} />
          <p style={{ color:"var(--text-muted)", fontSize:"0.8rem", marginTop:"0.75rem" }}>
            Buscá por nombre comercial (Tafirol) o principio activo (Paracetamol)
          </p>
        </div>
      )}

      {/* ── 4. Lista de medicamentos ── */}
      {lineas.length > 0 && (
        <div className="flex flex-col gap-4">
          <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
            <h2 style={{ fontWeight:700, fontSize:"1rem" }}>📋 Medicamentos prescriptos</h2>
            <span style={{ background:"rgba(10,230,199,0.1)", color:"var(--primary)", border:"1px solid rgba(10,230,199,0.2)", borderRadius:9999, padding:"0.15rem 0.6rem", fontSize:"0.75rem", fontWeight:700 }}>{lineas.length}</span>
          </div>

          {lineas.map((l, i) => (
            <div key={i} className="glass-card" style={{ borderLeft:"3px solid var(--primary-dark)", padding:"1.25rem 1.5rem" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"1rem", marginBottom:"1rem" }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:"0.75rem", minWidth:0 }}>
                  <div style={{ width:30,height:30,background:"linear-gradient(135deg,var(--primary),var(--secondary))",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",color:"#030b12",fontWeight:700,fontSize:"0.85rem",flexShrink:0 }}>{i+1}</div>
                  <div style={{ minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:"1rem", lineHeight:1.3 }}>
                      {getIfaMedicamento(l.medicamento) || l.medicamento.nombre_comercial}
                    </p>
                    {getNombreComercialSugerido(l.medicamento) && (
                      <p style={{ color:"var(--primary)", fontSize:"0.82rem", marginTop:3, fontWeight:600 }}>
                        Marca sugerida: {getNombreComercialSugerido(l.medicamento)}
                      </p>
                    )}
                    <p style={{ color:"var(--text-muted)", fontSize:"0.8rem", marginTop:2 }}>
                      {[
                        getFormaConcentracion(l.medicamento.forma, l.concentracion),
                        l.presentacion,
                        l.medicamento.laboratorio
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {l.medicamento.alertas?.length > 0 && <p style={{ color:"#fbbf24", fontSize:"0.78rem", marginTop:4 }}>⚠ {l.medicamento.alertas.join(", ")}</p>}
                  </div>
                </div>
                <button onClick={() => quitarLinea(i)} style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:"1.2rem", padding:4, transition:"color 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color="#f43f5e")}
                  onMouseLeave={(e) => (e.currentTarget.style.color="var(--text-muted)")}>✕</button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div>
                  <label style={lbl}>Concentración</label>
                  <input style={inp} placeholder="500mg" value={l.concentracion}
                    onChange={(e) => updateLinea(i,"concentracion",e.target.value)}
                    onFocus={focusOn} onBlur={focusOff} />
                </div>
                <div>
                  <label style={lbl}>Presentación</label>
                  <input style={inp} placeholder="Envase x 30 comp." value={l.presentacion}
                    onChange={(e) => updateLinea(i,"presentacion",e.target.value)}
                    onFocus={focusOn} onBlur={focusOff} />
                </div>
                <div>
                  <label style={lbl}>Cantidad</label>
                  <select style={{ ...inp, cursor:"pointer" }} value={l.cantidad}
                    onChange={(e) => updateLinea(i,"cantidad",Number(e.target.value))}
                    onFocus={focusOn} onBlur={focusOff}>
                    {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} envase{n>1?"s":""}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Frecuencia</label>
                  <select style={{ ...inp, cursor:"pointer" }} value={l.indicaciones.split(" — ")[0] ?? ""}
                    onChange={(e) => updateLinea(i,"indicaciones",e.target.value)}
                    onFocus={focusOn} onBlur={focusOff}>
                    <option value="">Seleccioná</option>
                    {FRECUENCIAS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>Indicaciones completas</label>
                <textarea style={{ ...inp, resize:"none", minHeight:60 }} rows={2}
                  placeholder="Tomar 1 comprimido cada 8hs durante 7 días, con alimentos..."
                  value={l.indicaciones}
                  onChange={(e) => updateLinea(i,"indicaciones",e.target.value)}
                  onFocus={focusOn as never} onBlur={focusOff as never} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Acciones ── */}
      {puedeEmitir && (
        <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          {error && (
            <div style={{ background:"rgba(244,63,94,0.1)", border:"1px solid rgba(244,63,94,0.3)", borderRadius:8, padding:"0.85rem 1rem", color:"#f87171", fontSize:"0.88rem" }}>
              ⚠ {error}
            </div>
          )}
          <div style={{ display:"flex", gap:"0.75rem", flexWrap:"wrap" }}>
            {/* Emitir (guarda en BD + genera HTML oficial) */}
            <button className="btn-primary" style={{ flex:1, padding:"1rem", fontSize:"1rem", justifyContent:"center" }}
              onClick={handleEmitir} disabled={emitiendo || generando}>
              {emitiendo
                ? <><span className="spin" style={{ width:18,height:18,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",display:"inline-block" }} /> Emitiendo...</>
                : "✅ Firmar y Emitir Receta"}
            </button>
            {/* PDF local (sin guardar en BD) */}
            <button className="btn-outline" style={{ padding:"1rem 1.5rem", fontSize:"0.95rem" }}
              onClick={handlePDF} disabled={generando || emitiendo}>
              {generando ? "Generando..." : "📄 Solo PDF local"}
            </button>
          </div>
          <p style={{ color:"var(--text-muted)", fontSize:"0.78rem", textAlign:"center" }}>
            &quot;Firmar y Emitir&quot; guarda la receta en el servidor y genera el documento oficial con QR verificable.
          </p>
        </div>
      )}

      {!puedeEmitir && pacientes.length > 0 && (
        <p style={{ color:"var(--text-muted)", fontSize:"0.85rem", textAlign:"center" }}>
          {!pacienteId ? "Seleccioná un paciente para continuar" : "Agregá al menos un medicamento"}
        </p>
      )}
    </div>
  );
}
