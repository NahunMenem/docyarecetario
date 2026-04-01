"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  User, CreditCard, Mail, Phone, Lock, MapPin, Stethoscope, Hash,
  Camera, IdCard, ScanFace, PenLine, ArrowLeft, ArrowRight,
  CheckCircle2, Upload, ShieldCheck, AlertCircle, Check, Eraser,
} from "lucide-react";
import { registerMedico, subirFirmaDigital } from "@/lib/api";

const ESPECIALIDADES = [
  "Clínica Médica","Pediatría","Cardiología","Ginecología","Obstetricia",
  "Cirugía General","Ortopedia y Traumatología","Neurología","Psiquiatría",
  "Dermatología","Oftalmología","Otorrinolaringología","Urología","Oncología",
  "Endocrinología","Reumatología","Gastroenterología","Neumología",
  "Infectología","Medicina de Emergencias",
];
const PROVINCIAS = [
  "Buenos Aires","Ciudad Autónoma de Buenos Aires","Catamarca","Chaco",
  "Chubut","Córdoba","Corrientes","Entre Ríos","Formosa","Jujuy","La Pampa",
  "La Rioja","Mendoza","Misiones","Neuquén","Río Negro","Salta","San Juan",
  "San Luis","Santa Cruz","Santa Fe","Santiago del Estero","Tierra del Fuego","Tucumán",
];
const TIPOS = ["Medico","Enfermero","Kinesiologo","Fonoaudiologo","Psicologo"];
const steps = ["Datos Personales", "Datos Profesionales", "Identidad", "Firma Digital"];

// ── Signature pad ──────────────────────────────────────────────────────────────
function SignaturePad({ onSigned }: { onSigned: (file: File | null) => void }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const isDrawing    = useRef(false);
  const lastPos      = useRef({ x: 0, y: 0 });
  const [isEmpty, setIsEmpty] = useState(true);

  // Init canvas — call after the element has real layout dimensions
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    if (!w || !h) return;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    // Baseline guide
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, h - 32);
    ctx.lineTo(w - 16, h - 32);
    ctx.stroke();
  }, []);

  // Mount + add passive:false touchmove listener
  useEffect(() => {
    // Small delay so the container has layout
    const t = setTimeout(initCanvas, 30);

    const canvas = canvasRef.current;
    if (!canvas) return () => clearTimeout(t);

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const ctx = getCtx();
      if (!ctx) return;
      const rect  = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      drawLine(ctx, lastPos.current.x, lastPos.current.y, x, y);
      lastPos.current = { x, y };
    };

    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      clearTimeout(t);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, [initCanvas]);

  function getCtx() {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (!ctx) return null;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth   = 2.8;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    return ctx;
  }

  function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Mouse
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isDrawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    lastPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const ctx  = getCtx();
    if (!ctx)  return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const y    = e.clientY - rect.top;
    drawLine(ctx, lastPos.current.x, lastPos.current.y, x, y);
    lastPos.current = { x, y };
    if (isEmpty) setIsEmpty(false);
  }
  function onMouseUp() {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    exportSig();
  }

  // Touch
  function onTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    isDrawing.current = true;
    const rect  = canvasRef.current!.getBoundingClientRect();
    const touch = e.touches[0];
    lastPos.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }
  function onTouchEnd() {
    isDrawing.current = false;
    setIsEmpty(false);
    exportSig();
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    // Redraw baseline
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(16, canvas.offsetHeight - 32);
    ctx.lineTo(canvas.offsetWidth - 16, canvas.offsetHeight - 32);
    ctx.stroke();
    setIsEmpty(true);
    onSigned(null);
  }

  function exportSig() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onSigned(new File([blob], "firma.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <div>
      <div style={{ position: "relative", borderRadius: "var(--radius-sm)", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}>
        {/* Placeholder text when empty */}
        {isEmpty && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "0.5rem",
            pointerEvents: "none", userSelect: "none",
          }}>
            <PenLine size={28} color="#cbd5e1" strokeWidth={1.4} />
            <span style={{ color: "#cbd5e1", fontSize: "0.9rem", fontWeight: 500 }}>
              Firmá aquí con tu dedo o mouse
            </span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: 180,
            cursor: "crosshair",
            touchAction: "none",
            background: "#ffffff",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.6rem" }}>
        <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
          {isEmpty ? "El lienzo está vacío" : <span style={{ color: "var(--primary)", fontWeight: 600 }}>✓ Firma capturada</span>}
        </span>
        <button
          type="button"
          onClick={clear}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.35rem",
            background: "transparent", border: "1px solid var(--glass-border)",
            color: "var(--text-muted)", padding: "0.35rem 0.85rem",
            borderRadius: "var(--radius-pill)", cursor: "pointer",
            fontSize: "0.8rem", fontWeight: 600, transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#f43f5e"; e.currentTarget.style.color = "#f43f5e"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--glass-border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <Eraser size={13} strokeWidth={2} /> Borrar
        </button>
      </div>
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: "0.9rem",
              background: current > i + 1
                ? "var(--primary)"
                : current === i + 1
                ? "linear-gradient(135deg, var(--primary), var(--secondary))"
                : "rgba(255,255,255,0.05)",
              border: current >= i + 1 ? "none" : "1px solid var(--glass-border)",
              color: current >= i + 1 ? "#030b12" : "var(--text-muted)",
              boxShadow: current === i + 1 ? "0 0 15px var(--primary-glow)" : "none",
              transition: "all 0.3s ease",
            }}>
              {current > i + 1 ? <Check size={16} strokeWidth={2.5} /> : i + 1}
            </div>
            <span style={{
              fontSize: "0.68rem",
              color: current === i + 1 ? "var(--primary)" : "var(--text-muted)",
              fontWeight: current === i + 1 ? 600 : 400,
              whiteSpace: "nowrap",
            }}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              width: 44, height: 1,
              background: current > i + 1 ? "var(--primary)" : "var(--glass-border)",
              margin: "0 0.35rem", marginBottom: "1.2rem",
              transition: "background 0.3s ease",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── File drop zone ─────────────────────────────────────────────────────────────
function DropZone({ label, Icon: IconComp, uploaded, fileName, accept, onChange }: {
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  uploaded: boolean;
  fileName?: string;
  accept?: string;
  onChange: (f: File) => void;
}) {
  return (
    <div>
      <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <IconComp size={12} strokeWidth={2} color="var(--text-muted)" />
        {label} *
      </label>
      <label style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: "0.5rem", padding: "1.25rem",
        border: `2px dashed ${uploaded ? "var(--primary)" : "var(--glass-border)"}`,
        borderRadius: "var(--radius-sm)",
        background: uploaded ? "rgba(10,230,199,0.05)" : "var(--input-bg)",
        cursor: "pointer", transition: "all 0.3s ease", textAlign: "center",
      }}>
        <div style={{ color: uploaded ? "var(--primary)" : "var(--text-muted)" }}>
          {uploaded ? <CheckCircle2 size={26} strokeWidth={1.8} /> : <Upload size={26} strokeWidth={1.5} />}
        </div>
        <span style={{ fontSize: "0.83rem", color: uploaded ? "var(--primary)" : "var(--text-muted)", fontWeight: uploaded ? 600 : 400 }}>
          {fileName || "Hacé click para subir"}
        </span>
        <input type="file" accept={accept ?? "image/*"} style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])} />
      </label>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    full_name: "", dni: "", email: "", password: "", telefono: "",
    provincia: "", localidad: "", tipo: "", matricula: "", especialidad: "",
  });
  const [fotos, setFotos]         = useState<Record<string, string>>({});
  const [fotoNames, setFotoNames] = useState<Record<string, string>>({});
  const [firmaFile, setFirmaFile] = useState<File | null>(null);

  function update(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function toBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  async function handleFoto(key: string, file: File) {
    const b64 = await toBase64(file);
    setFotos((f) => ({ ...f, [key]: b64 }));
    setFotoNames((f) => ({ ...f, [key]: file.name }));
  }

  async function handleSubmit() {
    if (!firmaFile) {
      setError("Necesitás firmar antes de continuar.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const regData  = await registerMedico({ ...form, ...fotos });
      const medico_id: number | undefined = regData.medico_id ?? (regData.id as number | undefined);

      if (medico_id) {
        try {
          await subirFirmaDigital(medico_id, firmaFile);
        } catch (sigErr) {
          console.warn("Firma no subida:", sigErr);
        }
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al registrar");
    } finally {
      setLoading(false);
    }
  }

  // ── Success ─────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="glass-card text-center" style={{ maxWidth: 420, padding: "3rem 2rem" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", color: "var(--primary)" }}>
            <CheckCircle2 size={56} strokeWidth={1.5} />
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--primary)" }}>
            ¡Registro exitoso!
          </h2>
          <p style={{ color: "var(--text-muted)" }}>
            Revisá tu email para confirmar la cuenta. Redirigiendo al login...
          </p>
        </div>
      </div>
    );
  }

  // ── Page ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-10 px-4" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Image src="https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logoblanco_1_qdlnog.png" alt="DocYa" width={80} height={80} />
        </div>

        <StepIndicator current={step} />

        <div className="glass-card" style={{ padding: "2.5rem" }}>
          <h3 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--text-main)" }}>
            {steps[step - 1]}
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "2rem" }}>
            {step === 1 && "Completá tus datos personales y de contacto."}
            {step === 2 && "Ingresá tu matrícula y especialidad para validar tus credenciales."}
            {step === 3 && "Subí las fotos requeridas para verificar tu identidad médica."}
            {step === 4 && "Dibujá tu firma con el dedo o el mouse. Se incrustará en cada receta que emitas."}
          </p>

          {/* ── Step 1 ──────────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Nombre completo", key: "full_name", placeholder: "Dr. Juan García", Icon: User },
                  { label: "DNI",             key: "dni",       placeholder: "30123456",       Icon: CreditCard },
                ].map(({ label, key, placeholder, Icon }) => (
                  <div key={key}>
                    <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <Icon size={12} strokeWidth={2} color="var(--text-muted)" /> {label} *
                    </label>
                    <input className="input" placeholder={placeholder}
                      value={form[key as keyof typeof form]} onChange={(e) => update(key, e.target.value)} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Mail size={12} strokeWidth={2} color="var(--text-muted)" /> Email *
                  </label>
                  <input className="input" type="email" placeholder="medico@docya.com"
                    value={form.email} onChange={(e) => update("email", e.target.value)} />
                </div>
                <div>
                  <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Phone size={12} strokeWidth={2} color="var(--text-muted)" /> Teléfono *
                  </label>
                  <input className="input" type="tel" placeholder="+54 9 11..."
                    value={form.telefono} onChange={(e) => update("telefono", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Lock size={12} strokeWidth={2} color="var(--text-muted)" /> Contraseña *
                  </label>
                  <input className="input" type="password" placeholder="Mínimo 8 caracteres"
                    value={form.password} onChange={(e) => update("password", e.target.value)} />
                </div>
                <div>
                  <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <MapPin size={12} strokeWidth={2} color="var(--text-muted)" /> Provincia *
                  </label>
                  <select className="input" value={form.provincia} onChange={(e) => update("provincia", e.target.value)}>
                    <option value="">Seleccioná...</option>
                    {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <MapPin size={12} strokeWidth={2} color="var(--text-muted)" /> Localidad *
                </label>
                <input className="input" placeholder="Ej. CABA, Rosario..."
                  value={form.localidad} onChange={(e) => update("localidad", e.target.value)} />
              </div>
            </div>
          )}

          {/* ── Step 2 ──────────────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Stethoscope size={12} strokeWidth={2} color="var(--text-muted)" /> Profesión *
                  </label>
                  <select className="input" value={form.tipo} onChange={(e) => update("tipo", e.target.value)}>
                    <option value="">Seleccioná...</option>
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Hash size={12} strokeWidth={2} color="var(--text-muted)" /> Matrícula (MN/MP) *
                  </label>
                  <input className="input" placeholder="MN 123456"
                    value={form.matricula} onChange={(e) => update("matricula", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <Stethoscope size={12} strokeWidth={2} color="var(--text-muted)" /> Especialidad *
                </label>
                <select className="input" value={form.especialidad} onChange={(e) => update("especialidad", e.target.value)}>
                  <option value="">Seleccioná tu especialidad...</option>
                  {ESPECIALIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div style={{ background: "rgba(10,230,199,0.05)", border: "1px solid rgba(10,230,199,0.15)", borderRadius: "var(--radius-sm)", padding: "1rem 1.25rem", display: "flex", gap: "0.75rem" }}>
                <ShieldCheck size={18} color="var(--primary)" strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  Tus credenciales serán validadas contra los registros oficiales del Ministerio de Salud.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 3 ──────────────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <DropZone label="Foto de perfil (para la app)" Icon={Camera}
                uploaded={!!fotos.foto_perfil} fileName={fotoNames.foto_perfil}
                accept="image/*" onChange={(f) => handleFoto("foto_perfil", f)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DropZone label="DNI — Frente" Icon={IdCard}
                  uploaded={!!fotos.dni_frente} fileName={fotoNames.dni_frente}
                  accept="image/*,application/pdf" onChange={(f) => handleFoto("dni_frente", f)} />
                <DropZone label="DNI — Dorso" Icon={IdCard}
                  uploaded={!!fotos.dni_dorso} fileName={fotoNames.dni_dorso}
                  accept="image/*,application/pdf" onChange={(f) => handleFoto("dni_dorso", f)} />
              </div>
              <DropZone label="Selfie sosteniendo el DNI" Icon={ScanFace}
                uploaded={!!fotos.selfie} fileName={fotoNames.selfie}
                accept="image/*" onChange={(f) => handleFoto("selfie", f)} />
            </div>
          )}

          {/* ── Step 4: Signature pad ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-5">

              {/* Info */}
              <div style={{ background: "rgba(10,230,199,0.05)", border: "1px solid rgba(10,230,199,0.15)", borderRadius: "var(--radius-sm)", padding: "1rem 1.25rem", display: "flex", gap: "0.75rem" }}>
                <PenLine size={18} color="var(--primary)" strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  Esta firma aparecerá en todas tus recetas. Dibujala con tu dedo (celular) o mouse (computadora). Podés borrar y volver a firmar cuantas veces quieras.
                </p>
              </div>

              {/* Canvas wrapper */}
              <div>
                <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.5rem" }}>
                  <PenLine size={12} strokeWidth={2} color="var(--text-muted)" /> Tu firma *
                </label>
                <SignaturePad onSigned={setFirmaFile} />
              </div>

              {/* Tips */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {[
                  "Usá todo el espacio disponible para que quede legible",
                  "En celular: girá el teléfono en horizontal para más espacio",
                  "Podés actualizar tu firma en cualquier momento desde tu perfil",
                ].map((tip, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    <CheckCircle2 size={12} strokeWidth={2} color="var(--primary)" style={{ flexShrink: 0 }} />
                    {tip}
                  </div>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "var(--radius-sm)", padding: "0.875rem", color: "#f87171", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <AlertCircle size={16} strokeWidth={2} /> {error}
                </div>
              )}
            </div>
          )}

          {/* ── Navigation ──────────────────────────────────────────────────── */}
          <div className="flex justify-between mt-8" style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "1.5rem" }}>
            {step > 1 ? (
              <button className="btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                onClick={() => { setError(""); setStep((s) => s - 1); }}>
                <ArrowLeft size={15} strokeWidth={2} /> Anterior
              </button>
            ) : (
              <Link href="/login" className="btn-outline" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <ArrowLeft size={15} strokeWidth={2} /> Volver al login
              </Link>
            )}

            {step < 4 ? (
              <button className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                onClick={() => { setError(""); setStep((s) => s + 1); }}>
                Siguiente <ArrowRight size={15} strokeWidth={2} />
              </button>
            ) : (
              <button className="btn-primary" onClick={handleSubmit} disabled={loading}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                {loading ? (
                  <>
                    <span className="spin" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} />
                    Enviando...
                  </>
                ) : (
                  <><Check size={16} strokeWidth={2.5} /> Enviar Solicitud</>
                )}
              </button>
            )}
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
