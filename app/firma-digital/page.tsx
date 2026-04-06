"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { PenLine, Eraser, Check, AlertCircle, LogOut } from "lucide-react";
import { subirFirmaDigital } from "@/lib/api";
import { getMedico, saveSession, clearSession } from "@/lib/auth";

// ── Signature Pad (same as registro) ──────────────────────────────────────────
function SignaturePad({ onSigned }: { onSigned: (file: File | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos   = useRef({ x: 0, y: 0 });
  const [isEmpty, setIsEmpty] = useState(true);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (!w || !h) return;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, h - 32);
    ctx.lineTo(w - 16, h - 32);
    ctx.stroke();
  }, []);

  useEffect(() => {
    const t = setTimeout(initCanvas, 30);
    const canvas = canvasRef.current;
    if (!canvas) return () => clearTimeout(t);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const ctx = getCtx(); if (!ctx) return;
      const rect  = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      drawLine(ctx, lastPos.current.x, lastPos.current.y, touch.clientX - rect.left, touch.clientY - rect.top);
      lastPos.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => { clearTimeout(t); canvas.removeEventListener("touchmove", onTouchMove); };
  }, [initCanvas]);

  function getCtx() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.8; ctx.lineCap = "round"; ctx.lineJoin = "round";
    return ctx;
  }
  function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isDrawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    lastPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const ctx = getCtx(); if (!ctx) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    drawLine(ctx, lastPos.current.x, lastPos.current.y, x, y);
    lastPos.current = { x, y };
    if (isEmpty) setIsEmpty(false);
  }
  function onMouseUp() { isDrawing.current = false; exportSig(); }
  function onTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    isDrawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    const t = e.touches[0];
    lastPos.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function onTouchEnd() { isDrawing.current = false; setIsEmpty(false); exportSig(); }

  function clear() {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, canvas.offsetHeight - 32); ctx.lineTo(canvas.offsetWidth - 16, canvas.offsetHeight - 32); ctx.stroke();
    setIsEmpty(true); onSigned(null);
  }
  function exportSig() {
    canvasRef.current?.toBlob((blob) => {
      if (blob) onSigned(new File([blob], "firma.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <div>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}>
        {isEmpty && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem", pointerEvents: "none" }}>
            <PenLine size={28} color="#cbd5e1" strokeWidth={1.4} />
            <span style={{ color: "#cbd5e1", fontSize: "0.9rem", fontWeight: 500 }}>Firmá aquí con tu dedo o mouse</span>
          </div>
        )}
        <canvas ref={canvasRef}
          style={{ display: "block", width: "100%", height: 200, cursor: "crosshair", touchAction: "none", background: "#ffffff" }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.6rem" }}>
        <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
          {isEmpty ? "El lienzo está vacío" : <span style={{ color: "var(--primary)", fontWeight: 600 }}>✓ Firma capturada</span>}
        </span>
        <button type="button" onClick={clear} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "transparent", border: "1px solid var(--glass-border)", color: "var(--text-muted)", padding: "0.35rem 0.85rem", borderRadius: 9999, cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>
          <Eraser size={13} strokeWidth={2} /> Borrar
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FirmaDigitalPage() {
  const router  = useRouter();
  const [firmaFile, setFirmaFile] = useState<File | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [medico, setMedico]       = useState<{ medico_id: number; full_name: string } | null>(null);

  useEffect(() => {
    const m = getMedico();
    if (!m) { router.replace("/login"); return; }
    // Si ya tiene firma, ir directo al dashboard
    if (m.firma_url) { router.replace("/dashboard"); return; }
    setMedico(m);
  }, [router]);

  async function handleGuardar() {
    if (!firmaFile) { setError("Dibujá tu firma antes de continuar."); return; }
    const m = getMedico();
    if (!m) return;
    setLoading(true); setError("");
    try {
      const res = await subirFirmaDigital(m.medico_id, firmaFile);
      // Actualizar sesión con la nueva firma_url
      const firmaUrl: string = (res as { firma_url?: string }).firma_url ?? "";
      saveSession({ ...m, firma_url: firmaUrl });
      router.push("/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al guardar la firma");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() { clearSession(); router.push("/login"); }

  if (!medico) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="spin" style={{ width: 40, height: 40, border: "3px solid rgba(10,230,199,0.2)", borderTopColor: "var(--primary)", borderRadius: "50%" }} />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center py-10 px-4" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 560, width: "100%" }}>

        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <Image src="https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logoblanco_1_qdlnog.png" alt="DocYa" width={80} height={80} />
        </div>

        <div className="glass-card" style={{ padding: "2.5rem" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(10,230,199,0.1)", border: "1px solid rgba(10,230,199,0.2)", marginBottom: "1rem" }}>
              <PenLine size={24} color="var(--primary)" strokeWidth={1.8} />
            </div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.4rem" }}>Registrá tu firma digital</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Hola, <strong style={{ color: "var(--text-main)" }}>{medico.full_name}</strong>.<br />
              Tu firma aparecerá en todas las recetas y certificados que emitas.
            </p>
          </div>

          {/* Info */}
          <div style={{ background: "rgba(10,230,199,0.05)", border: "1px solid rgba(10,230,199,0.15)", borderRadius: 10, padding: "0.9rem 1.1rem", display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <PenLine size={17} color="var(--primary)" strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              Dibujá con tu dedo (celular) o mouse (PC). Podés borrar y repetir las veces que quieras. Una vez guardada, podés actualizarla desde tu perfil.
            </p>
          </div>

          {/* Pad */}
          <SignaturePad onSigned={setFirmaFile} />

          {/* Error */}
          {error && (
            <div style={{ marginTop: "1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "0.8rem 1rem", color: "#f87171", fontSize: "0.87rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertCircle size={15} strokeWidth={2} /> {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.75rem" }}>
            <button onClick={handleLogout} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "transparent", border: "1px solid var(--glass-border)", color: "var(--text-muted)", padding: "0.75rem 1.25rem", borderRadius: 10, cursor: "pointer", fontSize: "0.87rem", fontWeight: 600 }}>
              <LogOut size={14} strokeWidth={2} /> Cerrar sesión
            </button>
            <button onClick={handleGuardar} disabled={loading || !firmaFile}
              style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "0.85rem 1.5rem", borderRadius: 10, cursor: loading || !firmaFile ? "not-allowed" : "pointer", fontSize: "0.95rem", fontWeight: 700, opacity: !firmaFile ? 0.5 : 1, background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "#030b12", border: "none" }}>
              {loading ? (
                <><span className="spin" style={{ width: 16, height: 16, border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#030b12", borderRadius: "50%", display: "inline-block" }} /> Guardando...</>
              ) : (
                <><Check size={16} strokeWidth={2.5} /> Guardar y continuar</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
