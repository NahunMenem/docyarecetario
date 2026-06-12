"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listarFinanciadoresRcta, type FinanciadorRcta } from "@/lib/api";

interface Props {
  value: string;
  onChange: (value: string, financiador?: FinanciadorRcta) => void;
}

export default function FinanciadorSearch({ value, onChange }: Props) {
  const [financiadores, setFinanciadores] = useState<FinanciadorRcta[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  async function loadFinanciadores() {
    if (financiadores.length > 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      setFinanciadores(await listarFinanciadoresRcta());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al buscar financiadores");
    } finally {
      setLoading(false);
    }
  }

  const results = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? financiadores.filter((item) => {
          const name = item.nombreComercial.toLowerCase();
          const id = String(item.idfinanciador);
          const number = (item.nrofinanciador || "").toLowerCase();
          return name.includes(q) || id.includes(q) || number.includes(q);
        })
      : financiadores;
    return list.slice(0, 12);
  }, [financiadores, value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--input-bg)",
    border: "1px solid var(--glass-border)",
    borderRadius: 8,
    padding: "0.75rem 2.4rem 0.75rem 1rem",
    color: "var(--text-main)",
    fontSize: "0.9rem",
    fontFamily: "Outfit, sans-serif",
    outline: "none",
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        style={inputStyle}
        placeholder="OSDE, Accord Salud, Luis Pasteur..."
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          void loadFinanciadores();
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "var(--primary-dark)";
          e.target.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.15)";
          setOpen(true);
          void loadFinanciadores();
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "var(--glass-border)";
          e.target.style.boxShadow = "none";
        }}
        autoComplete="off"
      />
      {loading && (
        <div style={{ position: "absolute", right: 12, top: 12, color: "var(--text-muted)", fontSize: "0.75rem" }}>
          ...
        </div>
      )}
      {error && <div style={{ color: "#fca5a5", fontSize: "0.78rem", marginTop: 6 }}>{error}</div>}
      {open && results.length > 0 && (
        <div
          style={{
            marginTop: 6,
            width: "100%",
            background: "var(--bg-surface)",
            border: "1px solid rgba(10,230,199,0.14)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 22px 48px rgba(0,0,0,0.32)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {results.map((item) => (
            <button
              key={item.idfinanciador}
              type="button"
              onClick={() => {
                onChange(item.nombreComercial, item);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.75rem 1rem",
                border: 0,
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                background: "transparent",
                color: "var(--text-main)",
                cursor: "pointer",
                fontFamily: "Outfit, sans-serif",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(10,230,199,0.09)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <strong style={{ color: "var(--primary)", marginRight: 8 }}>{item.idfinanciador}</strong>
              <span>{item.nombreComercial}</span>
              {item.planes && item.planes.length > 0 && (
                <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: "0.78rem" }}>
                  {item.planes.length} planes
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
