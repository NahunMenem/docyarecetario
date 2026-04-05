"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  CreditCard,
  FileBadge2,
  Home,
  IdCard,
  MapPin,
  Phone,
  ScanFace,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { completarPerfilMedico } from "@/lib/api";
import { clearSession, getMedico, getToken, saveSession, type MedicoSession } from "@/lib/auth";

const PROVINCIAS = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

const TIPOS = ["medico", "enfermero"] as const;
const TIPOS_DOCUMENTO = ["dni", "pasaporte", "otro"] as const;

type FotoKey = "foto_dni_frente" | "foto_dni_dorso" | "selfie_dni";

export default function CompletarPerfilPage() {
  const router = useRouter();
  const medico = useMemo(() => getMedico(), []);
  const token = useMemo(() => getToken(), []);
  const [ready, setReady] = useState(false);

  const [form, setForm] = useState({
    tipo: (medico?.tipo || "medico").toLowerCase(),
    tipo_documento: "dni",
    numero_documento: medico?.dni || "",
    matricula: medico?.matricula || "",
    especialidad: medico?.especialidad || "",
    telefono: "",
    direccion: "",
    provincia: "",
    localidad: "",
    acepta_terminos: false,
  });
  const [fotos, setFotos] = useState<Record<FotoKey, string>>({
    foto_dni_frente: "",
    foto_dni_dorso: "",
    selfie_dni: "",
  });
  const [fotoNombres, setFotoNombres] = useState<Record<FotoKey, string>>({
    foto_dni_frente: "",
    foto_dni_dorso: "",
    selfie_dni: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!medico || !token) {
      router.replace("/login");
      return;
    }
    if (medico.perfil_completo) {
      router.replace(
        medico.validado && medico.matricula_validada
          ? "/dashboard"
          : "/cuenta-en-revision",
      );
      return;
    }
    setReady(true);
  }, [medico, token, router]);

  if (!medico || !token || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div
          className="spin"
          style={{
            width: 40,
            height: 40,
            border: "3px solid rgba(10,230,199,0.2)",
            borderTopColor: "var(--primary)",
            borderRadius: "50%",
          }}
        />
      </div>
    );
  }

  const medicoSession = medico;
  const tokenValue = token;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function toBase64(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFoto(key: FotoKey, file?: File) {
    if (!file) return;
    const base64 = await toBase64(file);
    setFotos((prev) => ({ ...prev, [key]: base64 }));
    setFotoNombres((prev) => ({ ...prev, [key]: file.name }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.acepta_terminos) {
      setError("Debes aceptar los términos para continuar.");
      return;
    }

    if (!fotos.foto_dni_frente || !fotos.foto_dni_dorso || !fotos.selfie_dni) {
      setError("Subí frente, dorso y selfie con documento para continuar.");
      return;
    }

    setLoading(true);
    try {
      const data = await completarPerfilMedico(
        {
          medico_id: medicoSession.medico_id,
          tipo: form.tipo,
          tipo_documento: form.tipo_documento,
          numero_documento: form.numero_documento.trim(),
          matricula: form.matricula.trim(),
          especialidad: form.especialidad.trim() || null,
          telefono: form.telefono.trim(),
          direccion: form.direccion.trim(),
          provincia: form.provincia.trim() || null,
          localidad: form.localidad.trim() || null,
          foto_dni_frente: fotos.foto_dni_frente,
          foto_dni_dorso: fotos.foto_dni_dorso,
          selfie_dni: fotos.selfie_dni,
          acepta_terminos: form.acepta_terminos,
        },
        tokenValue,
      );

      const nextSession: MedicoSession = {
        ...medicoSession,
        tipo: data.medico?.tipo ?? medicoSession.tipo,
        email: data.medico?.email ?? medicoSession.email,
        dni: form.numero_documento.trim(),
        validado: data.medico?.validado ?? false,
        matricula_validada: data.medico?.matricula_validada ?? false,
        perfil_completo: data.medico?.perfil_completo ?? true,
        especialidad: form.especialidad.trim() || medicoSession.especialidad,
        matricula: form.matricula.trim(),
      };
      saveSession(nextSession);
      router.replace("/cuenta-en-revision");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo completar el perfil.");
    } finally {
      setLoading(false);
    }
  }

  function salir() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="glass-card" style={{ padding: "2rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "1rem",
              marginBottom: "1.6rem",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(10,230,199,0.12)",
                border: "1px solid rgba(10,230,199,0.18)",
                color: "var(--primary)",
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={26} strokeWidth={1.8} />
            </div>
            <div>
              <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                Completa tu perfil profesional
              </h1>
              <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
                Ya validamos tu acceso con Google. Ahora necesitamos tu documentación
                profesional para revisar tu matrícula y habilitar el recetario.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Profesión" icon={<Stethoscope size={14} />} required>
                <select
                  className="input"
                  value={form.tipo}
                  onChange={(e) => update("tipo", e.target.value)}
                >
                  {TIPOS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo === "medico" ? "Médico" : "Enfermero"}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Matrícula" icon={<FileBadge2 size={14} />} required>
                <input
                  className="input"
                  value={form.matricula}
                  onChange={(e) => update("matricula", e.target.value)}
                  placeholder="Ej: MN 123456"
                  required
                />
              </Field>
            </div>

            <Field label="Especialidad" icon={<Stethoscope size={14} />}>
              <input
                className="input"
                value={form.especialidad}
                onChange={(e) => update("especialidad", e.target.value)}
                placeholder="Ej: Clínica Médica"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tipo de documento" icon={<IdCard size={14} />} required>
                <select
                  className="input"
                  value={form.tipo_documento}
                  onChange={(e) => update("tipo_documento", e.target.value)}
                >
                  {TIPOS_DOCUMENTO.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Número de documento" icon={<CreditCard size={14} />} required>
                <input
                  className="input"
                  value={form.numero_documento}
                  onChange={(e) => update("numero_documento", e.target.value)}
                  placeholder="Ej: 30123456"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Teléfono" icon={<Phone size={14} />} required>
                <input
                  className="input"
                  value={form.telefono}
                  onChange={(e) => update("telefono", e.target.value)}
                  placeholder="Ej: +5491122334455"
                  required
                />
              </Field>

              <Field label="Provincia" icon={<MapPin size={14} />}>
                <select
                  className="input"
                  value={form.provincia}
                  onChange={(e) => update("provincia", e.target.value)}
                >
                  <option value="">Seleccioná...</option>
                  {PROVINCIAS.map((provincia) => (
                    <option key={provincia} value={provincia}>
                      {provincia}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Localidad" icon={<MapPin size={14} />}>
                <input
                  className="input"
                  value={form.localidad}
                  onChange={(e) => update("localidad", e.target.value)}
                  placeholder="Ej: CABA"
                />
              </Field>

              <Field label="Dirección" icon={<Home size={14} />} required>
                <input
                  className="input"
                  value={form.direccion}
                  onChange={(e) => update("direccion", e.target.value)}
                  placeholder="Ej: Av. Cabildo 1234"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <UploadCard
                label="DNI frente"
                icon={<IdCard size={16} />}
                fileName={fotoNombres.foto_dni_frente}
                onChange={(file) => handleFoto("foto_dni_frente", file)}
              />
              <UploadCard
                label="DNI dorso"
                icon={<IdCard size={16} />}
                fileName={fotoNombres.foto_dni_dorso}
                onChange={(file) => handleFoto("foto_dni_dorso", file)}
              />
              <UploadCard
                label="Selfie con DNI"
                icon={<ScanFace size={16} />}
                fileName={fotoNombres.selfie_dni}
                onChange={(file) => handleFoto("selfie_dni", file)}
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                color: "var(--text-muted)",
                fontSize: "0.92rem",
                lineHeight: 1.5,
              }}
            >
              <input
                type="checkbox"
                checked={form.acepta_terminos}
                onChange={(e) => update("acepta_terminos", e.target.checked)}
                style={{ marginTop: 3 }}
              />
              Acepto los términos y condiciones y confirmo que la documentación enviada es real.
            </label>

            {error && (
              <div
                style={{
                  background: "rgba(244,63,94,0.1)",
                  border: "1px solid rgba(244,63,94,0.3)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.875rem 1rem",
                  color: "#f87171",
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <AlertCircle size={16} strokeWidth={2} />
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
              <button type="button" className="btn-outline" onClick={salir}>
                Volver al login
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
              >
                {loading ? (
                  <>
                    <span
                      className="spin"
                      style={{
                        width: 16,
                        height: 16,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "white",
                        borderRadius: "50%",
                        display: "inline-block",
                      }}
                    />
                    Enviando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} strokeWidth={2.2} />
                    Enviar para revisión
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  required,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="label"
        style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
      >
        {icon}
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}

function UploadCard({
  label,
  icon,
  fileName,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  fileName: string;
  onChange: (file?: File) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.65rem",
        padding: "1rem",
        border: "2px dashed var(--glass-border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--input-bg)",
        cursor: "pointer",
        textAlign: "center",
        minHeight: 140,
      }}
    >
      <div style={{ color: fileName ? "var(--primary)" : "var(--text-muted)" }}>
        {fileName ? <CheckCircle2 size={24} strokeWidth={1.8} /> : icon || <Camera size={20} />}
      </div>
      <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{label}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.4 }}>
        {fileName || "Subí una imagen legible"}
      </div>
      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => onChange(e.target.files?.[0])}
      />
    </label>
  );
}
