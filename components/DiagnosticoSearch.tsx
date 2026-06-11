"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buscarDiagnosticosRcta, type DiagnosticoRcta } from "@/lib/api";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function DiagnosticoSearch({ value, onChange }: Props) {
  const [results, setResults] = useState<DiagnosticoRcta[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (text: string) => {
    if (text.trim().length < 3) {
      setResults([]);
      setOpen(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await buscarDiagnosticosRcta(text);
      setResults(data);
      setOpen(true);
    } catch (e) {
      setResults([]);
      setOpen(false);
      setError(e instanceof Error ? e.message : "Error al buscar diagnósticos");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    onChange(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(next), 280);
  }

  function handleSelect(item: DiagnosticoRcta) {
    onChange(`${item.coddiagnostico} - ${item.descdiagnostico}`);
    setResults([]);
    setOpen(false);
    setError("");
  }

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
        placeholder="R509, fiebre, diabetes, hipertensión..."
        value={value}
        onChange={handleChange}
        onFocus={(e) => {
          e.target.style.borderColor = "var(--primary-dark)";
          e.target.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.15)";
          if (results.length > 0) setOpen(true);
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
      {error && (
        <div style={{ color: "#fca5a5", fontSize: "0.78rem", marginTop: 6 }}>{error}</div>
      )}
      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 1000,
            background: "var(--bg-surface)",
            border: "1px solid rgba(10,230,199,0.14)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 22px 48px rgba(0,0,0,0.32)",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {results.map((item) => (
            <button
              key={`${item.iddiagnostico}-${item.coddiagnostico}`}
              type="button"
              onClick={() => handleSelect(item)}
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
              <strong style={{ color: "var(--primary)", marginRight: 8 }}>{item.coddiagnostico}</strong>
              <span>{item.descdiagnostico}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
