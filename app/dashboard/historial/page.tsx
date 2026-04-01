"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Printer, QrCode, Copy, XCircle, CheckCircle2, CalendarDays,
  ClipboardList, Plus, BanIcon,
} from "lucide-react";
import { getToken, handleSessionExpired } from "@/lib/auth";
import { listarRecetas, anularReceta, type RecetaResumen } from "@/lib/api";

export default function HistorialPage() {
  const router = useRouter();
  const [recetas, setRecetas]     = useState<RecetaResumen[]>([]);
  const [loading, setLoading]     = useState(true);
  const [anulando, setAnulando]   = useState<number | null>(null);
  const [toast, setToast]         = useState("");
  const [filtro, setFiltro]       = useState<"todas" | "valida" | "anulada">("todas");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const data = await listarRecetas(token);
      setRecetas(data.recetas);
    } catch (error: unknown) {
      if (handleSessionExpired(error, router)) return;
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAnular(r: RecetaResumen) {
    const motivo = prompt(`¿Motivo de anulación para la receta de ${r.paciente}?\n(Opcional, podés dejarlo vacío)`) ?? "";
    if (motivo === null) return; // user cancelled
    const token = getToken();
    if (!token) return;
    setAnulando(r.id);
    try {
      await anularReceta(r.id, motivo, token);
      showToast("Receta anulada");
      load();
    } catch (e: unknown) {
      if (handleSessionExpired(e, router)) return;
      alert(e instanceof Error ? e.message : "Error al anular");
    } finally {
      setAnulando(null);
    }
  }

  const base  = process.env.NEXT_PUBLIC_API_URL ?? "";
  const token = getToken() ?? "";
  const filtradas = filtro === "todas" ? recetas : recetas.filter((r) => r.estado === filtro);

  const totales = {
    todas: recetas.length,
    valida: recetas.filter((r) => r.estado === "valida").length,
    anulada: recetas.filter((r) => r.estado === "anulada").length,
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-up pb-12">

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", bottom:"2rem", right:"2rem", zIndex:300,
          background:"rgba(20,184,166,0.15)", border:"1px solid rgba(20,184,166,0.4)",
          borderRadius:10, padding:"0.85rem 1.5rem",
          color:"var(--primary)", fontWeight:600, fontSize:"0.9rem",
          backdropFilter:"blur(8px)",
        }}>✓ {toast}</div>
      )}

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"1rem" }}>
        <div>
          <h1 style={{ fontSize:"1.75rem", fontWeight:800 }}>Historial de Recetas</h1>
          <p style={{ color:"var(--text-muted)", fontSize:"0.9rem", marginTop:4 }}>
            {recetas.length} receta{recetas.length !== 1 ? "s" : ""} emitida{recetas.length !== 1 ? "s" : ""}
          </p>
        </div>
        <a href="/dashboard/nueva-receta" className="btn-primary" style={{ textDecoration:"none", display:"inline-flex", alignItems:"center", gap:"0.4rem" }}>
          <Plus size={15} strokeWidth={2.5} /> Nueva Receta
        </a>
      </div>

      {/* Filtros */}
      <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap" }}>
        {(["todas","valida","anulada"] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            style={{
              padding:"0.45rem 1.1rem", borderRadius:9999, fontSize:"0.83rem", fontWeight:600,
              cursor:"pointer", transition:"all 0.2s",
              background: filtro === f ? "linear-gradient(135deg, var(--primary), var(--secondary))" : "rgba(255,255,255,0.04)",
              color: filtro === f ? "#030b12" : "var(--text-muted)",
              border: filtro === f ? "none" : "1px solid var(--glass-border)",
              boxShadow: filtro === f ? "0 4px 12px var(--primary-glow)" : "none",
            }}>
            {f === "todas" && `Todas (${totales.todas})`}
            {f === "valida" && <><CheckCircle2 size={13} strokeWidth={2} /> Válidas ({totales.valida})</>}
            {f === "anulada" && <><XCircle size={13} strokeWidth={2} /> Anuladas ({totales.anulada})</>}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"3rem", color:"var(--text-muted)" }}>
          <div className="spin" style={{ width:36,height:36,border:"3px solid rgba(10,230,199,0.2)",borderTopColor:"var(--primary)",borderRadius:"50%",margin:"0 auto 1rem" }} />
          Cargando historial...
        </div>
      ) : filtradas.length === 0 ? (
        <div className="glass-card" style={{ textAlign:"center", padding:"3rem" }}>
          <div style={{ marginBottom:"1rem", color:"var(--text-muted)" }}><ClipboardList size={48} strokeWidth={1.2} /></div>
          <h3 style={{ fontWeight:700, marginBottom:"0.5rem" }}>
            {filtro === "todas" ? "Todavía no emitiste recetas" : `No hay recetas ${filtro === "valida" ? "válidas" : "anuladas"}`}
          </h3>
          <p style={{ color:"var(--text-muted)", fontSize:"0.9rem" }}>
            {filtro === "todas" ? "Las recetas que emitas aparecerán aquí" : "Cambiá el filtro para ver otras recetas"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtradas.map((r) => {
            const esValida = r.estado === "valida";
            return (
              <div key={r.id} className="glass-card" style={{ padding:"1.1rem 1.4rem", borderLeft:`3px solid ${esValida ? "var(--primary-dark)" : "rgba(244,63,94,0.5)"}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:"1rem", flexWrap:"wrap" }}>

                  {/* Info principal */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"0.6rem", flexWrap:"wrap", marginBottom:"0.3rem" }}>
                      <span style={{ fontWeight:700, fontSize:"1rem" }}>{r.paciente}</span>
                      <span style={{
                        padding:"0.15rem 0.65rem", borderRadius:9999, fontSize:"0.72rem", fontWeight:700,
                        background: esValida ? "rgba(20,184,166,0.12)" : "rgba(244,63,94,0.12)",
                        color: esValida ? "#14B8A6" : "#f43f5e",
                        border: `1px solid ${esValida ? "rgba(20,184,166,0.3)" : "rgba(244,63,94,0.3)"}`,
                      }}>
                        {esValida
                        ? <><CheckCircle2 size={11} strokeWidth={2} /> Válida</>
                        : <><XCircle size={11} strokeWidth={2} /> Anulada</>}
                      </span>
                    </div>
                    <div style={{ color:"var(--text-muted)", fontSize:"0.82rem", lineHeight:1.6 }}>
                      {r.documento}
                      {r.diagnostico && <span> · {r.diagnostico}</span>}
                    </div>
                    <div style={{ color:"var(--text-muted)", fontSize:"0.78rem", marginTop:2, display:"flex", alignItems:"center", gap:"0.3rem" }}>
                      <CalendarDays size={11} strokeWidth={1.8} /> {r.fecha} &nbsp;·&nbsp; ID #{r.id}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display:"flex", gap:"0.4rem", flexShrink:0, flexWrap:"wrap", alignItems:"center" }}>
                    {/* Ver HTML */}
                    <a href={`${base}/recetario/recetas/${r.id}/html?token=${token}`} target="_blank" rel="noopener noreferrer"
                      style={{ background:"rgba(10,230,199,0.08)", border:"1px solid rgba(10,230,199,0.2)", color:"var(--primary)", borderRadius:8, padding:"0.45rem 0.9rem", cursor:"pointer", fontSize:"0.82rem", fontWeight:600, textDecoration:"none", transition:"all 0.2s", display:"inline-flex", alignItems:"center", gap:"0.3rem" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background="rgba(10,230,199,0.15)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background="rgba(10,230,199,0.08)")}>
                      <Printer size={13} strokeWidth={2} /> Ver
                    </a>

                    {/* QR verificar */}
                    <a href={`${base}/recetario/verificar/${r.uuid}`} target="_blank" rel="noopener noreferrer"
                      style={{ background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.2)", color:"#60a5fa", borderRadius:8, padding:"0.45rem 0.9rem", cursor:"pointer", fontSize:"0.82rem", fontWeight:600, textDecoration:"none", transition:"all 0.2s", display:"inline-flex", alignItems:"center", gap:"0.3rem" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background="rgba(96,165,250,0.15)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background="rgba(96,165,250,0.08)")}>
                      <QrCode size={13} strokeWidth={2} /> Verificar
                    </a>

                    {/* Copiar link */}
                    <button title="Copiar link de verificación"
                      onClick={() => { navigator.clipboard.writeText(`${base}/recetario/verificar/${r.uuid}`); showToast("Link copiado"); }}
                      style={{ background:"var(--bg-card)", border:"1px solid var(--glass-border)", color:"var(--text-muted)", borderRadius:8, padding:"0.45rem 0.7rem", cursor:"pointer", fontSize:"0.82rem", fontWeight:600, transition:"all 0.2s", display:"inline-flex", alignItems:"center" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor="var(--primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor="var(--glass-border)")}>
                      <Copy size={13} strokeWidth={2} />
                    </button>

                    {/* Anular */}
                    {esValida && (
                      <button onClick={() => handleAnular(r)} disabled={anulando === r.id}
                        style={{ background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.2)", color:"#f43f5e", borderRadius:8, padding:"0.45rem 0.9rem", cursor:"pointer", fontSize:"0.82rem", fontWeight:600, transition:"all 0.2s", opacity: anulando === r.id ? 0.5 : 1, display:"inline-flex", alignItems:"center", gap:"0.3rem" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background="rgba(244,63,94,0.15)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background="rgba(244,63,94,0.08)")}>
                        {anulando === r.id ? "..." : <><BanIcon size={13} strokeWidth={2} /> Anular</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
