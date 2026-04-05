"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileBadge2,
  Home,
  IdCard,
  MapPin,
  Phone,
  ScanFace,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { completarPerfilMedico } from "@/lib/api";
import { clearSession, getMedico, getToken, saveSession, type MedicoSession } from "@/lib/auth";

const GOOGLE_PLACES_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
  "AIzaSyDVv_barlVwHJTgLF66dP4ESUffCBuS3uA";

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

const COUNTRIES = [
  { code: "AR", name: "Argentina", phoneCode: "54", flag: "🇦🇷" },
  { code: "UY", name: "Uruguay", phoneCode: "598", flag: "🇺🇾" },
  { code: "CL", name: "Chile", phoneCode: "56", flag: "🇨🇱" },
  { code: "PY", name: "Paraguay", phoneCode: "595", flag: "🇵🇾" },
  { code: "BO", name: "Bolivia", phoneCode: "591", flag: "🇧🇴" },
  { code: "BR", name: "Brasil", phoneCode: "55", flag: "🇧🇷" },
  { code: "PE", name: "Perú", phoneCode: "51", flag: "🇵🇪" },
  { code: "CO", name: "Colombia", phoneCode: "57", flag: "🇨🇴" },
  { code: "MX", name: "México", phoneCode: "52", flag: "🇲🇽" },
  { code: "ES", name: "España", phoneCode: "34", flag: "🇪🇸" },
  { code: "US", name: "Estados Unidos", phoneCode: "1", flag: "🇺🇸" },
] as const;

type FotoKey = "foto_dni_frente" | "foto_dni_dorso" | "selfie_dni";

type Prediction = {
  description: string;
  place_id: string;
};

export default function CompletarPerfilPage() {
  const router = useRouter();
  const medico = useMemo(() => getMedico(), []);
  const token = useMemo(() => getToken(), []);
  const [ready, setReady] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [addressPredictions, setAddressPredictions] = useState<Prediction[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [countryCode, setCountryCode] = useState<string>("AR");

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

  const selectedCountry =
    COUNTRIES.find((country) => country.code === countryCode) ?? COUNTRIES[0];

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

  useEffect(() => {
    if (!googleReady || !form.direccion.trim() || form.direccion.trim().length < 3) {
      setAddressPredictions([]);
      setAddressSearching(false);
      return;
    }

    const googleMaps = (window as Window & { google?: any }).google?.maps;
    const service = googleMaps?.places ? new googleMaps.places.AutocompleteService() : null;
    if (!service) return;

    const handle = window.setTimeout(() => {
      setAddressSearching(true);
      service.getPlacePredictions(
        {
          input: form.direccion.trim(),
          types: ["address"],
          componentRestrictions: { country: countryCode.toLowerCase() },
        },
        (
          predictions: Array<{ description: string; place_id: string }> | null,
          status: string,
        ) => {
          if (status === "OK" && predictions) {
            setAddressPredictions(
              predictions.map((item) => ({
                description: item.description,
                place_id: item.place_id,
              })),
            );
          } else {
            setAddressPredictions([]);
          }
          setAddressSearching(false);
        },
      );
    }, 260);

    return () => window.clearTimeout(handle);
  }, [form.direccion, googleReady, countryCode]);

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

  function buildInternationalPhone() {
    const digits = form.telefono.replace(/[^\d]/g, "");
    return `+${selectedCountry.phoneCode}${digits}`;
  }

  function isValidInternationalPhone(value: string) {
    return /^\+[1-9]\d{7,14}$/.test(value);
  }

  function pickAddress(prediction: Prediction) {
    update("direccion", prediction.description);
    setAddressPredictions([]);

    const googleMaps = (window as Window & { google?: any }).google?.maps;
    const geocoder = googleMaps ? new googleMaps.Geocoder() : null;
    if (!geocoder) return;

    geocoder.geocode(
      { placeId: prediction.place_id },
      (
        results:
          | Array<{
              address_components: Array<{
                long_name: string;
                short_name: string;
                types: string[];
              }>;
            }>
          | null,
        status: string,
      ) => {
        if (status !== "OK" || !results?.[0]) return;
        const components = results[0].address_components;
      const findByType = (type: string) =>
        components.find((component) => component.types.includes(type))?.long_name ?? "";

      const locality =
        findByType("locality") ||
        findByType("administrative_area_level_2") ||
        findByType("sublocality");
      const province = findByType("administrative_area_level_1");

      setForm((prev) => ({
        ...prev,
        localidad: prev.localidad || locality,
        provincia: prev.provincia || province,
      }));
      },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.acepta_terminos) {
      setError("Debes aceptar los términos para continuar.");
      return;
    }

    const telefonoInternacional = buildInternationalPhone();
    if (!isValidInternationalPhone(telefonoInternacional)) {
      setError("Ingresá un teléfono internacional válido.");
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
          telefono: telefonoInternacional,
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
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={() => setGoogleReady(true)}
      />
      <div className="min-h-screen py-10 px-4" style={{ background: "var(--bg-base)" }}>
        <div style={{ maxWidth: 840, margin: "0 auto" }}>
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
                  Ya validamos tu acceso con Google. Ahora necesitamos los mismos datos
                  que te pedimos en DocYa Pro para revisar tu matrícula y habilitar el recetario.
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

              <div className="grid grid-cols-1 sm:grid-cols-[240px,1fr] gap-4">
                <Field label="País" icon={<Phone size={14} />} required>
                  <div style={{ position: "relative" }}>
                    <select
                      className="input"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      style={{ appearance: "none", paddingRight: "2.2rem" }}
                    >
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.flag} {country.name} (+{country.phoneCode})
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      style={{
                        position: "absolute",
                        right: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                </Field>

                <Field label="Teléfono internacional" icon={<Phone size={14} />} required>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "96px 1fr",
                      gap: "0.65rem",
                    }}
                  >
                    <div
                      className="input"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        color: "var(--text-main)",
                      }}
                    >
                      +{selectedCountry.phoneCode}
                    </div>
                    <input
                      className="input"
                      value={form.telefono}
                      onChange={(e) => update("telefono", e.target.value)}
                      placeholder="Ej: 11 2233 4455"
                      required
                    />
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <Field label="Localidad" icon={<MapPin size={14} />}>
                  <input
                    className="input"
                    value={form.localidad}
                    onChange={(e) => update("localidad", e.target.value)}
                    placeholder="Ej: CABA"
                  />
                </Field>
              </div>

              <Field label="Dirección" icon={<Home size={14} />} required>
                <div style={{ position: "relative" }}>
                  <input
                    className="input"
                    value={form.direccion}
                    onChange={(e) => update("direccion", e.target.value)}
                    placeholder="Ej: Av. Cabildo 1234"
                    required
                    autoComplete="off"
                  />
                  {addressSearching && (
                    <div
                      style={{
                        position: "absolute",
                        right: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                      }}
                    >
                      <div
                        className="spin"
                        style={{
                          width: 16,
                          height: 16,
                          border: "2px solid rgba(10,230,199,0.2)",
                          borderTopColor: "var(--primary)",
                          borderRadius: "50%",
                        }}
                      />
                    </div>
                  )}
                  {addressPredictions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        right: 0,
                        zIndex: 20,
                        background: "var(--bg-card)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: "var(--radius-sm)",
                        overflow: "hidden",
                        boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
                      }}
                    >
                      {addressPredictions.map((prediction) => (
                        <button
                          key={prediction.place_id}
                          type="button"
                          onClick={() => pickAddress(prediction)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            background: "transparent",
                            border: "none",
                            borderBottom: "1px solid var(--glass-border)",
                            padding: "0.9rem 1rem",
                            color: "var(--text-main)",
                            cursor: "pointer",
                          }}
                        >
                          {prediction.description}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <UploadCard
                  label="DNI frente"
                  fileName={fotoNombres.foto_dni_frente}
                  onChange={(file) => handleFoto("foto_dni_frente", file)}
                />
                <UploadCard
                  label="DNI dorso"
                  fileName={fotoNombres.foto_dni_dorso}
                  onChange={(file) => handleFoto("foto_dni_dorso", file)}
                />
                <UploadCard
                  label="Selfie con DNI"
                  fileName={fotoNombres.selfie_dni}
                  onChange={(file) => handleFoto("selfie_dni", file)}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.65rem",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "1rem 1rem 1.1rem",
                }}
              >
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
                  <span>
                    Acepto los términos y condiciones y confirmo que la documentación enviada es real.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  style={{
                    alignSelf: "flex-start",
                    background: "transparent",
                    border: "none",
                    color: "var(--primary)",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Ver términos y condiciones
                </button>
              </div>

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
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </>
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
  fileName,
  onChange,
}: {
  label: string;
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
        minHeight: 148,
      }}
    >
      <div style={{ color: fileName ? "var(--primary)" : "var(--text-muted)" }}>
        {fileName ? <CheckCircle2 size={24} strokeWidth={1.8} /> : <ScanFace size={20} />}
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

function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,8,23,0.76)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 100,
      }}
    >
      <div
        className="glass-card"
        style={{
          maxWidth: 760,
          width: "100%",
          maxHeight: "84vh",
          overflowY: "auto",
          padding: "1.6rem",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            right: 16,
            top: 16,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid var(--glass-border)",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={18} />
        </button>

        <h2 style={{ fontSize: "1.55rem", fontWeight: 800, marginBottom: "1rem" }}>
          Términos y condiciones
        </h2>
        <div style={{ display: "grid", gap: "1rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
          <section>
            <h3 style={{ color: "var(--text-main)", fontSize: "1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              1. Uso profesional
            </h3>
            <p>
              El acceso al recetario DocYa está reservado exclusivamente para profesionales de la salud
              que cuenten con matrícula válida y documentación auténtica.
            </p>
          </section>
          <section>
            <h3 style={{ color: "var(--text-main)", fontSize: "1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              2. Validación de identidad
            </h3>
            <p>
              Al completar este perfil aceptás que DocYa verifique tu identidad, tu matrícula y la
              documentación enviada antes de habilitar el acceso al panel.
            </p>
          </section>
          <section>
            <h3 style={{ color: "var(--text-main)", fontSize: "1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              3. Responsabilidad profesional
            </h3>
            <p>
              Toda receta, certificado o documento emitido desde la plataforma es responsabilidad del
              profesional autenticado que lo genera.
            </p>
          </section>
          <section>
            <h3 style={{ color: "var(--text-main)", fontSize: "1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              4. Protección de datos
            </h3>
            <p>
              Los datos cargados se utilizan para verificar credenciales, habilitar funciones clínicas
              y cumplir con las obligaciones operativas y regulatorias aplicables.
            </p>
          </section>
          <section>
            <h3 style={{ color: "var(--text-main)", fontSize: "1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              5. Aceptación
            </h3>
            <p>
              Al continuar declarás que la información suministrada es veraz, completa y actualizada,
              y aceptás las políticas operativas de DocYa para el uso del recetario profesional.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
