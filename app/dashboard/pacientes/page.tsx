"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, Pencil, Trash2, Users, Phone, Mail as MailIcon, X, Check } from "lucide-react";
import { getToken, handleSessionExpired } from "@/lib/auth";
import {
  listarPacientes, crearPaciente, editarPaciente, eliminarPaciente,
  type Paciente, type PacienteIn, TIPOS_DOCUMENTO, SEXOS,
} from "@/lib/api";

const SEXO_LABEL: Record<string, string> = { M: "Masculino", F: "Femenino", X: "No binario" };

const EMPTY: PacienteIn = {
  nombre: "", apellido: "", tipo_documento: "DNI", nro_documento: "",
  sexo: "M", fecha_nacimiento: "", telefono: "", email: "",
  obra_social: "", plan: "", nro_credencial: "", cuil: "", observaciones: "",
};

// ── small helpers ─────────────────────────────────────────────────────────────
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

// ── Modal form ────────────────────────────────────────────────────────────────
function PacienteModal({
  initial, onSave, onClose, loading, error,
}: {
  initial: PacienteIn;
  onSave: (d: PacienteIn) => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}) {
  const [form, setForm] = useState<PacienteIn>(initial);
  const set = (k: keyof PacienteIn, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fields: { label: string; key: keyof PacienteIn; required?: boolean; type?: string }[] = [
    { label: "Nombre *",          key: "nombre",        required: true },
    { label: "Apellido *",        key: "apellido",       required: true },
    { label: "N° Documento *",    key: "nro_documento",  required: true },
    { label: "CUIL",              key: "cuil" },
    { label: "Fecha de nac.",     key: "fecha_nacimiento", type: "date" },
    { label: "Teléfono",          key: "telefono" },
    { label: "Email",             key: "email",          type: "email" },
    { label: "Obra social",       key: "obra_social" },
    { label: "Plan",              key: "plan" },
    { label: "N° Credencial",     key: "nro_credencial" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem", overflowY: "auto", minHeight: "100vh",
    }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: 640, padding: "2rem", margin: "auto", maxHeight: "calc(100vh - 2rem)", minHeight: 0, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontWeight: 700, fontSize: "1.2rem" }}>
            {initial.nombre ? "Editar paciente" : "Nuevo paciente"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display:"flex", alignItems:"center" }}><X size={20} strokeWidth={2} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Tipo documento */}
          <div>
            <label style={lbl}>Tipo documento *</label>
            <select style={inp} value={form.tipo_documento}
              onChange={(e) => set("tipo_documento", e.target.value as PacienteIn["tipo_documento"])}
              onFocus={focusOn} onBlur={focusOff}>
              {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Sexo */}
          <div>
            <label style={lbl}>Sexo *</label>
            <select style={inp} value={form.sexo}
              onChange={(e) => set("sexo", e.target.value as PacienteIn["sexo"])}
              onFocus={focusOn} onBlur={focusOff}>
              {SEXOS.map((s) => <option key={s} value={s}>{SEXO_LABEL[s]}</option>)}
            </select>
          </div>

          {/* Dynamic text fields */}
          {fields.map(({ label, key, required, type }) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <input
                style={inp} type={type ?? "text"} required={required}
                value={(form[key] as string) ?? ""}
                onChange={(e) => set(key, e.target.value)}
                onFocus={focusOn} onBlur={focusOff}
              />
            </div>
          ))}

          {/* Observaciones — full width */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Observaciones</label>
            <textarea
              style={{ ...inp, resize: "none", minHeight: 64 }} rows={2}
              value={form.observaciones ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
              onFocus={focusOn as never} onBlur={focusOff as never}
            />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: "1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "0.8rem 1rem", color: "#f87171", fontSize: "0.88rem" }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button className="btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave(form)} disabled={loading}>
            {loading
              ? <><span className="spin" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} /> Guardando...</>
              : <><Check size={15} strokeWidth={2.5} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PacientesPage() {
  const router = useRouter();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading]     = useState(true);
  const [q, setQ]                 = useState("");
  const [modal, setModal]         = useState<{ open: boolean; editing: Paciente | null }>({ open: false, editing: null });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [toast, setToast]         = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async (search?: string) => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const data = await listarPacientes(token, search);
      setPacientes(data.pacientes);
    } catch (error: unknown) {
      if (handleSessionExpired(error, router)) return;
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(q || undefined), 400);
    return () => clearTimeout(t);
  }, [q, load]);

  async function handleSave(form: PacienteIn) {
    const token = getToken();
    if (!token) return;
    if (!form.nombre.trim() || !form.apellido.trim() || !form.nro_documento.trim()) {
      setError("Nombre, apellido y N° de documento son obligatorios");
      return;
    }
    setSaving(true); setError("");
    try {
      if (modal.editing) {
        await editarPaciente(modal.editing.id, form, token);
        showToast("Paciente actualizado ✓");
      } else {
        await crearPaciente(form, token);
        showToast("Paciente registrado ✓");
      }
      setModal({ open: false, editing: null });
      load(q || undefined);
    } catch (e: unknown) {
      if (handleSessionExpired(e, router)) return;
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Paciente) {
    if (!confirm(`¿Eliminar a ${p.apellido}, ${p.nombre}?\n\nEsta acción no se puede deshacer.`)) return;
    const token = getToken();
    if (!token) return;
    try {
      await eliminarPaciente(p.id, token);
      showToast("Paciente eliminado");
      load(q || undefined);
    } catch (e: unknown) {
      if (handleSessionExpired(e, router)) return;
      alert(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-up pb-12">

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "2rem", right: "2rem", zIndex: 300,
          background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)",
          borderRadius: 10, padding: "0.85rem 1.5rem",
          color: "var(--primary)", fontWeight: 600, fontSize: "0.9rem",
          backdropFilter: "blur(8px)",
        }}>✓ {toast}</div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800 }}>Mis Pacientes</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            {pacientes.length} paciente{pacientes.length !== 1 ? "s" : ""} registrado{pacientes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary" style={{ display:"inline-flex", alignItems:"center", gap:"0.4rem" }} onClick={() => { setError(""); setModal({ open: true, editing: null }); }}>
          <UserPlus size={16} strokeWidth={2} /> Nuevo paciente
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)", display:"flex" }}>
          <Search size={16} strokeWidth={1.8} />
        </span>
        <input
          style={{ ...inp, paddingLeft: "2.5rem" }}
          placeholder="Buscar por nombre, apellido, documento o email..."
          value={q} onChange={(e) => setQ(e.target.value)}
          onFocus={focusOn} onBlur={focusOff}
        />
      </div>

      {/* Table / Cards */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          <div className="spin" style={{ width: 36, height: 36, border: "3px solid rgba(10,230,199,0.2)", borderTopColor: "var(--primary)", borderRadius: "50%", margin: "0 auto 1rem" }} />
          Cargando pacientes...
        </div>
      ) : pacientes.length === 0 ? (
        <div className="glass-card" style={{ textAlign: "center", padding: "3rem" }}>
          <div style={{ marginBottom: "1rem", color:"var(--text-muted)" }}><Users size={48} strokeWidth={1.2} /></div>
          <h3 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>
            {q ? "Sin resultados" : "Todavía no tenés pacientes"}
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {q ? `No se encontraron pacientes para "${q}"` : "Registrá tu primer paciente para empezar a emitir recetas"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pacientes.map((p) => (
            <div key={p.id} className="glass-card" style={{ padding: "1.1rem 1.4rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              {/* Avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, rgba(10,230,199,0.3), rgba(0,166,206,0.3))",
                border: "1px solid rgba(10,230,199,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "1rem", color: "var(--primary)",
              }}>
                {p.apellido[0]?.toUpperCase()}{p.nombre[0]?.toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                  {p.apellido}, {p.nombre}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 2 }}>
                  {p.tipo_documento} {p.nro_documento}
                  {p.fecha_nacimiento && ` · Nac: ${new Date(p.fecha_nacimiento + "T00:00").toLocaleDateString("es-AR")}`}
                  {p.obra_social && ` · ${p.obra_social}${p.plan ? ` / ${p.plan}` : ""}`}
                </div>
                {p.telefono && (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", display:"flex", alignItems:"center", gap:"0.3rem" }}>
                    <Phone size={11} strokeWidth={1.8} /> {p.telefono}
                    {p.email && <><span style={{margin:"0 2px"}}>·</span><MailIcon size={11} strokeWidth={1.8} /> {p.email}</>}
                  </div>
                )}
              </div>

              {/* Sexo badge */}
              <span style={{
                padding: "0.2rem 0.7rem", borderRadius: 9999, fontSize: "0.72rem", fontWeight: 700,
                background: "rgba(10,230,199,0.1)", color: "var(--primary)", border: "1px solid rgba(10,230,199,0.2)",
              }}>
                {SEXO_LABEL[p.sexo] ?? p.sexo}
              </span>

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                <button
                  onClick={() => { setError(""); setModal({ open: true, editing: p }); }}
                  style={{ background: "rgba(10,230,199,0.08)", border: "1px solid rgba(10,230,199,0.2)", color: "var(--primary)", borderRadius: 8, padding: "0.45rem 0.9rem", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, transition: "all 0.2s", display:"inline-flex", alignItems:"center", gap:"0.3rem" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(10,230,199,0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(10,230,199,0.08)")}
                ><Pencil size={13} strokeWidth={2} /> Editar</button>
                <button
                  onClick={() => handleDelete(p)}
                  style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", color: "#f43f5e", borderRadius: 8, padding: "0.45rem 0.9rem", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, transition: "all 0.2s", display:"inline-flex", alignItems:"center", gap:"0.3rem" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(244,63,94,0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(244,63,94,0.08)")}
                ><Trash2 size={13} strokeWidth={2} /> Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <PacienteModal
          initial={modal.editing
            ? {
                nombre: modal.editing.nombre, apellido: modal.editing.apellido,
                tipo_documento: modal.editing.tipo_documento, nro_documento: modal.editing.nro_documento,
                sexo: modal.editing.sexo, fecha_nacimiento: modal.editing.fecha_nacimiento ?? "",
                telefono: modal.editing.telefono ?? "", email: modal.editing.email ?? "",
                obra_social: modal.editing.obra_social ?? "", plan: modal.editing.plan ?? "",
                nro_credencial: modal.editing.nro_credencial ?? "", cuil: modal.editing.cuil ?? "",
                observaciones: modal.editing.observaciones ?? "",
              }
            : EMPTY}
          onSave={handleSave}
          onClose={() => setModal({ open: false, editing: null })}
          loading={saving}
          error={error}
        />
      )}
    </div>
  );
}
