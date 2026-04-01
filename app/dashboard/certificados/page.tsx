"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileCheck2, Plus, Printer, CalendarDays, User, ClipboardList,
  BedDouble, X, Check, AlertCircle, ChevronRight,
} from "lucide-react";
import { getToken, handleSessionExpired } from "@/lib/auth";
import {
  listarPacientes, listarCertificados, emitirCertificado,
  type Paciente, type CertificadoResumen, type CertificadoIn,
} from "@/lib/api";

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

// ── Modal nuevo certificado ────────────────────────────────────────────────────
function NuevoCertificadoModal({
  pacientes, onSave, onClose, loading, error,
}: {
  pacientes: Paciente[];
  onSave: (d: CertificadoIn) => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}) {
  const [form, setForm] = useState<CertificadoIn>({
    paciente_id: 0,
    diagnostico: "",
    reposo_dias: undefined,
    observaciones: "",
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem", overflowY: "auto", minHeight: "100vh",
    }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: 580, padding: "2rem", margin: "auto", maxHeight: "calc(100vh - 2rem)", minHeight: 0, overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <FileCheck2 size={20} color="var(--primary)" strokeWidth={1.8} />
            <h2 style={{ fontWeight: 700, fontSize: "1.15rem", color: "var(--text-main)" }}>Nuevo Certificado</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}>
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-col gap-4">

          {/* Paciente */}
          <div>
            <label style={lbl}>Paciente *</label>
            <select style={inp} value={form.paciente_id}
              onChange={(e) => setForm((f) => ({ ...f, paciente_id: Number(e.target.value) }))}
              onFocus={focusOn} onBlur={focusOff}>
              <option value={0}>Seleccioná un paciente...</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.apellido}, {p.nombre} — {p.tipo_documento} {p.nro_documento}
                </option>
              ))}
            </select>
          </div>

          {/* Diagnóstico */}
          <div>
            <label style={lbl}>Diagnóstico *</label>
            <input style={inp} placeholder="Ej: Síndrome gripal, HTA esencial, J00..."
              value={form.diagnostico ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, diagnostico: e.target.value }))}
              onFocus={focusOn} onBlur={focusOff} />
          </div>

          {/* Días de reposo */}
          <div>
            <label style={lbl}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <BedDouble size={12} strokeWidth={2} color="var(--text-muted)" />
                Días de reposo (opcional)
              </span>
            </label>
            <input style={{ ...inp, width: 160 }} type="number" min={0} max={365}
              placeholder="0"
              value={form.reposo_dias ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, reposo_dias: e.target.value ? Number(e.target.value) : undefined }))}
              onFocus={focusOn} onBlur={focusOff} />
          </div>

          {/* Observaciones */}
          <div>
            <label style={lbl}>Observaciones (opcional)</label>
            <textarea style={{ ...inp, resize: "none", minHeight: 80 }} rows={3}
              placeholder="Indicaciones adicionales, restricciones, tratamiento..."
              value={form.observaciones ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
              onFocus={focusOn as never} onBlur={focusOff as never} />
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "0.8rem 1rem", color: "#f87171", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertCircle size={15} strokeWidth={2} /> {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--glass-border)" }}>
          <button className="btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn-primary" disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            onClick={() => onSave(form)}>
            {loading
              ? <><span className="spin" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} /> Emitiendo...</>
              : <><Check size={15} strokeWidth={2.5} /> Emitir Certificado</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function CertificadosPage() {
  const router = useRouter();
  const [certificados, setCertificados] = useState<CertificadoResumen[]>([]);
  const [pacientes, setPacientes]       = useState<Paciente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [modal, setModal]               = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const [toast, setToast]               = useState("");

  const base  = process.env.NEXT_PUBLIC_API_URL ?? "";
  const token = getToken() ?? "";

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

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
    } catch (error: unknown) {
      if (handleSessionExpired(error, router)) return;
      throw error;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form: CertificadoIn) {
    if (!form.paciente_id) { setError("Seleccioná un paciente"); return; }
    if (!form.diagnostico?.trim()) { setError("El diagnóstico es obligatorio"); return; }
    setSaving(true); setError("");
    try {
      await emitirCertificado(form, token);
      setModal(false);
      showToast("Certificado emitido correctamente");
      load();
    } catch (e: unknown) {
      if (handleSessionExpired(e, router)) return;
      setError(e instanceof Error ? e.message : "Error al emitir");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-up pb-12">

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: "2rem", right: "2rem", zIndex: 300, background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)", borderRadius: 10, padding: "0.85rem 1.5rem", color: "var(--primary)", fontWeight: 600, fontSize: "0.9rem", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Check size={16} strokeWidth={2.5} /> {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)" }}>Certificados Médicos</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            {certificados.length} certificado{certificados.length !== 1 ? "s" : ""} emitido{certificados.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          onClick={() => { setError(""); setModal(true); }}>
          <Plus size={16} strokeWidth={2.5} /> Nuevo Certificado
        </button>
      </div>

      {/* Content */}
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
            Emitís certificados médicos con firma digital y código QR de verificación.
          </p>
          <button className="btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            onClick={() => { setError(""); setModal(true); }}>
            <Plus size={15} strokeWidth={2.5} /> Emitir primer certificado
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {certificados.map((c) => (
            <div key={c.id} className="glass-card" style={{ padding: "1.1rem 1.4rem", borderLeft: "3px solid var(--primary-dark)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>

                {/* Icon */}
                <div style={{ width: 40, height: 40, borderRadius: "var(--radius-md)", background: "rgba(10,230,199,0.08)", border: "1px solid rgba(10,230,199,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <FileCheck2 size={20} color="var(--primary)" strokeWidth={1.8} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-main)", marginBottom: 3 }}>
                    {c.paciente}
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
                        <BedDouble size={11} strokeWidth={1.8} /> {c.reposo_dias} día{c.reposo_dias !== 1 ? "s" : ""} reposo
                      </span>
                    )}
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <CalendarDays size={11} strokeWidth={1.8} /> {c.fecha}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>ID #{c.id}</span>
                  </div>
                </div>

                {/* Action */}
                <a
                  href={`${base}/recetario/certificados/${c.id}/html?token=${token}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(10,230,199,0.08)", border: "1px solid rgba(10,230,199,0.2)", color: "var(--primary)", borderRadius: 8, padding: "0.45rem 0.9rem", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, textDecoration: "none", transition: "all 0.2s", flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(10,230,199,0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(10,230,199,0.08)")}
                >
                  <Printer size={13} strokeWidth={2} /> Ver
                  <ChevronRight size={12} strokeWidth={2.5} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
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
