“use client”;
import { useState, useRef, useEffect, useCallback } from “react”;
import { buscarMedicamentos, Medicamento } from “@/lib/api”;

interface Props {
  onSelect: (m: Medicamento) => void;
}

/** Resalta las letras que coinciden con la búsqueda dentro de un texto */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: “rgba(10,230,199,0.25)”, color: “inherit”, borderRadius: 2 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function MedicamentoSearch({ onSelect }: Props) {
  const [q, setQ] = useState(“”);
  const [results, setResults] = useState<Medicamento[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (val: string) => {
    if (val.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const data = await buscarMedicamentos(val);
      setResults(data);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQ(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 280);
  }

  function handleSelect(m: Medicamento) {
    onSelect(m);
    setQ(“”);
    setResults([]);
    setOpen(false);
  }

  function handleAddManual() {
    const nombre = q.trim();
    if (!nombre) return;
    const manualMedicamento: Medicamento = {
      id: 0,
      nombre_comercial: nombre,
      principio_activo_str: “”,
      forma: null,
      concentracion: null,
      laboratorio: null,
      requiere_receta: false,
      categoria: null,
      alertas: [],
    };
    onSelect(manualMedicamento);
    setQ(“”);
    setResults([]);
    setOpen(false);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener(“mousedown”, handleClick);
    return () => document.removeEventListener(“mousedown”, handleClick);
  }, []);

  const inputStyle = {
    width: “100%”,
    background: “var(--input-bg)”,
    border: “1px solid var(--glass-border)”,
    borderRadius: 8,
    padding: “0.8rem 2.5rem 0.8rem 1rem”,
    color: “var(--text-main)”,
    fontSize: “0.95rem”,
    fontFamily: “Outfit, sans-serif”,
    outline: “none”,
  };

  // Detectar si el usuario parece buscar por principio activo
  const byPrincipioCount = results.filter((r) => r.match_field === “principio_activo”).length;
  const byNombreCount = results.filter((r) => r.match_field === “nombre_comercial”).length;

  return (
    <div ref={wrapperRef} style={{ position: “relative” }}>
      <div style={{ position: “relative” }}>
        <input
          type=”text”
          value={q}
          onChange={handleChange}
          placeholder=”Tafirol · Paracetamol · Amoxicilina · Ibuprofeno...”
          style={inputStyle}
          onFocus={(e) => {
            e.target.style.borderColor = “var(--primary-dark)”;
            e.target.style.boxShadow = “0 0 0 3px rgba(20,184,166,0.15)”;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = “var(--glass-border)”;
            e.target.style.boxShadow = “none”;
          }}
          autoComplete=”off”
        />
        {loading && (
          <div style={{ position: “absolute”, right: 12, top: “50%”, transform: “translateY(-50%)” }}>
            <div
              className=”spin”
              style={{
                width: 18, height: 18,
                border: “2px solid rgba(10,230,199,0.2)”,
                borderTopColor: “var(--primary)”,
                borderRadius: “50%”,
              }}
            />
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          style={{
            position: “absolute”,
            top: “calc(100% + 6px)”,
            left: 0, right: 0,
            zIndex: 999,
            background: “var(--bg-card)”,
            border: “1px solid var(--glass-border)”,
            borderRadius: 10,
            overflow: “hidden”,
            boxShadow: “0 15px 40px rgba(0,0,0,0.18)”,
            maxHeight: 380,
            overflowY: “auto”,
          }}
        >
          {/* Resumen de búsqueda */}
          {q.length >= 2 && (byNombreCount > 0 || byPrincipioCount > 0) && (
            <div
              style={{
                padding: “0.45rem 1rem”,
                fontSize: “0.72rem”,
                color: “var(--text-muted)”,
                background: “rgba(10,230,199,0.04)”,
                borderBottom: “1px solid var(--glass-border)”,
                display: “flex”,
                gap: “0.75rem”,
                flexWrap: “wrap”,
              }}
            >
              {byNombreCount > 0 && (
                <span>
                  <span style={{ color: “var(--primary)”, fontWeight: 700 }}>{byNombreCount}</span>
                  {“ “}por nombre comercial
                </span>
              )}
              {byPrincipioCount > 0 && (
                <span>
                  <span style={{ color: “#7dd3fc”, fontWeight: 700 }}>{byPrincipioCount}</span>
                  {“ “}por principio activo
                </span>
              )}
            </div>
          )}

          {results.map((m) => {
            const byPrincipio = m.match_field === “principio_activo”;
            return (
              <div
                key={`${m.id}-${m.nombre_comercial}`}
                onClick={() => handleSelect(m)}
                style={{
                  padding: “0.85rem 1rem”,
                  cursor: “pointer”,
                  borderBottom: “1px solid var(--glass-border)”,
                  transition: “background 0.15s”,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = “rgba(10,230,199,0.07)”)}
                onMouseLeave={(e) => (e.currentTarget.style.background = “transparent”)}
              >
                <div style={{ display: “flex”, alignItems: “center”, justifyContent: “space-between”, gap: “0.5rem” }}>
                  <span style={{ fontWeight: 600, fontSize: “0.95rem” }}>
                    <Highlight text={m.nombre_comercial} q={byPrincipio ? “” : q} />
                    {m.concentracion && (
                      <span style={{ color: “var(--primary)”, marginLeft: “0.4rem”, fontWeight: 500 }}>
                        {m.concentracion}
                      </span>
                    )}
                  </span>
                  <div style={{ display: “flex”, gap: “0.3rem”, flexShrink: 0, alignItems: “center” }}>
                    {byPrincipio && (
                      <span
                        style={{
                          background: “rgba(125,211,252,0.12)”,
                          color: “#7dd3fc”,
                          border: “1px solid rgba(125,211,252,0.3)”,
                          borderRadius: 9999,
                          padding: “0.1rem 0.5rem”,
                          fontSize: “0.68rem”,
                          fontWeight: 700,
                          whiteSpace: “nowrap”,
                        }}
                      >
                        p. activo
                      </span>
                    )}
                    {!m.requiere_receta && (
                      <span
                        style={{
                          background: “rgba(74,222,128,0.15)”,
                          color: “#4ade80”,
                          border: “1px solid rgba(74,222,128,0.3)”,
                          borderRadius: 9999,
                          padding: “0.1rem 0.5rem”,
                          fontSize: “0.7rem”,
                          fontWeight: 700,
                        }}
                      >
                        OTC
                      </span>
                    )}
                    {m.alertas?.length > 0 && (
                      <span
                        style={{
                          background: “rgba(251,191,36,0.15)”,
                          color: “#fbbf24”,
                          border: “1px solid rgba(251,191,36,0.3)”,
                          borderRadius: 9999,
                          padding: “0.1rem 0.5rem”,
                          fontSize: “0.7rem”,
                          fontWeight: 700,
                        }}
                      >
                        ⚠
                      </span>
                    )}
                  </div>
                </div>

                {/* Subtítulo: principio activo resaltado si fue el motivo del match */}
                <div style={{ color: “var(--text-muted)”, fontSize: “0.78rem”, marginTop: 2 }}>
                  {m.principio_activo_str && (
                    <span style={byPrincipio ? { color: “#7dd3fc” } : {}}>
                      <Highlight text={m.principio_activo_str} q={byPrincipio ? q : “”} />
                    </span>
                  )}
                  {[m.forma, m.laboratorio]
                    .filter(Boolean)
                    .map((s) => ` · ${s}`)
                    .join(“”)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && results.length === 0 && !loading && q.length >= 2 && (
        <div
          style={{
            position: “absolute”,
            top: “calc(100% + 6px)”,
            left: 0, right: 0,
            zIndex: 999,
            background: “var(--bg-card)”,
            border: “1px solid var(--glass-border)”,
            borderRadius: 10,
            padding: “1.25rem”,
            textAlign: “center”,
            color: “var(--text-muted)”,
            fontSize: “0.9rem”,
          }}
        >
          <div>No se encontraron resultados para &quot;{q}&quot;</div>
          <button
            type=”button”
            onClick={handleAddManual}
            style={{
              marginTop: 12,
              border: “1px solid rgba(56,189,248,0.35)”,
              background: “rgba(56,189,248,0.1)”,
              color: “#7dd3fc”,
              borderRadius: 9999,
              padding: “0.65rem 1rem”,
              cursor: “pointer”,
              fontWeight: 700,
            }}
          >
            Agregar &quot;{q.trim()}&quot; manualmente
          </button>
        </div>
      )}
    </div>
  );
}
