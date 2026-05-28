# ====================================================
# 📋 RECETARIO — Pacientes y Recetas por Médico
# ====================================================
# Endpoints:
#   POST   /recetario/pacientes               → Crear paciente
#   GET    /recetario/pacientes               → Listar mis pacientes
#   GET    /recetario/pacientes/{id}          → Ver paciente
#   PUT    /recetario/pacientes/{id}          → Editar paciente
#   DELETE /recetario/pacientes/{id}          → Eliminar paciente
#
#   POST   /recetario/recetas                 → Emitir receta
#   GET    /recetario/recetas                 → Mis recetas (historial)
#   GET    /recetario/recetas/{id}            → Ver receta (JSON)
#   GET    /recetario/recetas/{id}/html       → Ver receta (HTML imprimible)
#   PATCH  /recetario/recetas/{id}/anular     → Anular receta
#
#   GET    /recetario/verificar/{uuid}        → Verificar autenticidad pública
# ====================================================

import base64
import json
import logging
import os
import random
import re
import time
import urllib.request
import urllib.error
import jwt
import psycopg2
from datetime import datetime
from html import escape
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from services.farmalink import create_farmalink_payload, send_prescription_to_farmalink

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET   = os.getenv("JWT_SECRET", "change_me")
API_BASE_URL = os.getenv("API_BASE_URL", "https://docya-railway-production.up.railway.app")
LOGGER = logging.getLogger("docya.recetario")

router = APIRouter(prefix="/recetario", tags=["Recetario"])


# ====================================================
# 🧩 DB
# ====================================================
def get_db():
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    try:
        yield conn
    finally:
        conn.close()


# ====================================================
# 🔐 AUTH — extrae medico_id del JWT Bearer
# ====================================================
def get_medico_id(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),          # permite ?token= en la URL
) -> int:
    # Prioridad: header Authorization > query param ?token=
    raw = None
    if authorization and authorization.startswith("Bearer "):
        raw = authorization.split(" ", 1)[1]
    elif token:
        raw = token

    if not raw:
        raise HTTPException(status_code=401, detail="Token no proporcionado")
    try:
        payload = jwt.decode(raw, JWT_SECRET, algorithms=["HS256"])
        return int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")


# ====================================================
# 📦 MODELOS Pydantic
# ====================================================
TIPOS_DOC = ["DNI", "CI", "Pasaporte", "LC", "LE"]
SEXOS     = ["M", "F", "X"]

class PacienteIn(BaseModel):
    nombre:          str
    apellido:        str
    tipo_documento:  str = "DNI"
    nro_documento:   str
    sexo:            str
    fecha_nacimiento: Optional[str] = None   # "YYYY-MM-DD"
    telefono:        Optional[str] = None
    email:           Optional[str] = None
    obra_social:     Optional[str] = None
    plan:            Optional[str] = None
    nro_credencial:  Optional[str] = None
    cuil:            Optional[str] = None
    observaciones:   Optional[str] = None

class MedicamentoItem(BaseModel):
    nombre:         str                       # nombre_comercial o principio activo
    concentracion:  Optional[str] = None
    presentacion:   Optional[str] = None      # "Envase x 30 comprimidos"
    cantidad:       int = 1
    indicaciones:   str                       # "Tomar 1 cada 8hs por 7 días"

class RecetaIn(BaseModel):
    paciente_id:    int
    obra_social:    Optional[str] = None
    plan:           Optional[str] = None
    nro_credencial: Optional[str] = None
    diagnostico:    Optional[str] = None
    medicamentos:   List[MedicamentoItem]

class AnularIn(BaseModel):
    motivo: Optional[str] = None


CERTIFICADO_TIPOS = {
    "ausentismo_laboral": "Ausentismo laboral",
    "ausentismo_escolar": "Ausentismo escolar",
    "constancia_asistencia": "Constancia de asistencia",
    "reposo_domiciliario": "Reposo domiciliario",
}


def _ensure_recetario_certificados_schema(db) -> None:
    cur = db.cursor()
    cur.execute("""
        ALTER TABLE recetario_certificados
        ADD COLUMN IF NOT EXISTS tipo_certificado VARCHAR(40)
    """)
    cur.execute("""
        ALTER TABLE recetario_certificados
        ADD COLUMN IF NOT EXISTS campos_json JSONB
    """)
    cur.execute("""
        UPDATE recetario_certificados
        SET tipo_certificado = COALESCE(tipo_certificado, 'reposo_domiciliario'),
            campos_json = COALESCE(campos_json, '{}'::jsonb)
        WHERE tipo_certificado IS NULL OR campos_json IS NULL
    """)
    db.commit()


def _certificado_tipo_label(tipo: Optional[str]) -> str:
    return CERTIFICADO_TIPOS.get(tipo or "", "Certificado médico")


def _certificado_campos(campos_raw) -> Dict[str, Any]:
    if isinstance(campos_raw, dict):
        return campos_raw
    if not campos_raw:
        return {}
    if isinstance(campos_raw, str):
        try:
            value = json.loads(campos_raw)
            return value if isinstance(value, dict) else {}
        except Exception:
            return {}
    return {}


def _fmt_fecha(value) -> str:
    if not value:
        return "—"
    if hasattr(value, "strftime"):
        return value.strftime("%d/%m/%Y")
    return str(value)


def _fmt_datetime(value) -> str:
    if not value:
        return "—"
    if hasattr(value, "strftime"):
        return value.strftime("%d/%m/%Y %H:%M")
    return str(value)


def _edad_paciente(fecha_nacimiento) -> Optional[int]:
    if not fecha_nacimiento:
        return None
    today = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
    years = today.year - fecha_nacimiento.year
    if (today.month, today.day) < (fecha_nacimiento.month, fecha_nacimiento.day):
        years -= 1
    return years


def _valor_campo(campos: Dict[str, Any], key: str, default: str = "—") -> str:
    value = campos.get(key)
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _render_certificado_body(
    *,
    tipo_certificado: str,
    campos: Dict[str, Any],
    paciente_nombre: str,
    paciente_documento: str,
    edad: Optional[int],
    sexo_label: str,
    diagnostico: Optional[str],
    reposo_dias: Optional[int],
    fecha_emision: str,
) -> str:
    paciente = escape(paciente_nombre)
    documento = escape(paciente_documento)
    edad_txt = str(edad) if edad is not None else "—"
    sexo_txt = escape(sexo_label or "—")
    diagnostico_html = escape(diagnostico or "Sin diagnóstico especificado")

    if tipo_certificado == "ausentismo_laboral":
        return f"""
  <div class="doc-body">
    <div class="doc-title-row">
      <span class="doc-title-line"></span>
      <div class="doc-title-text">CERTIFICADO MÉDICO — AUSENTISMO LABORAL</div>
      <span class="doc-title-line"></span>
    </div>
    <p class="doc-copy"><strong>CERTIFICO</strong> que el/la Sr./Sra. <span class="doc-fill">{paciente}</span>, de <span class="doc-fill doc-fill-short">{edad_txt}</span> años de edad, sexo <span class="doc-fill doc-fill-short">{sexo_txt}</span>, DNI Nro. <span class="doc-fill">{documento}</span>.</p>
    <div class="doc-section-title">DIAGNÓSTICO</div>
    <div class="doc-label">DIAGNÓSTICO / DESCRIPCIÓN SINDRÓMICA (CIE-10)</div>
    <div class="doc-box">{diagnostico_html}</div>
    <div class="doc-section-title">INDICACIÓN MÉDICA</div>
    <p class="doc-copy">Por lo expuesto, se indica <span class="doc-fill doc-fill-short">{escape(_valor_campo(campos, 'dias_indicados', str(reposo_dias or '—')))}</span> días de <span class="doc-fill">{escape(_valor_campo(campos, 'tipo_indicacion', 'Ausencia laboral justificada'))}</span>, con fecha de inicio el <span class="doc-fill">{escape(_valor_campo(campos, 'fecha_inicio'))}</span> y alta estimada el <span class="doc-fill">{escape(_valor_campo(campos, 'fecha_fin'))}</span>.</p>
    <p class="doc-copy">El presente certificado se extiende a solicitud del/la interesado/a para ser presentado ante <span class="doc-fill">{escape(_valor_campo(campos, 'presentar_ante'))}</span>.</p>
  </div>"""

    if tipo_certificado == "ausentismo_escolar":
        return f"""
  <div class="doc-body">
    <div class="doc-title-row">
      <span class="doc-title-line"></span>
      <div class="doc-title-text">CERTIFICADO MÉDICO — AUSENTISMO ESCOLAR</div>
      <span class="doc-title-line"></span>
    </div>
    <p class="doc-copy"><strong>CERTIFICO</strong> que el/la menor <span class="doc-fill">{paciente}</span>, de <span class="doc-fill doc-fill-short">{edad_txt}</span> años, DNI Nro. <span class="doc-fill">{documento}</span>, hijo/a de <span class="doc-fill">{escape(_valor_campo(campos, 'responsable'))}</span>.</p>
    <div class="doc-section-title">DIAGNÓSTICO</div>
    <div class="doc-label">DIAGNÓSTICO / SÍNTOMAS PRESENTADOS</div>
    <div class="doc-box">{diagnostico_html}</div>
    <div class="doc-section-title">PERÍODO DE INASISTENCIA</div>
    <p class="doc-copy">Motivo por el cual estuvo imposibilitado/a de concurrir al establecimiento educativo desde el día <span class="doc-fill">{escape(_valor_campo(campos, 'fecha_desde'))}</span> hasta el día <span class="doc-fill">{escape(_valor_campo(campos, 'fecha_hasta'))}</span> inclusive (<span class="doc-fill doc-fill-short">{escape(_valor_campo(campos, 'dias_habiles'))}</span> días hábiles).</p>
    <p class="doc-copy">Establecimiento educativo: <span class="doc-fill">{escape(_valor_campo(campos, 'institucion'))}</span>.</p>
  </div>"""

    if tipo_certificado == "constancia_asistencia":
        return f"""
  <div class="doc-body">
    <div class="doc-title-row">
      <span class="doc-title-line"></span>
      <div class="doc-title-text">CONSTANCIA DE ASISTENCIA MÉDICA</div>
      <span class="doc-title-line"></span>
    </div>
    <p class="doc-copy"><strong>HAGO CONSTAR</strong> que el/la Sr./Sra. <span class="doc-fill">{paciente}</span>, de <span class="doc-fill doc-fill-short">{edad_txt}</span> años, DNI Nro. <span class="doc-fill">{documento}</span>, concurrió a consulta médica el día <span class="doc-fill">{escape(_valor_campo(campos, 'fecha_asistencia', fecha_emision.split(' ')[0]))}</span> a las <span class="doc-fill doc-fill-short">{escape(_valor_campo(campos, 'hora_asistencia'))}</span> horas, con una duración aproximada de <span class="doc-fill doc-fill-short">{escape(_valor_campo(campos, 'duracion_minutos'))}</span> minutos.</p>
    <p class="doc-copy">Motivo de la consulta: <span class="doc-fill">{escape(_valor_campo(campos, 'motivo_consulta', diagnostico or 'Consulta médica general'))}</span>.</p>
    <p class="doc-copy">El presente se extiende a pedido del/la interesado/a, sin que ello implique revelar el diagnóstico, en cumplimiento del secreto médico profesional.</p>
  </div>"""

    return f"""
  <div class="doc-body">
    <div class="doc-title-row">
      <span class="doc-title-line"></span>
      <div class="doc-title-text">PRESCRIPCIÓN DE REPOSO DOMICILIARIO</div>
      <span class="doc-title-line"></span>
    </div>
    <p class="doc-copy"><strong>CERTIFICO Y PRESCRIBO</strong> que el/la Sr./Sra. <span class="doc-fill">{paciente}</span>, de <span class="doc-fill doc-fill-short">{edad_txt}</span> años, DNI Nro. <span class="doc-fill">{documento}</span>, requiere reposo.</p>
    <div class="doc-section-title">DIAGNÓSTICO</div>
    <div class="doc-label">DIAGNÓSTICO / DESCRIPCIÓN SINDRÓMICA (CIE-10)</div>
    <div class="doc-box">{diagnostico_html}</div>
    <div class="doc-section-title">INDICACIÓN</div>
    <p class="doc-copy">Reposo domiciliario <span class="doc-fill doc-fill-short">{escape(_valor_campo(campos, 'tipo_reposo', 'relativo'))}</span> por <span class="doc-fill doc-fill-short">{escape(_valor_campo(campos, 'dias_indicados', str(reposo_dias or '—')))}</span> días, desde el <span class="doc-fill">{escape(_valor_campo(campos, 'fecha_inicio'))}</span> hasta el <span class="doc-fill">{escape(_valor_campo(campos, 'fecha_fin'))}</span>.</p>
    <div class="doc-label">INDICACIONES ADICIONALES</div>
    <div class="doc-box">{escape(_valor_campo(campos, 'indicaciones_adicionales', 'Sin indicaciones adicionales'))}</div>
  </div>"""


def _detalle_medicamento(forma: str, concentracion: str, presentacion: str) -> str:
    forma_concentracion = " ".join(part for part in [forma, concentracion] if part).strip()
    if not presentacion:
        return forma_concentracion
    if not forma_concentracion:
        return presentacion

    presentacion_norm = " ".join(presentacion.lower().split())
    forma_norm = " ".join(forma_concentracion.lower().split())

    if presentacion_norm == forma_norm:
        return presentacion
    if presentacion_norm.startswith(forma_norm):
        return presentacion
    if forma_norm.startswith(presentacion_norm):
        return forma_concentracion

    return f"{forma_concentracion} — {presentacion}"


def _ensure_recetario_recetas_schema(db) -> None:
    cur = db.cursor()
    cur.execute("""
        ALTER TABLE recetario_recetas
        ADD COLUMN IF NOT EXISTS cuir VARCHAR(50)
    """)
    cur.execute("""
        ALTER TABLE recetario_recetas
        ADD COLUMN IF NOT EXISTS sent_to_farmalink BOOLEAN NOT NULL DEFAULT FALSE
    """)
    cur.execute("""
        ALTER TABLE recetario_recetas
        ADD COLUMN IF NOT EXISTS farmalink_response JSONB
    """)
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_recetario_recetas_cuir
        ON recetario_recetas (cuir)
        WHERE cuir IS NOT NULL
    """)
    db.commit()


def _normalize_digits(value: Optional[str]) -> str:
    return re.sub(r"\D", "", value or "")


def _sexo_label(sexo: Optional[str]) -> str:
    return {"M": "Masculino", "F": "Femenino", "X": "X / No binario"}.get((sexo or "").upper(), sexo or "—")


def _build_patient_cuil(nro_documento: Optional[str], sexo: Optional[str]) -> Optional[str]:
    dni = _normalize_digits(nro_documento)
    if len(dni) < 7:
        return None
    dni = dni.zfill(8)
    prefix = {"M": "20", "F": "27"}.get((sexo or "").upper(), "23")
    base = f"{prefix}{dni}"
    multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    total = sum(int(digit) * factor for digit, factor in zip(base, multipliers))
    remainder = 11 - (total % 11)
    if remainder == 11:
        check_digit = "0"
    elif remainder == 10:
        if prefix == "20":
            base = f"23{dni}"
            check_digit = "9"
        elif prefix == "27":
            base = f"23{dni}"
            check_digit = "4"
        else:
            check_digit = "3"
    else:
        check_digit = str(remainder)
    return f"{base}{check_digit}"


def _generate_prescription_group_id() -> str:
    timestamp = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).strftime("%Y%m%d%H%M%S%f")
    random_suffix = f"{random.SystemRandom().randint(0, 99999):05d}"
    return f"{timestamp}{random_suffix}"[:25]


def _build_cuir(group_id: str, item_number: str = "01") -> str:
    return f"02590000020101{group_id}{item_number}"


def _generate_unique_cuir(db) -> str:
    cur = db.cursor()
    for _ in range(25):
        cuir = _build_cuir(_generate_prescription_group_id())
        cur.execute("SELECT 1 FROM recetario_recetas WHERE cuir=%s LIMIT 1", (cuir,))
        if not cur.fetchone():
            return cuir
        time.sleep(0.005)
    raise HTTPException(500, "No se pudo generar un CUIR único")


_CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212",
    "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221",
    "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221",
    "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
    "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131",
    "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131",
    "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111",
    "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
    "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242",
    "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311",
    "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]


def _code128_svg(value: str) -> str:
    if not value:
        return ""

    start_code_b = 104
    stop_code = 106
    values = [start_code_b] + [ord(char) - 32 for char in value]
    checksum = start_code_b
    for idx, code in enumerate(values[1:], 1):
        checksum += code * idx
    values.extend([checksum % 103, stop_code])

    bar_width = 2
    quiet_zone = 12
    height = 52
    x = quiet_zone
    rects: List[str] = []

    for code in values:
        pattern = _CODE128_PATTERNS[code]
        for pos, width_char in enumerate(pattern):
            width = int(width_char) * bar_width
            if pos % 2 == 0:
                rects.append(f'<rect x="{x}" y="0" width="{width}" height="{height}" fill="#111827" />')
            x += width

    total_width = x + quiet_zone
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="{height + 24}" '
        f'viewBox="0 0 {total_width} {height + 24}" role="img" aria-label="Barcode {escape(value)}">'
        f'<rect width="{total_width}" height="{height + 24}" fill="white" />'
        f'{"".join(rects)}'
        f'<text x="{total_width / 2}" y="{height + 18}" text-anchor="middle" '
        f'font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#111827">{escape(value)}</text>'
        f'</svg>'
    )


def _barcode_data_uri(value: str) -> str:
    svg = _code128_svg(value)
    if not svg:
        return ""
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def _medication_display_fields(raw: Dict[str, Any]) -> Dict[str, Any]:
    ifa = (raw.get("ifa") or raw.get("principio_activo_str") or raw.get("nombre") or "").strip()
    commercial_name = (raw.get("nombre_comercial") or "").strip()
    pharmaceutical_form = (raw.get("forma_farmaceutica") or raw.get("forma") or "").strip()
    presentation = (raw.get("presentacion") or "").strip()
    return {
        "ifa": ifa,
        "commercial_name": commercial_name if commercial_name and commercial_name.lower() != ifa.lower() else "",
        "presentation": presentation,
        "pharmaceutical_form": pharmaceutical_form,
        "quantity": raw.get("cantidad", 1),
        "instructions": (raw.get("indicaciones") or "").strip(),
        "detail": _detalle_medicamento(pharmaceutical_form, (raw.get("concentracion") or "").strip(), presentation),
    }


def _prepare_farmalink_record(*, row: tuple) -> Dict[str, Any]:
    (
        receta_id, cuir, diagnostico, medicamentos, creado_en,
        pac_nombre, pac_apellido, pac_dni, pac_sexo, pac_cuil,
        med_nombre, matricula, especialidad, tipo_med, direccion_medico
    ) = row

    return {
        "id": receta_id,
        "cuir": cuir,
        "diagnosis": diagnostico,
        "issued_at": creado_en.isoformat() if creado_en else None,
        "patient": {
            "full_name": f"{pac_apellido}, {pac_nombre}",
            "dni": pac_dni,
            "sexo": pac_sexo,
            "cuil": pac_cuil or _build_patient_cuil(pac_dni, pac_sexo),
        },
        "doctor": {
            "full_name": med_nombre,
            "specialty": especialidad or tipo_med,
            "license_number": matricula,
            "care_address": direccion_medico,
        },
        "medications": [_medication_display_fields(m) for m in (medicamentos or [])],
    }


def _send_prescription_to_farmalink_task(receta_id: int) -> None:
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT r.id, r.cuir, r.diagnostico, r.medicamentos, r.creado_en,
                   p.nombre, p.apellido, p.nro_documento, p.sexo, p.cuil,
                   m.full_name, m.matricula, m.especialidad, m.tipo, m.direccion
            FROM recetario_recetas r
            JOIN recetario_pacientes p ON p.id = r.paciente_id
            JOIN medicos m ON m.id = r.medico_id
            WHERE r.id=%s
        """, (receta_id,))
        row = cur.fetchone()
        if not row:
            LOGGER.warning("No se encontró receta %s para envío Farmalink", receta_id)
            return

        payload = create_farmalink_payload(_prepare_farmalink_record(row=row))
        response = send_prescription_to_farmalink(payload)
        cur.execute("""
            UPDATE recetario_recetas
            SET sent_to_farmalink=%s,
                farmalink_response=%s::jsonb,
                updated_at=NOW()
            WHERE id=%s
        """, (bool(response.get("ok")), json.dumps(response, ensure_ascii=False), receta_id))
        conn.commit()
    except Exception:
        LOGGER.exception("Error enviando receta %s a Farmalink", receta_id)
        conn.rollback()
    finally:
        conn.close()


# ====================================================
# 🔔 NOTIFICACIÓN PUSH — certificado a paciente
# ====================================================
_CERT_TIPO_LABEL: dict[str, str] = {
    "ausentismo_laboral":    "ausentismo laboral",
    "ausentismo_escolar":    "ausentismo escolar",
    "constancia_asistencia": "constancia de asistencia",
    "reposo_domiciliario":   "reposo domiciliario",
}

def _notificar_paciente_certificado_task(paciente_id: int, cert_id: int, tipo_certificado: str) -> None:
    """Background task: busca el FCM token del paciente y avisa al backend principal para que envíe el push."""
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cur = conn.cursor()
        cur.execute("""
            SELECT p.paciente_uuid, p.email, p.nro_documento, m.full_name
            FROM recetario_pacientes p
            JOIN medicos m ON m.id = p.medico_id
            WHERE p.id = %s
        """, (paciente_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return
        paciente_uuid, email, nro_documento, medico_nombre = row

        tipo_label = _CERT_TIPO_LABEL.get(tipo_certificado, tipo_certificado.replace("_", " "))
        body = json.dumps({
            "paciente_uuid":   str(paciente_uuid) if paciente_uuid else None,
            "email":           email,
            "nro_documento":   nro_documento,
            "cert_id":         cert_id,
            "tipo_certificado": tipo_certificado,
            "tipo_label":      tipo_label,
            "medico_nombre":   medico_nombre or "Tu médico",
        }, ensure_ascii=False).encode("utf-8")

        req = urllib.request.Request(
            f"{API_BASE_URL}/interno/certificado-push",
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Internal-Token": JWT_SECRET,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception:
        LOGGER.exception("Error enviando notificación push de certificado %s", cert_id)


# ====================================================
# 👤 PACIENTES
# ====================================================

@router.post("/pacientes", status_code=201)
def crear_paciente(
    data: PacienteIn,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    """Registra un nuevo paciente vinculado al médico autenticado."""
    if data.tipo_documento not in TIPOS_DOC:
        raise HTTPException(400, f"tipo_documento inválido. Opciones: {TIPOS_DOC}")
    if data.sexo not in SEXOS:
        raise HTTPException(400, f"sexo inválido. Opciones: {SEXOS}")

    cur = db.cursor()

    # Verificar duplicado por médico + tipo + nro
    cur.execute("""
        SELECT id FROM recetario_pacientes
        WHERE medico_id=%s AND tipo_documento=%s AND nro_documento=%s
    """, (medico_id, data.tipo_documento, data.nro_documento.strip()))
    if cur.fetchone():
        raise HTTPException(409, "Ya existe un paciente con ese documento en tu listado")

    cur.execute("""
        INSERT INTO recetario_pacientes
            (medico_id, nombre, apellido, tipo_documento, nro_documento,
             sexo, fecha_nacimiento, telefono, email,
             obra_social, plan, nro_credencial, cuil, observaciones)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id, creado_en
    """, (
        medico_id,
        data.nombre.strip().title(),
        data.apellido.strip().title(),
        data.tipo_documento,
        data.nro_documento.strip(),
        data.sexo,
        data.fecha_nacimiento or None,
        data.telefono,
        data.email.lower().strip() if data.email else None,
        data.obra_social,
        data.plan,
        data.nro_credencial,
        data.cuil,
        data.observaciones
    ))
    row = cur.fetchone()
    db.commit()
    return {"ok": True, "paciente_id": row[0], "creado_en": str(row[1])}


@router.get("/pacientes")
def listar_pacientes(
    q: Optional[str] = None,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    """Lista todos los pacientes del médico. Filtra por nombre/documento con ?q="""
    cur = db.cursor()
    if q:
        filtro = f"%{q.strip()}%"
        cur.execute("""
            SELECT id, nombre, apellido, tipo_documento, nro_documento,
                   sexo, fecha_nacimiento, telefono, email,
                   obra_social, plan, nro_credencial, cuil, observaciones, creado_en
            FROM recetario_pacientes
            WHERE medico_id=%s
              AND (
                lower(nombre)        LIKE lower(%s)
                OR lower(apellido)   LIKE lower(%s)
                OR nro_documento     LIKE %s
                OR lower(email)      LIKE lower(%s)
              )
            ORDER BY apellido, nombre
        """, (medico_id, filtro, filtro, filtro, filtro))
    else:
        cur.execute("""
            SELECT id, nombre, apellido, tipo_documento, nro_documento,
                   sexo, fecha_nacimiento, telefono, email,
                   obra_social, plan, nro_credencial, cuil, observaciones, creado_en
            FROM recetario_pacientes
            WHERE medico_id=%s
            ORDER BY apellido, nombre
        """, (medico_id,))

    cols = ["id","nombre","apellido","tipo_documento","nro_documento",
            "sexo","fecha_nacimiento","telefono","email",
            "obra_social","plan","nro_credencial","cuil","observaciones","creado_en"]
    pacientes = []
    for row in cur.fetchall():
        p = dict(zip(cols, row))
        if p["fecha_nacimiento"]:
            p["fecha_nacimiento"] = str(p["fecha_nacimiento"])
        p["creado_en"] = str(p["creado_en"])
        pacientes.append(p)

    return {"total": len(pacientes), "pacientes": pacientes}


@router.get("/pacientes/{paciente_id}")
def ver_paciente(
    paciente_id: int,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    cur = db.cursor()
    cur.execute("""
        SELECT id, nombre, apellido, tipo_documento, nro_documento,
               sexo, fecha_nacimiento, telefono, email,
               obra_social, plan, nro_credencial, cuil, observaciones, creado_en
        FROM recetario_pacientes
        WHERE id=%s AND medico_id=%s
    """, (paciente_id, medico_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Paciente no encontrado")

    cols = ["id","nombre","apellido","tipo_documento","nro_documento",
            "sexo","fecha_nacimiento","telefono","email",
            "obra_social","plan","nro_credencial","cuil","observaciones","creado_en"]
    p = dict(zip(cols, row))
    if p["fecha_nacimiento"]:
        p["fecha_nacimiento"] = str(p["fecha_nacimiento"])
    p["creado_en"] = str(p["creado_en"])
    return p


@router.put("/pacientes/{paciente_id}")
def editar_paciente(
    paciente_id: int,
    data: PacienteIn,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    if data.tipo_documento not in TIPOS_DOC:
        raise HTTPException(400, f"tipo_documento inválido. Opciones: {TIPOS_DOC}")
    if data.sexo not in SEXOS:
        raise HTTPException(400, f"sexo inválido. Opciones: {SEXOS}")

    cur = db.cursor()
    cur.execute("""
        UPDATE recetario_pacientes SET
            nombre=%s, apellido=%s, tipo_documento=%s, nro_documento=%s,
            sexo=%s, fecha_nacimiento=%s, telefono=%s, email=%s,
            obra_social=%s, plan=%s, nro_credencial=%s, cuil=%s,
            observaciones=%s, updated_at=NOW()
        WHERE id=%s AND medico_id=%s
        RETURNING id
    """, (
        data.nombre.strip().title(),
        data.apellido.strip().title(),
        data.tipo_documento,
        data.nro_documento.strip(),
        data.sexo,
        data.fecha_nacimiento or None,
        data.telefono,
        data.email.lower().strip() if data.email else None,
        data.obra_social,
        data.plan,
        data.nro_credencial,
        data.cuil,
        data.observaciones,
        paciente_id,
        medico_id
    ))
    if not cur.fetchone():
        db.rollback()
        raise HTTPException(404, "Paciente no encontrado o sin permiso")
    db.commit()
    return {"ok": True}


@router.delete("/pacientes/{paciente_id}", status_code=200)
def eliminar_paciente(
    paciente_id: int,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    cur = db.cursor()
    # Verificar que no tenga recetas activas
    cur.execute("""
        SELECT COUNT(*) FROM recetario_recetas
        WHERE paciente_id=%s AND estado='valida'
    """, (paciente_id,))
    if cur.fetchone()[0] > 0:
        raise HTTPException(400, "El paciente tiene recetas activas. Anulá las recetas primero.")

    cur.execute("""
        DELETE FROM recetario_pacientes WHERE id=%s AND medico_id=%s RETURNING id
    """, (paciente_id, medico_id))
    if not cur.fetchone():
        db.rollback()
        raise HTTPException(404, "Paciente no encontrado o sin permiso")
    db.commit()
    return {"ok": True}


# ====================================================
# 💊 RECETAS
# ====================================================

@router.post("/recetas", status_code=201)
def emitir_receta(
    data: RecetaIn,
    background_tasks: BackgroundTasks,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    """Emite una nueva receta. El médico selecciona uno de sus pacientes."""
    if not data.medicamentos:
        raise HTTPException(400, "Debés incluir al menos un medicamento")

    _ensure_recetario_recetas_schema(db)
    cur = db.cursor()

    # Verificar que el paciente pertenece al médico
    cur.execute("""
        SELECT id, nombre, apellido, obra_social, plan, nro_credencial
        FROM recetario_pacientes
        WHERE id=%s AND medico_id=%s
    """, (data.paciente_id, medico_id))
    pac = cur.fetchone()
    if not pac:
        raise HTTPException(404, "Paciente no encontrado en tu listado")

    import json as _json
    meds_json = _json.dumps([m.dict() for m in data.medicamentos], ensure_ascii=False)
    cuir = _generate_unique_cuir(db)
    obra_social = data.obra_social or pac[3]
    plan = data.plan or pac[4]
    nro_credencial = data.nro_credencial or pac[5]

    cur.execute("""
        INSERT INTO recetario_recetas
            (medico_id, paciente_id, obra_social, plan, nro_credencial,
             diagnostico, medicamentos, cuir, sent_to_farmalink)
        VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,FALSE)
        RETURNING id, uuid, creado_en, cuir
    """, (
        medico_id,
        data.paciente_id,
        obra_social,
        plan,
        nro_credencial,
        data.diagnostico,
        meds_json,
        cuir,
    ))
    row = cur.fetchone()
    db.commit()

    base = os.getenv("API_BASE_URL", "https://docya-railway-production.up.railway.app")
    background_tasks.add_task(_send_prescription_to_farmalink_task, row[0])
    return {
        "ok": True,
        "receta_id": row[0],
        "id": row[0],
        "uuid": str(row[1]),
        "cuir": row[3],
        "creado_en": str(row[2]),
        "url_html": f"{base}/recetario/recetas/{row[0]}/html",
        "url_verificar": f"{base}/recetario/verificar/{row[1]}",
        "pdf_url": f"{base}/recetario/recetas/{row[0]}/html",
        "status": "generated",
    }


@router.get("/recetas")
def listar_recetas(
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    """Historial de recetas del médico."""
    _ensure_recetario_recetas_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT r.id, r.uuid, r.cuir, r.estado, r.diagnostico, r.creado_en,
               r.sent_to_farmalink,
               p.nombre, p.apellido, p.nro_documento, p.tipo_documento
        FROM recetario_recetas r
        JOIN recetario_pacientes p ON p.id = r.paciente_id
        WHERE r.medico_id=%s
        ORDER BY r.creado_en DESC
    """, (medico_id,))

    recetas = []
    for row in cur.fetchall():
        recetas.append({
            "id": row[0], "uuid": str(row[1]), "cuir": row[2], "estado": row[3],
            "diagnostico": row[4],
            "fecha": row[5].strftime("%d/%m/%Y %H:%M") if row[5] else None,
            "sent_to_farmalink": bool(row[6]),
            "paciente": f"{row[8]}, {row[7]}",
            "documento": f"{row[10]} {row[9]}",
        })
    return {"total": len(recetas), "recetas": recetas}


@router.get("/recetas/{receta_id}")
def ver_receta_json(
    receta_id: int,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    _ensure_recetario_recetas_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT r.id, r.uuid, r.cuir, r.estado, r.diagnostico, r.medicamentos,
               r.obra_social, r.plan, r.nro_credencial, r.creado_en, r.motivo_anulacion,
               r.sent_to_farmalink, r.farmalink_response,
               p.nombre, p.apellido, p.tipo_documento, p.nro_documento,
               p.sexo, p.fecha_nacimiento, p.cuil
        FROM recetario_recetas r
        JOIN recetario_pacientes p ON p.id = r.paciente_id
        WHERE r.id=%s AND r.medico_id=%s
    """, (receta_id, medico_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Receta no encontrada")

    return {
        "id": row[0], "uuid": str(row[1]), "cuir": row[2], "estado": row[3],
        "diagnostico": row[4], "medicamentos": row[5],
        "obra_social": row[6], "plan": row[7], "nro_credencial": row[8],
        "fecha": row[9].strftime("%d/%m/%Y %H:%M") if row[9] else None,
        "motivo_anulacion": row[10],
        "sent_to_farmalink": bool(row[11]),
        "farmalink_response": row[12],
        "paciente": {
            "nombre": row[13], "apellido": row[14],
            "tipo_documento": row[15], "nro_documento": row[16],
            "sexo": row[17], "fecha_nacimiento": str(row[18]) if row[18] else None,
            "cuil": row[19] or _build_patient_cuil(row[16], row[17]),
        }
    }


@router.patch("/recetas/{receta_id}/anular")
def anular_receta(
    receta_id: int,
    data: AnularIn,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    cur = db.cursor()
    cur.execute("""
        UPDATE recetario_recetas
        SET estado='anulada', motivo_anulacion=%s, updated_at=NOW()
        WHERE id=%s AND medico_id=%s AND estado='valida'
        RETURNING id
    """, (data.motivo, receta_id, medico_id))
    if not cur.fetchone():
        db.rollback()
        raise HTTPException(404, "Receta no encontrada, ya anulada o sin permiso")
    db.commit()
    return {"ok": True, "receta_id": receta_id, "estado": "anulada"}


# ====================================================
# 🌐 VERIFICADOR PÚBLICO (sin auth)
# ====================================================

@router.get("/verificar/{uuid_receta}", response_class=HTMLResponse)
def verificar_receta(uuid_receta: str, db=Depends(get_db)):
    """
    Página pública de verificación de autenticidad de una receta.
    Accesible desde el QR impreso en la receta.
    """
    _ensure_recetario_recetas_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT r.uuid, r.cuir, r.estado, r.diagnostico, r.creado_en,
               p.nombre, p.apellido,
               m.full_name, m.matricula, m.especialidad, m.tipo
        FROM recetario_recetas r
        JOIN recetario_pacientes p ON p.id = r.paciente_id
        JOIN medicos             m ON m.id = r.medico_id
        WHERE r.uuid = %s
    """, (uuid_receta,))
    row = cur.fetchone()

    if not row:
        return HTMLResponse(_html_no_encontrada(uuid_receta), status_code=404)

    uuid_val, cuir, estado, diagnostico, creado_en, pac_nombre, pac_apellido, \
        med_nombre, matricula, especialidad, tipo_med = row

    fecha_str = creado_en.strftime("%d de %B de %Y") if creado_en else "—"
    es_valida  = estado == "valida"

    return HTMLResponse(_html_verificacion(
        uuid=str(uuid_val),
        cuir=cuir or "—",
        estado=estado,
        es_valida=es_valida,
        fecha=fecha_str,
        paciente=f"{pac_apellido}, {pac_nombre}",
        medico=med_nombre,
        matricula=matricula or "—",
        especialidad=especialidad or tipo_med or "—",
        diagnostico=diagnostico or "—",
    ))


# ====================================================
# 📜 CERTIFICADOS MÉDICOS
# ====================================================

class CertificadoIn(BaseModel):
    paciente_id:   int
    tipo_certificado: str
    diagnostico:   Optional[str] = None
    reposo_dias:   Optional[int] = None
    observaciones: Optional[str] = None
    campos:        Optional[Dict[str, Any]] = None

@router.post("/certificados", status_code=201)
def emitir_certificado(
    data: CertificadoIn,
    background_tasks: BackgroundTasks,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    """Emite un certificado médico y lo persiste."""
    _ensure_recetario_certificados_schema(db)
    if data.tipo_certificado not in CERTIFICADO_TIPOS:
        raise HTTPException(400, f"tipo_certificado inválido. Opciones: {list(CERTIFICADO_TIPOS.keys())}")
    cur = db.cursor()
    # Verificar que el paciente pertenece al médico
    cur.execute("""
        SELECT id FROM recetario_pacientes
        WHERE id=%s AND medico_id=%s
    """, (data.paciente_id, medico_id))
    if not cur.fetchone():
        raise HTTPException(404, "Paciente no encontrado")

    cur.execute("""
        INSERT INTO recetario_certificados
            (medico_id, paciente_id, tipo_certificado, diagnostico, reposo_dias, observaciones, campos_json)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id, creado_en
    """, (
        medico_id,
        data.paciente_id,
        data.tipo_certificado,
        data.diagnostico,
        data.reposo_dias,
        data.observaciones,
        json.dumps(data.campos or {}, ensure_ascii=False),
    ))
    row = cur.fetchone()
    db.commit()
    background_tasks.add_task(
        _notificar_paciente_certificado_task,
        data.paciente_id,
        row[0],
        data.tipo_certificado,
    )
    return {"id": row[0], "creado_en": str(row[1]),
            "url_html": f"/recetario/certificados/{row[0]}/html"}


@router.get("/certificados")
def listar_certificados(
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    """Lista todos los certificados emitidos por el médico."""
    _ensure_recetario_certificados_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT c.id, c.tipo_certificado, c.diagnostico, c.reposo_dias, c.creado_en,
               p.nombre, p.apellido, p.tipo_documento, p.nro_documento
        FROM recetario_certificados c
        JOIN recetario_pacientes p ON p.id = c.paciente_id
        WHERE c.medico_id = %s
        ORDER BY c.creado_en DESC
    """, (medico_id,))
    rows = cur.fetchall()
    return {"total": len(rows), "certificados": [
        {
            "id": r[0], "tipo_certificado": r[1], "tipo_label": _certificado_tipo_label(r[1]),
            "diagnostico": r[2], "reposo_dias": r[3],
            "fecha": r[4].strftime("%d/%m/%Y") if r[4] else None,
            "paciente": f"{r[6]}, {r[5]}",
            "documento": f"{r[7]} {r[8]}",
        } for r in rows
    ]}


@router.get("/certificados/{cert_id}/html", response_class=HTMLResponse)
def certificado_html(
    cert_id: int,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    """Devuelve el certificado en HTML listo para imprimir / guardar como PDF."""
    _ensure_recetario_certificados_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT c.id, c.tipo_certificado, c.diagnostico, c.reposo_dias, c.observaciones, c.campos_json, c.creado_en,
               p.nombre, p.apellido, p.tipo_documento, p.nro_documento,
               p.sexo, p.fecha_nacimiento, p.cuil, p.obra_social,
               m.full_name, m.matricula, m.especialidad, m.tipo, m.firma_url
        FROM recetario_certificados c
        JOIN recetario_pacientes p ON p.id = c.paciente_id
        JOIN medicos             m ON m.id = c.medico_id
        WHERE c.id = %s AND c.medico_id = %s
    """, (cert_id, medico_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Certificado no encontrado")

    (cert_id_val, tipo_certificado, diagnostico, reposo_dias, observaciones, campos_json, creado_en,
     pac_nombre, pac_apellido, tipo_doc, nro_doc,
     sexo, fecha_nac, cuil, obra_social,
     med_nombre, matricula, especialidad, tipo_med, firma_url) = row

    campos = _certificado_campos(campos_json)
    fecha_emision = _fmt_fecha(creado_en)
    fecha_emision_larga = _fmt_datetime(creado_en)
    fecha_nac_str = _fmt_fecha(fecha_nac)
    sexo_label = {"M": "Masculino", "F": "Femenino", "X": "No binario"}.get(sexo, sexo or "—")
    esp_label = (especialidad or tipo_med or "Médico/a").title()
    mat_label = matricula or "—"
    paciente_nombre = f"{pac_apellido.upper()}, {pac_nombre}"
    paciente_documento = f"{tipo_doc} {nro_doc}"
    edad = _edad_paciente(fecha_nac)

    base = os.getenv("API_BASE_URL", "https://docya-railway-production.up.railway.app")
    ver_url = f"{base}/recetario/certificados/{cert_id_val}/html"
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=110x110&data={ver_url}"
    logo_src = "https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logo_1_svfdye.png"
    titulo_cert = _certificado_tipo_label(tipo_certificado)
    firma_bloque = (f'<img src="{firma_url}" class="firma-img" alt="Firma">' if firma_url else '<div class="firma-linea"></div>')
    obs_html = f"<div class='note-box'><strong>Observaciones:</strong> {escape(observaciones)}</div>" if observaciones else ""
    body_html = _render_certificado_body(
        tipo_certificado=tipo_certificado or "reposo_domiciliario",
        campos=campos,
        paciente_nombre=paciente_nombre,
        paciente_documento=paciente_documento,
        edad=edad,
        sexo_label=sexo_label,
        diagnostico=diagnostico,
        reposo_dias=reposo_dias,
        fecha_emision=fecha_emision,
    )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(titulo_cert)} — DocYa</title>
<style>
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
 :root {{
  --teal: #14b8a6;
  --teal-dark: #0f766e;
  --ink: #0f172a;
  --muted: #64748b;
  --line: #dbe4ea;
  --soft: #f4fbfa;
  --soft-2: #eef7ff;
}}
body {{
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  color: var(--ink);
  background: #e2e8f0;
  -webkit-font-smoothing: antialiased;
}}
@media print {{
  body {{ background: #fff; }}
  .no-print {{ display: none !important; }}
  .page {{ box-shadow: none; margin: 0; border-radius: 0; }}
  @page {{ margin: 12mm; size: A4; }}
}}
.no-print {{
  position: sticky; top: 0; z-index: 20;
  background: #1e293b; padding: 9px 16px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}}
.no-print button {{
  background: var(--teal); color: #fff; border: none;
  padding: 6px 20px; border-radius: 20px;
  font-size: 12px; font-weight: 700; cursor: pointer;
}}
.no-print a {{ color: var(--teal); font-size: 12px; text-decoration: none; }}
.page {{
  background: #fff;
  max-width: 210mm;
  min-height: 297mm;
  margin: 16px auto;
  padding: 34px 40px 30px;
  box-shadow: 0 4px 28px rgba(0,0,0,0.14);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}}
.header {{
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 20px;
  align-items: start;
  border-bottom: 3px solid var(--teal);
  padding-bottom: 16px;
  margin-bottom: 22px;
}}
.logo-wrap {{
  display: flex; align-items: center; gap: 14px;
}}
.logo {{ height: 46px; }}
.brand-copy {{ display: flex; flex-direction: column; gap: 5px; }}
.eyebrow {{
  font-size: 10px; font-weight: 700; letter-spacing: .16em;
  text-transform: uppercase; color: var(--muted);
}}
.brand-copy strong {{
  font-size: 22px; color: var(--ink); letter-spacing: -.03em;
}}
.brand-copy span {{
  color: var(--muted); font-size: 12px;
}}
.header-right {{
  min-width: 180px; text-align: right; background: linear-gradient(180deg, var(--soft), #fff);
  border: 1px solid rgba(20,184,166,0.16); border-radius: 14px; padding: 14px 16px;
  font-size: 11px; color: var(--muted); line-height: 1.8;
}}
.header-right strong {{ color: var(--ink); }}
.cert-body {{
  padding: 4px 0 0;
  margin-bottom: 28px;
  flex: 1;
}}
.doc-body {{
  color: #111827;
}}
.doc-title-row {{
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  margin-bottom: 26px;
}}
.doc-title-line {{
  height: 1px;
  background: #d1d5db;
}}
.doc-title-text {{
  color: #1d4f91;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: .28em;
  text-transform: uppercase;
  white-space: nowrap;
}}
.doc-section-title {{
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  margin: 22px 0 14px;
  color: #6b7280;
  font-size: 10px;
  letter-spacing: .24em;
  text-transform: uppercase;
}}
.doc-section-title::before,
.doc-section-title::after {{
  content: "";
  height: 1px;
  background: #d1d5db;
}}
.doc-label {{
  color: #6b7280;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  margin-bottom: 8px;
}}
.doc-copy {{
  font-size: 16px;
  line-height: 1.95;
  margin-bottom: 16px;
}}
.doc-copy strong {{
  color: #1d4f91;
  letter-spacing: .08em;
}}
.doc-fill {{
  display: inline-block;
  min-width: 150px;
  border-bottom: 1px solid #bfc6cf;
  color: #a8adb3;
  font-style: italic;
  padding: 0 6px 2px;
}}
.doc-fill-short {{
  min-width: 88px;
}}
.doc-box {{
  min-height: 92px;
  border: 1px solid #cfd4db;
  padding: 12px 14px;
  color: #a8adb3;
  font-size: 14px;
  font-style: italic;
  line-height: 1.6;
  background: #fff;
}}
.note-box {{
  margin-top: 18px;
  padding: 12px 14px;
  border: 1px solid #cfd4db;
  background: #fff;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.6;
}}
.sig-row {{
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px dashed #94a3b8;
  gap: 20px;
}}
.sig-legal {{ flex: 1; font-size: 9.5px; color: var(--muted); line-height: 1.6; }}
.sig-legal a {{ color: var(--teal); }}
.sig-block {{ text-align: center; min-width: 160px; }}
.firma-img  {{ max-width: 140px; max-height: 60px; object-fit: contain; display: block; margin: 0 auto 4px; }}
.firma-linea {{ width: 140px; height: 52px; border-bottom: 1.5px solid var(--ink); margin: 0 auto 4px; }}
.firma-name  {{ font-size: 11px; font-weight: 700; }}
.firma-sub   {{ font-size: 10px; color: #555; margin-top: 1px; }}
.firma-stamp {{ font-size: 10px; font-weight: 800; color: var(--teal); margin-top: 3px; letter-spacing: 0.5px; }}
.qr-strip {{
  display: flex; align-items: center; gap: 12px;
  background: #f8fafc; border: 1px solid var(--line);
  border-radius: 14px; padding: 10px 14px; margin-top: 20px;
}}
.qr-img {{ flex-shrink: 0; border: 1px solid var(--line); border-radius: 8px; }}
.qr-info {{ flex: 1; font-size: 9px; line-height: 1.7; color: #374151; }}
.qr-badge {{
  flex-shrink: 0;
  background: linear-gradient(135deg, #0AE6C7, #0d9488);
  color: #fff; font-size: 8px; font-weight: 800;
  text-align: center; padding: 6px 10px; border-radius: 4px;
  text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.4;
}}
.footer {{
  text-align: center; font-size: 9px; color: #9ca3af;
  margin-top: 20px; padding-top: 14px;
  border-top: 1px solid #f3f4f6;
}}
@media (max-width: 600px) {{
  .page {{ padding: 20px 18px; min-height: unset; margin: 8px; }}
  .header {{ grid-template-columns: 1fr; }}
  .logo {{ height: 36px; }}
  .doc-title-row,
  .doc-section-title {{ grid-template-columns: 1fr; gap: 8px; }}
  .doc-fill {{ min-width: 110px; }}
  .doc-copy {{ font-size: 14px; }}
  .sig-row {{ flex-direction: column; align-items: center; }}
  .sig-block {{ min-width: unset; }}
}}
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">🖨 Imprimir / PDF</button>
  <span style="color:#94a3b8;font-size:11px;">Certificado #{cert_id_val}</span>
</div>

<div class="page">

  <div class="header">
    <div class="logo-wrap">
      <img src="{logo_src}" class="logo" alt="DocYa">
      <div class="brand-copy">
        <div class="eyebrow">Documentación médica digital</div>
        <strong>DocYa Certificados</strong>
        <span>Diseño institucional con firma y validación</span>
      </div>
    </div>
    <div class="header-right">
      <strong>Fecha de emisión:</strong> {fecha_emision_larga}<br>
      <strong>ID:</strong> {cert_id_val:08d}<br>
      <strong>Modelo:</strong> {escape(titulo_cert)}
    </div>
  </div>

  <div class="cert-body">
    {body_html}
    {obs_html}
  </div>

  <div class="sig-row">
    <div class="sig-legal">
      Este documento ha sido firmado digitalmente por<br>
      <strong>{escape(med_nombre)}</strong> — {escape(esp_label)} — MN {escape(mat_label)}<br>
      conforme a la <a href="#">Ley 25.506</a> de Firma Digital de la República Argentina.<br>
      Verificá su autenticidad en: <a href="{ver_url}">{ver_url}</a>
    </div>
    <div class="sig-block">
      {firma_bloque}
      <div class="firma-name">{escape(med_nombre)}</div>
      <div class="firma-sub">{escape(esp_label)}</div>
      <div class="firma-sub">MN {escape(mat_label)}</div>
      <div class="firma-stamp">FIRMA Y SELLO</div>
    </div>
  </div>

  <div class="qr-strip">
    <img src="{qr_url}" width="90" height="90" alt="QR" class="qr-img">
    <div class="qr-info">
      <strong>DocYa — Documentos Médicos Digitales</strong><br>
      {escape(med_nombre)} | {escape(esp_label)} | MN {escape(mat_label)}<br>
      Verificar autenticidad: {ver_url}
    </div>
    <div class="qr-badge">{escape(titulo_cert)}<br>digital</div>
  </div>

  <div class="footer">
    Certificado generado digitalmente mediante DocYa — Plataforma de Documentos Médicos Electrónicos.<br>
    © {datetime.now().year} DocYa — Todos los derechos reservados.
  </div>

</div>
</body>
</html>"""

    return HTMLResponse(html)


# ====================================================
# 🖨️ RECETA HTML IMPRIMIBLE
# ====================================================

@router.get("/recetas/{receta_id}/html", response_class=HTMLResponse)
def receta_html(
    receta_id: int,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db)
):
    """Devuelve la receta en HTML listo para imprimir / descargar como PDF."""
    _ensure_recetario_recetas_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT r.id, r.uuid, r.cuir, r.estado, r.diagnostico, r.medicamentos,
               r.obra_social, r.plan, r.nro_credencial, r.creado_en,
               p.nombre, p.apellido, p.tipo_documento, p.nro_documento,
               p.sexo, p.fecha_nacimiento, p.cuil,
               m.full_name, m.matricula, m.especialidad, m.tipo, m.direccion
        FROM recetario_recetas r
        JOIN recetario_pacientes p ON p.id = r.paciente_id
        JOIN medicos m ON m.id = r.medico_id
        WHERE r.id=%s AND r.medico_id=%s
    """, (receta_id, medico_id))
    regulatory_row = cur.fetchone()
    if not regulatory_row:
        raise HTTPException(404, "Receta no encontrada")

    (
        rec_id, uuid_val, cuir, estado, diagnostico, medicamentos,
        obra_social, plan, nro_credencial, creado_en,
        pac_nombre, pac_apellido, tipo_doc, nro_doc,
        sexo, fecha_nac, cuil,
        med_nombre, matricula, especialidad, tipo_med, direccion_medico
    ) = regulatory_row

    base = os.getenv("API_BASE_URL", "https://docya-railway-production.up.railway.app")
    ver_url = f"{base}/recetario/verificar/{uuid_val}"
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=120x120&data={ver_url}"
    barcode_src = _barcode_data_uri(cuir or "")
    fecha_emision = creado_en.strftime("%d/%m/%Y") if creado_en else "—"
    fecha_nacimiento = fecha_nac.strftime("%d/%m/%Y") if fecha_nac else "—"
    sexo_label = _sexo_label(sexo)
    patient_name = f"{pac_apellido}, {pac_nombre}"
    patient_cuil = cuil or _build_patient_cuil(nro_doc, sexo)
    specialty = especialidad or tipo_med or "Médico"
    insurance = obra_social or "—"
    if plan:
        insurance = f"{insurance} / {plan}" if insurance != "—" else plan
    signature_name = med_nombre if med_nombre.lower().startswith("dr.") else f"Dr. {med_nombre}"

    medication_rows = []
    for idx, raw_med in enumerate(medicamentos or [], 1):
        med = _medication_display_fields(raw_med)
        instructions_html = escape(med["instructions"]).replace("\n", "<br>") if med["instructions"] else ""
        medication_rows.append(f"""
        <div class="med-row">
          <div class="med-index">{idx}</div>
          <div class="med-content">
            <div class="med-main"><strong>IFA:</strong> {escape(med["ifa"] or "No informado")}</div>
            {"<div><strong>Nombre comercial:</strong> " + escape(med["commercial_name"]) + "</div>" if med["commercial_name"] else ""}
            <div><strong>Presentación:</strong> {escape(med["presentation"] or "—")}</div>
            <div><strong>Forma farmacéutica:</strong> {escape(med["pharmaceutical_form"] or "—")}</div>
            <div><strong>Cantidad:</strong> {escape(str(med["quantity"]))}</div>
            {"<div><strong>Indicaciones:</strong> " + instructions_html + "</div>" if instructions_html else ""}
          </div>
        </div>
        """)

    medication_html = "".join(medication_rows) or '<div class="empty">Sin medicamentos cargados.</div>'
    diagnosis_html = escape(diagnostico or "Sin diagnóstico informado").replace("\n", "<br>")
    legal_legend_1 = f"Este documento ha sido firmado electrónicamente por Dr. {escape(med_nombre)}"
    legal_legend_2 = (
        "Esta receta fue creada por un emisor inscripto y validado en el Registro de "
        "Recetarios Electrónicos del Ministerio de Salud de la Nación - "
        "RL-2026-37903200-APN-SSVEIYES#MS"
    )
    anulada_badge = "<span class='status-badge anulada'>ANULADA</span>" if estado == "anulada" else "<span class='status-badge'>VÁLIDA</span>"

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receta #{rec_id} - DocYa</title>
<style>
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: Arial, Helvetica, sans-serif; background: #eef2f7; color: #142132; }}
.toolbar {{ position: sticky; top: 0; z-index: 10; display: flex; gap: 10px; align-items: center; padding: 12px 18px; background: #0f172a; color: #e2e8f0; flex-wrap: wrap; }}
.toolbar button {{ border: none; border-radius: 999px; padding: 10px 18px; font-weight: 700; cursor: pointer; background: #14b8a6; color: white; }}
.toolbar a {{ color: #5eead4; text-decoration: none; }}
.status-badge {{ display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; background: #ccfbf1; color: #115e59; font-size: 12px; font-weight: 700; }}
.status-badge.anulada {{ background: #fee2e2; color: #b91c1c; }}
.sheet {{ width: min(920px, calc(100vw - 24px)); margin: 18px auto; background: white; border-radius: 20px; padding: 28px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); }}
.header {{ display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 22px; border-bottom: 2px solid #dbeafe; padding-bottom: 18px; }}
.brand h1 {{ margin: 0 0 6px; font-size: 30px; color: #0f766e; }}
.brand p {{ margin: 2px 0; color: #475569; }}
.meta {{ text-align: right; }}
.meta strong {{ display: block; font-size: 13px; color: #0f172a; }}
.grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }}
.card {{ border: 1px solid #dbe4f0; border-radius: 16px; padding: 18px; background: #fcfdff; }}
.card h2 {{ margin: 0 0 14px; font-size: 17px; color: #0f172a; }}
.fields {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }}
.field {{ background: #f8fafc; border-radius: 12px; padding: 10px 12px; min-height: 62px; }}
.field.full {{ grid-column: 1 / -1; }}
.field label {{ display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-bottom: 6px; }}
.field strong, .field span {{ display: block; line-height: 1.45; word-break: break-word; }}
.barcode-box {{ margin-top: 10px; padding: 12px; border: 1px dashed #94a3b8; border-radius: 14px; background: white; text-align: center; }}
.barcode-box img {{ max-width: 100%; height: auto; }}
.medications {{ display: flex; flex-direction: column; gap: 12px; }}
.med-row {{ display: grid; grid-template-columns: 36px 1fr; gap: 12px; align-items: start; padding: 14px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; }}
.med-index {{ width: 36px; height: 36px; border-radius: 999px; background: #14b8a6; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; }}
.med-content div {{ margin: 3px 0; line-height: 1.45; }}
.med-main {{ font-size: 16px; color: #0f172a; }}
.diagnosis-box {{ min-height: 110px; border-radius: 14px; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; line-height: 1.6; }}
.signature-box {{ margin-top: 14px; border-top: 1px dashed #94a3b8; padding-top: 12px; display: grid; gap: 8px; }}
.legend {{ margin-top: 22px; padding: 14px 16px; border-radius: 14px; background: #f8fafc; border: 1px solid #dbe4f0; font-size: 13px; line-height: 1.6; color: #334155; }}
.legend p {{ margin: 6px 0; }}
.footer {{ margin-top: 22px; display: flex; justify-content: space-between; gap: 18px; align-items: center; border-top: 1px solid #dbe4f0; padding-top: 16px; }}
.verify {{ font-size: 12px; color: #475569; }}
.verify code {{ color: #0f172a; font-weight: 700; }}
.empty {{ color: #64748b; font-style: italic; }}
@media print {{ body {{ background: white; }} .toolbar {{ display: none !important; }} .sheet {{ width: 100%; margin: 0; box-shadow: none; border-radius: 0; padding: 0; }} @page {{ size: A4; margin: 12mm; }} }}
@media (max-width: 720px) {{ .sheet {{ padding: 18px; border-radius: 14px; }} .header, .footer, .grid, .fields {{ grid-template-columns: 1fr; display: grid; }} .meta {{ text-align: left; }} }}
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Imprimir / PDF</button>
    <a href="{ver_url}" target="_blank" rel="noreferrer">Verificar autenticidad</a>
    {anulada_badge}
    <span>Receta #{rec_id}</span>
  </div>
  <main class="sheet">
    <section class="header">
      <div class="brand">
        <h1>Receta Electrónica DocYa</h1>
        <p>Prescripción médica conforme Ley 27.553, Decreto 63/2024 y requisitos ReNaPDiS.</p>
        <p><strong>CUIR:</strong> {escape(cuir or "—")}</p>
      </div>
      <div class="meta">
        <strong>Fecha de emisión</strong>
        <span>{fecha_emision}</span>
        <strong style="margin-top:10px">Estado</strong>
        <span>{escape(estado or "—").upper()}</span>
      </div>
    </section>
    <section class="grid">
      <article class="card">
        <h2>Bloque profesional</h2>
        <div class="fields">
          <div class="field full"><label>Profesional</label><strong>{escape(med_nombre)}</strong></div>
          <div class="field"><label>Profesión / Especialidad</label><span>{escape(specialty)}</span></div>
          <div class="field"><label>Matrícula</label><span>{escape(matricula or "—")}</span></div>
          <div class="field full"><label>Domicilio de atención</label><span>{escape(direccion_medico or "—")}</span></div>
        </div>
        <div class="barcode-box">
          <div style="margin-bottom:8px; font-weight:700;">Barcode CUIR</div>
          {"<img src='" + barcode_src + "' alt='Barcode CUIR'>" if barcode_src else "<div class='empty'>Barcode no disponible</div>"}
        </div>
      </article>
      <article class="card">
        <h2>Bloque paciente</h2>
        <div class="fields">
          <div class="field full"><label>Nombre completo</label><strong>{escape(patient_name)}</strong></div>
          <div class="field"><label>{escape(tipo_doc)}</label><span>{escape(nro_doc)}</span></div>
          <div class="field"><label>Sexo</label><span>{escape(sexo_label)}</span></div>
          <div class="field"><label>Fecha de nacimiento</label><span>{escape(fecha_nacimiento)}</span></div>
          <div class="field"><label>CUIL</label><span>{escape(patient_cuil or "—")}</span></div>
          <div class="field full"><label>Obra social / Plan</label><span>{escape(insurance)}</span></div>
        </div>
      </article>
    </section>
    <section class="card" style="margin-top:18px;">
      <h2>Bloque medicamento</h2>
      <div class="medications">{medication_html}</div>
    </section>
    <section class="card" style="margin-top:18px;">
      <h2>Bloque diagnóstico</h2>
      <div class="diagnosis-box">{diagnosis_html}</div>
      <div class="signature-box">
        <div><strong>Fecha:</strong> {escape(fecha_emision)}</div>
        <div><strong>Firma del médico:</strong> {escape(signature_name)}</div>
      </div>
    </section>
    <section class="legend">
      <p>{legal_legend_1}</p>
      <p>{legal_legend_2}</p>
    </section>
    <section class="footer">
      <div class="verify">
        <div><strong>Verificación pública:</strong> <a href="{ver_url}">{ver_url}</a></div>
        <div><strong>UUID:</strong> <code>{escape(str(uuid_val))}</code></div>
        <div><strong>N° credencial:</strong> {escape(nro_credencial or "—")}</div>
      </div>
      <img src="{qr_url}" alt="QR de verificación" width="120" height="120">
    </section>
  </main>
</body>
</html>"""

    return HTMLResponse(html)

    (rec_id, uuid_val, estado, diagnostico, medicamentos,
     obra_social, plan, nro_credencial, creado_en,
     pac_nombre, pac_apellido, tipo_doc, nro_doc,
     sexo, fecha_nac, cuil,
     med_nombre, matricula, especialidad, tipo_med, firma_url, direccion_medico) = row

    fecha_emision  = creado_en.strftime("%d/%m/%Y") if creado_en else "—"
    fecha_nac_str  = fecha_nac.strftime("%d/%m/%Y") if fecha_nac else "—"
    sexo_label     = {"M": "Masculino", "F": "Femenino", "X": "No binario"}.get(sexo, sexo)

    # ── Medicamentos ─────────────────────────────────────────────────────────
    meds_rp_html  = ""
    meds_com_html = ""
    for i, m in enumerate(medicamentos or [], 1):
        nombre        = (m.get("ifa") or m.get("principio_activo_str") or m.get("nombre") or "").upper()
        concentracion = (m.get("concentracion") or "").upper()
        presentacion  = (m.get("presentacion") or "").upper()
        nombre_comercial = (m.get("nombre_comercial") or "").upper()
        forma         = (m.get("forma_farmaceutica") or m.get("forma") or "").upper()
        cantidad      = m.get("cantidad", 1)
        indicaciones  = m.get("indicaciones", "")
        cantidad_txt  = {1:"uno",2:"dos",3:"tres",4:"cuatro",5:"cinco"}.get(int(cantidad), str(cantidad))
        indicaciones_html = indicaciones if indicaciones else '<em style="color:#aaa">Sin indicaciones</em>'
        detalle = _detalle_medicamento(forma, concentracion, presentacion)
        marca_html = (
            f'<span class="med-brand">Marca sugerida: {nombre_comercial}</span><br>'
            if nombre_comercial and nombre_comercial != nombre else ""
        )
        detalle_html = (
            f'<span class="med-det">{detalle}</span><br>'
            if detalle else ""
        )
        meds_rp_html += (
            f'<div class="med-rp">'
            f'<span class="med-num">{i})</span>&nbsp;'
            f'<strong>{nombre}</strong><br>'
            f'{marca_html}'
            f'{detalle_html}'
            f'<span class="med-cant">Cant: {cantidad} ({cantidad_txt})</span>'
            f'</div>'
        )
        meds_com_html += (
            f'<div class="med-com">'
            f'<span class="med-num">{i})</span>&nbsp;'
            f"{indicaciones_html}"
            f'</div>'
        )

    diag_html = (f'<div class="diag-row"><strong>Diagnóstico:</strong> {diagnostico}</div>'
                 if diagnostico else "")

    # ── Firma ────────────────────────────────────────────────────────────────
    firma_bloque = (f'<img src="{firma_url}" alt="Firma" class="firma-img">'
                    if firma_url else '<div class="firma-linea"></div>')

    # ── URLs / recursos ──────────────────────────────────────────────────────
    base    = os.getenv("API_BASE_URL", "https://docya-railway-production.up.railway.app")
    ver_url = f"{base}/recetario/verificar/{uuid_val}"
    qr_url  = f"https://api.qrserver.com/v1/create-qr-code/?size=96x96&data={ver_url}"
    bc_doc  = f"https://bwipjs-api.metafloor.com/?bcid=code128&text={nro_doc}&scale=2&height=10&includetext=false"
    bc_cred = (f"https://bwipjs-api.metafloor.com/?bcid=code128&text={nro_credencial}&scale=2&height=10&includetext=false"
               if nro_credencial else "")

    logo_src  = "https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logo_1_svfdye.png"
    esp_label = "MÉDICO"
    mat_label = matricula or "—"
    direccion_label = direccion_medico or "—"
    anulada_pill = "<span class='anulada-pill'>⚠ ANULADA</span>" if estado == "anulada" else ""

    # ── Bloques HTML reutilizables ────────────────────────────────────────────
    cred_bc_html = f'<img class="barcode" src="{bc_cred}" alt="Cred">' if bc_cred else ""

    def _top(badge):
        return f"""
      <div class="top-strip">
        <div class="top-barcodes">
          <img class="barcode" src="{bc_doc}" alt="{nro_doc}">
          {cred_bc_html}
        </div>
        <div class="top-center">
          <img src="{logo_src}" class="logo" alt="DocYa">
          <span class="copy-badge">{badge}</span>
        </div>
        <div class="top-info">
          <strong>{med_nombre}</strong><br>
          {esp_label}<br>
          MN {mat_label}<br>
          <span class="top-address">{direccion_label}</span><br>
          <span class="fecha-teal">{fecha_emision}</span>
        </div>
      </div>"""

    pac_grid = f"""
      <div class="pac-grid">
        <div class="pf pf-name"><label>Paciente</label><strong>{pac_apellido.upper()}, {pac_nombre}</strong></div>
        <div class="pf"><label>Sexo</label><strong>{sexo_label}</strong></div>
        <div class="pf"><label>{tipo_doc}</label><strong>{nro_doc}</strong></div>
        <div class="pf"><label>F. Nacimiento</label><strong>{fecha_nac_str}</strong></div>
        {"<div class='pf'><label>CUIL</label><strong>" + cuil + "</strong></div>" if cuil else ""}
        <div class="pf"><label>Obra Social</label><strong>{obra_social or "—"}</strong></div>
        <div class="pf"><label>Plan</label><strong>{plan or "—"}</strong></div>
        <div class="pf"><label>N° Credencial</label><strong>{nro_credencial or "—"}</strong></div>
      </div>"""

    sig_footer = f"""
      <div class="sig-footer">
        <div class="sig-left">
          <p class="sig-legal">Este documento ha sido firmado electrónicamente por<br>
          <strong>{med_nombre}</strong><br>
          conforme Ley 25.506 de Firma Digital.</p>
          <p class="sig-date">{fecha_emision}</p>
        </div>
        <div class="sig-right">
          {firma_bloque}
          <div class="firma-label">{med_nombre}</div>
          <div class="firma-sub">{esp_label} · MN {mat_label}</div>
          <div class="firma-stamp">FIRMA Y SELLO</div>
        </div>
      </div>"""

    qr_strip = f"""
      <div class="qr-strip">
        <img src="{qr_url}" width="64" height="64" alt="QR" class="qr-img">
        <div class="strip-info">
          <strong>{esp_label}</strong><br>
          {med_nombre}<br>
          <span class="strip-note">Esta receta fue creada por un emisor inscripto en DocYa — Sistema de Recetas Médicas Digitales. RL-2024-{rec_id:09d}</span>
        </div>
        <div class="strip-badge">receta<br>electrónica</div>
      </div>"""

    # ── COPY builders ────────────────────────────────────────────────────────
    # Página 1: sección Rp (solo medicamentos + diagnóstico)
    def _copy_rp(badge, extra_class=""):
        return f"""
<div class="copy {extra_class}">
  {_top(badge)}
  {pac_grid}
  <div class="sec-title">Rp/</div>
  <div class="sec-body rp-body">
    {meds_rp_html}
    {diag_html}
  </div>
  <div class="blank-space"></div>
  {sig_footer}
  {qr_strip}
</div>"""

    # Página 2: sección Indicaciones (solo comentarios)
    def _copy_ind(badge, extra_class=""):
        return f"""
<div class="copy {extra_class}">
  {_top(badge)}
  {pac_grid}
  <div class="sec-title ind-title">Indicaciones:</div>
  <div class="sec-body ind-body">
    {meds_com_html}
  </div>
  <div class="blank-space"></div>
  {sig_footer}
  {qr_strip}
</div>"""

    # Página 3: DUPLICADO con ambas secciones y marca de agua
    def _copy_full(badge, extra_class="", watermark_text=""):
        watermark_html = f'<div class="watermark">{watermark_text}</div>' if watermark_text else ""
        return f"""
<div class="copy {extra_class}">
  {watermark_html}
  {_top(badge)}
  {pac_grid}
  <div class="dup-content">
    <div class="dup-col">
      <div class="sec-title">Rp/</div>
      <div class="sec-body">
        {meds_rp_html}
        {diag_html}
      </div>
    </div>
    <div class="dup-divider"></div>
    <div class="dup-col">
      <div class="sec-title ind-title">Indicaciones:</div>
      <div class="sec-body">
        {meds_com_html}
      </div>
    </div>
  </div>
  <div class="blank-space" style="min-height:16px"></div>
  {sig_footer}
  {qr_strip}
</div>"""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receta #{rec_id} — DocYa</title>
<style>
/* ── Reset ───────────────────────────────────────────────────────────────── */
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  color: #111;
  background: #e2e8f0;
  -webkit-font-smoothing: antialiased;
}}

/* ── Print ───────────────────────────────────────────────────────────────── */
@media print {{
  body {{ background: #fff; font-size: 10px; }}
  .no-print {{ display: none !important; }}
  .page {{
    width: 196mm;
    min-height: auto;
    height: auto;
    page-break-after: always;
    break-after: page;
    box-shadow: none;
    margin: 0 auto;
    border-radius: 0;
    overflow: hidden;
  }}
  .page:last-child {{
    page-break-after: auto;
    break-after: auto;
  }}
  .page.two-up {{
    position: relative;
  }}
  .page.two-up .copies {{
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 16mm;
    padding-top: 10mm;
  }}
  .page.two-up .copy {{
    flex: none;
    width: 90mm;
    min-width: 90mm;
    max-width: 90mm;
    height: 160mm;
    min-height: 160mm;
  }}
  .page.two-up .copy-divider {{
    position: absolute;
    top: 10mm;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    min-height: 160mm;
    height: 160mm;
    margin: 0;
    border-left: 1px dashed #9ca3af;
    background: none;
  }}
  .page.half-sheet .copies.single {{
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 10mm;
  }}
  .page.half-sheet .copy {{
    flex: none;
    width: 90mm;
    min-width: 90mm;
    max-width: 90mm;
    height: 160mm;
    min-height: 160mm;
  }}
  @page {{ margin: 7mm; size: A4; }}
}}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.no-print {{
  position: sticky; top: 0; z-index: 20;
  background: #1e293b; padding: 9px 16px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}}
.no-print button {{
  background: #14B8A6; color: #fff; border: none;
  padding: 6px 18px; border-radius: 20px;
  font-size: 12px; font-weight: 700; cursor: pointer;
  white-space: nowrap;
}}
.no-print a {{ color: #14B8A6; font-size: 12px; text-decoration: none; white-space: nowrap; }}
.anulada-pill {{
  background: #fef2f2; color: #dc2626; border: 1px solid #dc2626;
  border-radius: 20px; padding: 3px 10px; font-weight: 700; font-size: 11px;
}}
.page-label {{
  color: #94a3b8; font-size: 11px; margin-left: auto;
}}

/* ── Page wrapper ────────────────────────────────────────────────────────── */
.page {{
  background: #fff;
  max-width: 210mm;
  min-height: 297mm;
  margin: 14px auto;
  box-shadow: 0 4px 28px rgba(0,0,0,0.15);
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  border-top: 3px solid #14B8A6;
}}

/* ── Two-copy row ────────────────────────────────────────────────────────── */
.copies {{
  display: flex;
  flex: 1;
  min-height: 0;
}}
.page.two-up .copies {{
  align-items: flex-start;
  justify-content: center;
  gap: 10mm;
  padding-top: 10mm;
}}

/* ── Dashed vertical divider ─────────────────────────────────────────────── */
.copy-divider {{
  flex-shrink: 0;
  width: 1px;
  background: repeating-linear-gradient(
    to bottom, #9ca3af 0, #9ca3af 5px, transparent 5px, transparent 10px
  );
}}
.page.two-up .copy-divider {{
  align-self: stretch;
  min-height: 160mm;
}}

/* ── Single copy ─────────────────────────────────────────────────────────── */
.copy {{
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 9px 11px 7px;
  position: relative;
  overflow: hidden;
}}

/* ── Watermark ───────────────────────────────────────────────────────────── */
.watermark {{
  position: absolute;
  top: 46%; left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  font-size: 58px; font-weight: 900;
  color: rgba(0,0,0,0.055);
  pointer-events: none; white-space: nowrap;
  letter-spacing: 6px; z-index: 0;
}}

/* ── Top strip (barcodes + logo + info) ──────────────────────────────────── */
.top-strip {{
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding-bottom: 7px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 6px;
}}
.top-barcodes {{ display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }}
.barcode {{ display: block; width: auto; height: 22px; max-width: 80px; object-fit: contain; }}
.top-center {{ flex: 1; text-align: center; }}
.logo {{ height: 26px; display: block; margin: 0 auto 3px; }}
.copy-badge {{
  display: inline-block;
  background: linear-gradient(135deg, #0AE6C7, #0d9488);
  color: #fff; font-size: 7.5px; font-weight: 800;
  letter-spacing: 1px; padding: 2px 9px; border-radius: 9999px;
  text-transform: uppercase;
}}
.top-info {{ text-align: right; font-size: 9px; line-height: 1.6; color: #374151; flex-shrink: 0; }}
.top-address {{ display: inline-block; max-width: 108px; color: #6b7280; line-height: 1.3; }}
.fecha-teal {{ color: #0d9488; font-weight: 700; }}

/* ── Patient grid ────────────────────────────────────────────────────────── */
.pac-grid {{
  display: flex;
  flex-wrap: wrap;
  border: 1.5px solid #0d9488;
  border-radius: 3px;
  margin-bottom: 6px;
  overflow: hidden;
}}
.pf {{
  flex: 1 1 33%;
  padding: 3px 6px;
  border-right: 1px solid #ccfbf1;
  border-bottom: 1px solid #ccfbf1;
  min-width: 0;
}}
.pf:last-child, .pf-name {{ border-right: none; }}
.pf-name {{ flex: 1 1 100%; background: #f0fdfa; font-size: 10px; }}
.pf label {{
  display: block; font-size: 7.5px; color: #6b7280;
  text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 1px;
}}
.pf strong {{ font-size: 10px; }}

/* ── Section title ───────────────────────────────────────────────────────── */
.sec-title {{
  font-size: 13px; font-weight: 900; color: #0d9488;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 3px; margin-bottom: 5px;
}}
.ind-title {{ font-size: 11px; font-weight: 800; color: #374151; }}

/* ── Section body ────────────────────────────────────────────────────────── */
.sec-body {{ flex: 1; }}
.rp-body  {{ min-height: 60px; }}
.ind-body {{ min-height: 60px; }}
.med-rp  {{ margin: 4px 0; line-height: 1.55; font-size: 10px; }}
.med-com {{ margin: 5px 0; font-size: 10px; line-height: 1.6; color: #374151; }}
.med-cant {{ color: #6b7280; font-size: 9px; }}
.med-num  {{ color: #0d9488; font-weight: 700; }}
.diag-row {{
  font-size: 9.5px; border-left: 2px solid #0d9488;
  padding: 2px 6px; margin-top: 6px;
  background: #f0fdfa; color: #374151;
}}

/* ── Blank writing space ─────────────────────────────────────────────────── */
.blank-space {{
  flex: 1;
  min-height: 32px;
  border: 1px dashed #d1d5db;
  border-radius: 3px;
  margin: 5px 0;
}}

/* ── Signature footer ────────────────────────────────────────────────────── */
.sig-footer {{
  display: flex;
  gap: 8px;
  border-top: 1px dashed #9ca3af;
  padding-top: 5px;
  margin-bottom: 5px;
}}
.sig-left {{ flex: 1; }}
.sig-legal {{ font-size: 7.5px; color: #6b7280; line-height: 1.6; }}
.sig-date  {{ font-size: 8px; color: #374151; margin-top: 4px; font-weight: 600; }}
.sig-right {{ min-width: 115px; text-align: center; flex-shrink: 0; }}
.firma-img  {{ max-width: 105px; max-height: 44px; object-fit: contain; display: block; margin: 0 auto 2px; }}
.firma-linea {{ width: 100px; height: 40px; border-bottom: 1.5px solid #111; margin: 0 auto 2px; }}
.firma-label {{ font-size: 8px; font-weight: 700; }}
.firma-sub   {{ font-size: 7.5px; color: #555; }}
.firma-stamp {{ font-size: 8px; font-weight: 800; color: #0d9488; margin-top: 3px; letter-spacing: 0.5px; }}

/* ── QR bottom strip ─────────────────────────────────────────────────────── */
.qr-strip {{
  display: flex;
  align-items: center;
  gap: 7px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 3px;
  padding: 5px 7px;
}}
.qr-img {{ flex-shrink: 0; display: block; border: 1px solid #e5e7eb; border-radius: 2px; }}
.strip-info {{ flex: 1; min-width: 0; font-size: 8px; line-height: 1.55; color: #374151; }}
.strip-note {{ color: #6b7280; display: block; font-size: 7px; margin-top: 1px; }}
.strip-badge {{
  flex-shrink: 0;
  background: linear-gradient(135deg, #0AE6C7, #0d9488);
  color: #fff; font-size: 7.5px; font-weight: 800;
  text-align: center; padding: 4px 7px; border-radius: 3px;
  text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.4;
}}

/* ── DUPLICADO: two columns inside single copy ───────────────────────────── */
.dup-content {{
  display: flex;
  gap: 0;
  flex: 1;
  min-height: 0;
  border: 1px solid #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}}
.dup-col {{ flex: 1; padding: 5px 7px; display: flex; flex-direction: column; }}
.dup-col:first-child {{ background: #fff; }}
.dup-col:last-child  {{ background: #fafafa; }}
.dup-divider {{ width: 1px; background: #e5e7eb; flex-shrink: 0; }}

/* ── Single-copy page ────────────────────────────────────────────────────── */
.copies.single {{
  justify-content: center;
}}
.copies.single .copy {{
  max-width: 105mm;
}}
.page.two-up .copy {{
  flex: 0 0 auto;
  width: 90mm;
  max-width: 90mm;
  min-height: 160mm;
}}
.page.half-sheet .copies.single {{
  justify-content: center;
  align-items: flex-start;
  padding-top: 10mm;
}}
.page.half-sheet .copies.single .copy {{
  flex: 0 0 auto;
  width: 90mm;
  max-width: 90mm;
  min-height: 160mm;
}}

.copy.compact {{
  padding: 6px 9px 5px;
  min-height: 0;
  height: 160mm;
}}
.copy.compact .top-strip {{
  gap: 5px;
  padding-bottom: 5px;
  margin-bottom: 5px;
}}
.copy.compact .barcode {{
  max-height: 18px;
  max-width: 70px;
}}
.copy.compact .logo {{
  height: 21px;
  margin-bottom: 2px;
}}
.copy.compact .copy-badge {{
  font-size: 6.5px;
  padding: 2px 7px;
}}
.copy.compact .top-info {{
  font-size: 8px;
  line-height: 1.4;
}}
.copy.compact .pac-grid {{
  margin-bottom: 5px;
}}
.copy.compact .pf {{
  padding: 2px 5px;
}}
.copy.compact .pf-name {{
  font-size: 9px;
}}
.copy.compact .pf label {{
  font-size: 6.5px;
}}
.copy.compact .pf strong {{
  font-size: 8.5px;
}}
.copy.compact .sec-title {{
  font-size: 11px;
  padding-bottom: 2px;
  margin-bottom: 4px;
}}
.copy.compact .ind-title {{
  font-size: 10px;
}}
.copy.compact .rp-body,
.copy.compact .ind-body {{
  min-height: 0;
}}
.copy.compact .med-rp {{
  margin: 2px 0;
  line-height: 1.35;
  font-size: 8.5px;
}}
.copy.compact .med-com {{
  margin: 2px 0;
  line-height: 1.35;
  font-size: 8.5px;
}}
.copy.compact .med-cant,
.copy.compact .diag-row {{
  font-size: 7.5px;
}}
.copy.compact .blank-space {{
  min-height: 8px;
  margin: 4px 0;
}}
.copy.compact .sig-footer {{
  gap: 6px;
  padding-top: 4px;
  margin-bottom: 4px;
}}
.copy.compact .sig-legal,
.copy.compact .firma-sub,
.copy.compact .strip-note {{
  font-size: 6.5px;
}}
.copy.compact .sig-date,
.copy.compact .firma-label,
.copy.compact .firma-stamp,
.copy.compact .strip-info {{
  font-size: 7px;
}}
.copy.compact .sig-right {{
  min-width: 92px;
}}
.copy.compact .firma-img {{
  max-width: 84px;
  max-height: 32px;
}}
.copy.compact .firma-linea {{
  width: 80px;
  height: 28px;
}}
.copy.compact .qr-strip {{
  gap: 5px;
  padding: 4px 5px;
}}
.copy.compact .qr-img {{
  width: 48px;
  height: 48px;
}}
.copy.compact .strip-badge {{
  font-size: 6.5px;
  padding: 3px 5px;
}}
.copy.compact .dup-content {{
  margin-bottom: 3px;
}}
.copy.compact .dup-col {{
  padding: 4px 5px;
}}
.copy.compact .watermark {{
  font-size: 40px;
  letter-spacing: 4px;
}}
.page.half-sheet .copy.compact {{
  padding: 7px 10px 6px;
}}
.page.half-sheet .copy.compact .dup-content {{
  flex: 1;
  min-height: 0;
}}
.page.half-sheet .copy.compact .blank-space {{
  display: none;
}}

/* ── Mobile responsive ───────────────────────────────────────────────────── */
@media screen and (max-width: 600px) {{
  body {{ font-size: 12px; background: #f1f5f9; }}
  .page {{
    max-width: 100%;
    min-height: unset;
    margin: 8px;
    border-radius: 6px;
  }}
  .copies {{
    flex-direction: column;
  }}
  .copy-divider {{
    width: 100%;
    height: 1px;
    background: repeating-linear-gradient(
      to right, #9ca3af 0, #9ca3af 5px, transparent 5px, transparent 10px
    );
  }}
  .top-barcodes {{ display: none; }}
  .barcode {{ display: none; }}
  .top-strip {{ flex-wrap: wrap; gap: 4px; }}
  .top-info {{ font-size: 10px; }}
  .pf {{ flex: 1 1 45%; font-size: 11px; }}
  .pf strong {{ font-size: 11px; }}
  .sec-title {{ font-size: 15px; }}
  .med-rp, .med-com {{ font-size: 12px; }}
  .firma-img {{ max-width: 130px; max-height: 55px; }}
  .firma-linea {{ width: 130px; height: 50px; }}
  .qr-strip {{ gap: 10px; padding: 8px; }}
  .strip-info {{ font-size: 10px; }}
  .strip-note {{ font-size: 9px; }}
  .dup-content {{ flex-direction: column; }}
  .dup-divider {{ width: 100%; height: 1px; }}
  .copies.single .copy {{ max-width: 100%; }}
  .no-print {{ gap: 8px; }}
  .no-print button {{ font-size: 13px; padding: 8px 20px; }}
}}
</style>
</head>
<body>

<!-- Toolbar -->
<div class="no-print">
  <button onclick="window.print()">🖨 Imprimir / PDF</button>
  <a href="{ver_url}" target="_blank">🔗 Verificar</a>
  {anulada_pill}
  <span class="page-label">Receta #{rec_id}</span>
</div>

<!-- ═══ PÁGINA 1: ORIGINAL + COPIA ══════════════════════════════════════════ -->
<div class="page two-up">
  <div class="copies">
    {_copy_full("ORIGINAL", "compact")}
    <div class="copy-divider"></div>
    {_copy_full("COPIA", "compact")}
  </div>
</div>

<!-- ═══ PÁGINA 2: DUPLICADO ══════════════════════════════════════════════════ -->
<div class="page half-sheet">
  <div class="copies single">
    {_copy_full("DUPLICADO", "compact", "DUPLICADO")}
  </div>
</div>

</body>
</html>"""

    return HTMLResponse(html)


# ====================================================
# 🔧 Helpers HTML
# ====================================================
def _html_verificacion(uuid, cuir, estado, es_valida, fecha, paciente,
                        medico, matricula, especialidad, diagnostico):
    color  = "#14B8A6" if es_valida else "#dc2626"
    icono  = "✅" if es_valida else "❌"
    titulo = "Documento Válido" if es_valida else "Documento Anulado"
    subtxt = ("La firma digital es auténtica y el documento se encuentra vigente."
              if es_valida else
              "Este documento fue revocado por el profesional y no tiene validez legal.")

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verificación — DocYa</title>
<style>
  body {{ font-family: Arial, sans-serif; background: #030b12; color: #fff;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; padding: 20px; }}
  .card {{ background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
           border-radius: 20px; padding: 40px 32px; max-width: 480px; width: 100%;
           text-align: center; border-top: 3px solid {color}; }}
  .icon {{ font-size: 3.5rem; margin-bottom: 16px; }}
  h2 {{ color: {color}; font-size: 1.6rem; margin-bottom: 8px; }}
  .sub {{ color: #94a3b8; font-size: 0.9rem; margin-bottom: 28px; }}
  .data {{ background: rgba(0,0,0,0.3); border-radius: 10px; padding: 18px;
           text-align: left; }}
  .row {{ display: flex; justify-content: space-between; padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.07); font-size: 0.9rem; }}
  .row:last-child {{ border-bottom: none; }}
  .label {{ color: #94a3b8; }}
  .value {{ font-weight: 600; color: {color}; }}
  .logo {{ margin-bottom: 28px; }}
  .logo img {{ height: 36px; }}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <img src="https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logoblanco_1_qdlnog.png" alt="DocYa">
  </div>
  <div class="icon">{icono}</div>
  <h2>{titulo}</h2>
  <p class="sub">{subtxt}</p>
  <div class="data">
    <div class="row"><span class="label">Tipo</span><span class="value">Receta Médica Electrónica</span></div>
    <div class="row"><span class="label">Fecha emisión</span><span class="value">{fecha}</span></div>
    <div class="row"><span class="label">Médico emisor</span><span class="value">{medico}</span></div>
    <div class="row"><span class="label">Matrícula Nac.</span><span class="value">MN {matricula}</span></div>
    <div class="row"><span class="label">Especialidad</span><span class="value">{especialidad}</span></div>
    <div class="row"><span class="label">Paciente</span><span class="value">{paciente}</span></div>
    <div class="row"><span class="label">Estado</span>
      <span class="value" style="color:{'#4ade80' if es_valida else '#f87171'}">
        {'VÁLIDA' if es_valida else 'ANULADA'}
      </span>
    </div>
    <div class="row"><span class="label">UUID</span>
      <span class="value" style="font-size:0.75rem;color:#94a3b8">{uuid}</span>
    </div>
    <div class="row"><span class="label">CUIR</span>
      <span class="value" style="font-size:0.75rem;color:#94a3b8">{cuir}</span>
    </div>
  </div>
</div>
</body>
</html>"""


# ====================================================
# 📋 ÓRDENES MÉDICAS
# ====================================================

ORDEN_TIPOS = {
    "laboratorio": "Orden de laboratorio",
    "imagenes":    "Orden de imágenes",
    "derivacion":  "Derivación / Interconsulta",
}

ORDEN_COLORES = {
    "laboratorio": {"color": "#0F6E56", "light": "#E1F5EE", "border": "#1D9E75"},
    "imagenes":    {"color": "#3C3489", "light": "#EEEDFE", "border": "#534AB7"},
    "derivacion":  {"color": "#0C447C", "light": "#E6F1FB", "border": "#185FA5"},
}

ORDEN_PRIORIDAD_COLORS = {
    "Normal":      {"color": "#0F6E56", "bg": "#E1F5EE"},
    "Preferencial": {"color": "#BA7517", "bg": "#FAEEDA"},
    "Urgente":     {"color": "#A32D2D", "bg": "#FCEBEB"},
}


class EstudioItem(BaseModel):
    nombre: str
    obs:    Optional[str] = None


class OrdenIn(BaseModel):
    paciente_id:  int
    tipo_orden:   str
    estudios:     List[EstudioItem]
    diagnostico:  str
    cie10:        Optional[str] = None
    indicaciones: Optional[str] = None
    prioridad:    str = "Normal"


def _ensure_recetario_ordenes_schema(db) -> None:
    cur = db.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recetario_ordenes (
            id           SERIAL PRIMARY KEY,
            medico_id    INTEGER NOT NULL,
            paciente_id  INTEGER NOT NULL,
            tipo_orden   VARCHAR(20) NOT NULL,
            estudios     JSONB NOT NULL DEFAULT '[]',
            diagnostico  TEXT NOT NULL,
            cie10        VARCHAR(20),
            indicaciones TEXT,
            prioridad    VARCHAR(20) NOT NULL DEFAULT 'Normal',
            cuir         VARCHAR(60) UNIQUE,
            uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
            estado       VARCHAR(20) NOT NULL DEFAULT 'valida',
            creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    db.commit()


def _generate_unique_cuir_orden(db) -> str:
    cur = db.cursor()
    for _ in range(25):
        cuir = _build_cuir(_generate_prescription_group_id(), item_number="02")
        cur.execute("SELECT 1 FROM recetario_ordenes WHERE cuir=%s LIMIT 1", (cuir,))
        if not cur.fetchone():
            return cuir
        time.sleep(0.005)
    raise HTTPException(500, "No se pudo generar un CUIR único para la orden")


@router.post("/ordenes", status_code=201)
def emitir_orden(
    data: OrdenIn,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db),
):
    if data.tipo_orden not in ORDEN_TIPOS:
        raise HTTPException(400, f"tipo_orden inválido. Opciones: {list(ORDEN_TIPOS.keys())}")
    if not data.estudios:
        raise HTTPException(400, "Debés incluir al menos un estudio")
    if len(data.diagnostico.strip()) < 3:
        raise HTTPException(400, "El diagnóstico es obligatorio")
    if data.prioridad not in ("Normal", "Preferencial", "Urgente"):
        raise HTTPException(400, "prioridad inválida")

    _ensure_recetario_ordenes_schema(db)
    cur = db.cursor()

    cur.execute("""
        SELECT id FROM recetario_pacientes
        WHERE id=%s AND medico_id=%s
    """, (data.paciente_id, medico_id))
    if not cur.fetchone():
        raise HTTPException(404, "Paciente no encontrado en tu listado")

    import json as _json
    estudios_json = _json.dumps([e.dict() for e in data.estudios], ensure_ascii=False)
    cuir = _generate_unique_cuir_orden(db)

    cur.execute("""
        INSERT INTO recetario_ordenes
            (medico_id, paciente_id, tipo_orden, estudios, diagnostico,
             cie10, indicaciones, prioridad, cuir)
        VALUES (%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s)
        RETURNING id, uuid, creado_en, cuir
    """, (
        medico_id, data.paciente_id, data.tipo_orden,
        estudios_json, data.diagnostico,
        data.cie10, data.indicaciones, data.prioridad, cuir,
    ))
    row = cur.fetchone()
    db.commit()

    base = os.getenv("API_BASE_URL", "https://docya-railway-production.up.railway.app")
    return {
        "ok": True,
        "orden_id": row[0],
        "id": row[0],
        "uuid": str(row[1]),
        "cuir": row[3],
        "creado_en": str(row[2]),
        "url_html": f"{base}/recetario/ordenes/{row[0]}/html",
    }


@router.get("/ordenes")
def listar_ordenes(
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db),
):
    _ensure_recetario_ordenes_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT o.id, o.uuid, o.cuir, o.tipo_orden, o.diagnostico,
               o.prioridad, o.estado, o.creado_en,
               p.nombre, p.apellido, p.tipo_documento, p.nro_documento
        FROM recetario_ordenes o
        JOIN recetario_pacientes p ON p.id = o.paciente_id
        WHERE o.medico_id=%s
        ORDER BY o.creado_en DESC
    """, (medico_id,))
    rows = cur.fetchall()
    return {"total": len(rows), "ordenes": [
        {
            "id": r[0], "uuid": str(r[1]), "cuir": r[2],
            "tipo_orden": r[3], "tipo_label": ORDEN_TIPOS.get(r[3], r[3]),
            "diagnostico": r[4], "prioridad": r[5], "estado": r[6],
            "fecha": r[7].strftime("%d/%m/%Y %H:%M") if r[7] else None,
            "paciente": f"{r[9]}, {r[8]}",
            "documento": f"{r[10]} {r[11]}",
        }
        for r in rows
    ]}


@router.get("/ordenes/{orden_id}/html", response_class=HTMLResponse)
def orden_html(
    orden_id: int,
    medico_id: int = Depends(get_medico_id),
    db=Depends(get_db),
):
    _ensure_recetario_ordenes_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT o.id, o.uuid, o.tipo_orden, o.estudios, o.diagnostico, o.cie10,
               o.indicaciones, o.prioridad, o.cuir, o.creado_en,
               p.nombre, p.apellido, p.tipo_documento, p.nro_documento,
               p.sexo, p.fecha_nacimiento, p.obra_social,
               m.full_name, m.matricula, m.especialidad, m.tipo, m.firma_url
        FROM recetario_ordenes o
        JOIN recetario_pacientes p ON p.id = o.paciente_id
        JOIN medicos             m ON m.id = o.medico_id
        WHERE o.id=%s AND o.medico_id=%s
    """, (orden_id, medico_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Orden no encontrada")

    (oid, uuid_orden, tipo_orden, estudios_raw, diagnostico, cie10,
     indicaciones, prioridad, cuir, creado_en,
     pac_nombre, pac_apellido, tipo_doc, nro_doc,
     sexo, fecha_nac, obra_social,
     med_nombre, matricula, especialidad, tipo_med, firma_url) = row

    import json as _json
    estudios = estudios_raw if isinstance(estudios_raw, list) else (_json.loads(estudios_raw) if estudios_raw else [])

    tipo_label = ORDEN_TIPOS.get(tipo_orden, "Orden médica")
    colores    = ORDEN_COLORES.get(tipo_orden, ORDEN_COLORES["laboratorio"])
    prio_col   = ORDEN_PRIORIDAD_COLORS.get(prioridad, ORDEN_PRIORIDAD_COLORS["Normal"])
    color      = colores["color"]
    color_light = colores["light"]
    color_border = colores["border"]

    ar_tz = ZoneInfo("America/Argentina/Buenos_Aires")
    if creado_en and hasattr(creado_en, "astimezone"):
        creado_en = creado_en.astimezone(ar_tz)
    elif creado_en and isinstance(creado_en, str):
        try:
            from datetime import datetime as _dt
            creado_en = _dt.fromisoformat(creado_en).astimezone(ar_tz)
        except Exception:
            pass
    fecha_emision       = creado_en.strftime("%d/%m/%Y")       if creado_en and hasattr(creado_en, "strftime") else "—"
    fecha_emision_larga = creado_en.strftime("%d/%m/%Y %H:%M") if creado_en and hasattr(creado_en, "strftime") else "—"
    paciente_nombre = f"{escape(pac_apellido.upper())}, {escape(pac_nombre)}"
    paciente_documento = f"{escape(tipo_doc)} {escape(nro_doc)}"
    esp_label = (especialidad or tipo_med or "Médico/a").title()
    mat_label = escape(matricula or "—")
    obra_label = escape(obra_social or "—")
    firma_bloque = (f'<img src="{firma_url}" class="firma-img" alt="Firma">' if firma_url else '<div class="firma-linea"></div>')
    logo_src = "https://res.cloudinary.com/dqsacd9ez/image/upload/v1757197807/logo_1_svfdye.png"

    def _svg_icon(tipo: str, color: str, size: int = 26) -> str:
        s = f'stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        b = f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" {s}>'
        if tipo == "laboratorio":
            p = '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>'
        elif tipo == "imagenes":
            p = '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>'
        else:
            p = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>'
        return f'{b}{p}</svg>'
    icono_svg = _svg_icon(tipo_orden, color)

    barcode_uri = _barcode_data_uri(cuir or "")
    barcode_html = (
        f'<img src="{barcode_uri}" alt="Código de barras CUIR" style="max-width:200px;height:auto;" />'
        if barcode_uri else ""
    )

    estudios_html = ""
    for i, e in enumerate(estudios, 1):
        nombre = escape(str(e.get("nombre", "")))
        obs = escape(str(e.get("obs") or ""))
        obs_html_item = f'<div class="est-obs">{obs}</div>' if obs else ""
        estudios_html += f"""
        <div class="est-item">
          <span class="est-num" style="background:{color};color:#fff">{i}</span>
          <div class="est-text">
            <span class="est-nombre">{nombre}</span>
            {obs_html_item}
          </div>
        </div>"""

    cie10_badge = (
        f'<span class="badge-cie" style="background:{color_light};color:{color};border:1px solid {color_border}">CIE-10: {escape(cie10)}</span>'
        if cie10 else ""
    )
    indicaciones_html = (
        f'<div class="indicaciones-box" style="border-left:3px solid {color};background:{color_light}">'
        f'<strong style="color:{color}">Indicaciones para el paciente:</strong><br>{escape(indicaciones)}</div>'
        if indicaciones else ""
    )
    prio_badge = (
        f'<span class="prio-badge" style="background:{prio_col["bg"]};color:{prio_col["color"]};border:1px solid {prio_col["color"]}">⚡ {escape(prioridad)}</span>'
        if prioridad != "Normal" else
        f'<span class="prio-badge" style="background:{prio_col["bg"]};color:{prio_col["color"]};border:1px solid {prio_col["color"]}">{escape(prioridad)}</span>'
    )

    base = os.getenv("API_BASE_URL", "https://docya-railway-production.up.railway.app")
    ver_url = f"{base}/recetario/ordenes/verificar/{uuid_orden}"
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=110x110&data={ver_url}"

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(tipo_label)} — DocYa</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0;}}
:root{{
  --color:{color};
  --light:{color_light};
  --border:{color_border};
  --ink:#0f172a;
  --muted:#64748b;
  --line:#dbe4ea;
  --soft:#f8fafc;
}}
body{{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:var(--ink);background:#e2e8f0;-webkit-font-smoothing:antialiased;}}
@media print{{
  body{{background:#fff;}}
  .no-print{{display:none!important;}}
  .page{{box-shadow:none;margin:0;border-radius:0;}}
  @page{{margin:12mm;size:A4;}}
}}
.no-print{{
  position:sticky;top:0;z-index:20;
  background:#1e293b;padding:9px 16px;
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
}}
.no-print button{{background:var(--color);color:#fff;border:none;padding:6px 20px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;}}
.no-print span{{color:#94a3b8;font-size:12px;}}
.page{{
  background:#fff;max-width:210mm;min-height:297mm;
  margin:16px auto;padding:34px 40px 30px;
  box-shadow:0 4px 28px rgba(0,0,0,0.14);border-radius:14px;
  display:flex;flex-direction:column;overflow:hidden;
}}
.header{{
  display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;
  border-bottom:3px solid var(--color);padding-bottom:16px;margin-bottom:22px;
}}
.logo-wrap{{display:flex;align-items:center;gap:14px;}}
.logo{{height:46px;}}
.brand-copy{{display:flex;flex-direction:column;gap:5px;}}
.eyebrow{{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);}}
.brand-copy strong{{font-size:22px;color:var(--ink);letter-spacing:-.03em;}}
.brand-copy span{{color:var(--muted);font-size:12px;}}
.header-right{{
  min-width:180px;text-align:right;background:linear-gradient(180deg,var(--light),#fff);
  border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:14px 16px;
  font-size:11px;color:var(--muted);line-height:1.8;
}}
.header-right strong{{color:var(--ink);}}
.tipo-banner{{
  display:flex;align-items:center;gap:12px;
  background:var(--light);border:1.5px solid var(--border);
  border-radius:10px;padding:14px 18px;margin-bottom:20px;
}}
.tipo-icon{{font-size:26px;}}
.tipo-info strong{{font-size:15px;font-weight:700;color:var(--color);display:block;}}
.tipo-info span{{font-size:11px;color:var(--muted);}}
.section-title{{
  font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
  color:var(--muted);margin:20px 0 10px;padding-bottom:6px;
  border-bottom:1px solid var(--line);
}}
.info-grid{{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:16px;}}
.info-row{{font-size:12px;line-height:1.7;}}
.info-row span{{color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;display:block;}}
.est-item{{
  display:flex;align-items:flex-start;gap:10px;
  padding:9px 12px;border-bottom:1px solid var(--line);
}}
.est-item:last-child{{border-bottom:none;}}
.est-num{{
  width:22px;height:22px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;
}}
.est-text{{flex:1;}}
.est-nombre{{font-size:13px;font-weight:500;color:var(--ink);}}
.est-obs{{font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;}}
.estudios-box{{
  border:1.5px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;
}}
.diag-box{{
  background:var(--soft);border:1px solid var(--line);border-radius:10px;
  padding:14px 16px;margin-bottom:12px;font-size:13px;line-height:1.65;
}}
.badge-cie{{
  display:inline-block;padding:3px 10px;border-radius:20px;
  font-size:11px;font-weight:600;font-family:monospace;margin-bottom:10px;
}}
.prio-badge{{
  display:inline-block;padding:3px 10px;border-radius:20px;
  font-size:11px;font-weight:600;margin-left:8px;
}}
.indicaciones-box{{
  border-radius:8px;padding:10px 14px;margin-bottom:16px;
  font-size:12px;line-height:1.6;color:#1e293b;
}}
.footer-sig{{
  display:grid;grid-template-columns:1fr 1fr;gap:24px;
  margin-top:auto;padding-top:24px;border-top:1px solid var(--line);
}}
.sig-block{{text-align:center;}}
.firma-img{{max-height:50px;max-width:180px;object-fit:contain;display:block;margin:0 auto 4px;}}
.firma-linea{{height:1px;background:var(--line);margin-bottom:4px;}}
.sig-label{{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;}}
.sig-name{{font-size:12px;font-weight:600;color:var(--ink);margin-top:2px;}}
.sig-mat{{font-size:11px;color:var(--muted);}}
.barcode-wrap{{text-align:center;margin-top:10px;}}
.legend{{
  font-size:9.5px;color:var(--muted);text-align:center;margin-top:18px;
  line-height:1.5;border-top:1px solid var(--line);padding-top:10px;
}}
</style>
</head>
<body>
<div class="no-print">
  <button onclick="window.print()">⎙ Imprimir / Guardar PDF</button>
  <span>DocYa · {escape(tipo_label)}</span>
</div>

<div class="page">

  <!-- Encabezado -->
  <div class="header">
    <div class="logo-wrap">
      <img src="{logo_src}" alt="DocYa" class="logo" />
      <div class="brand-copy">
        <span class="eyebrow">Documento médico digital</span>
        <strong>DocYa</strong>
        <span>docya.com.ar</span>
      </div>
    </div>
    <div class="header-right">
      <strong>N.º de emisión</strong><br>
      ORD-{oid:06d}<br>
      <strong>Fecha</strong><br>
      {fecha_emision_larga}<br>
      <strong>CUIR</strong><br>
      <span style="font-size:9px;word-break:break-all;">{escape(cuir or '—')}</span>
    </div>
  </div>

  <!-- Banner tipo -->
  <div class="tipo-banner">
    <div class="tipo-icon" style="display:flex;align-items:center;">{icono_svg}</div>
    <div class="tipo-info">
      <strong>{escape(tipo_label)}</strong>
      <span>Emitido el {fecha_emision_larga} · {prio_badge}</span>
    </div>
  </div>

  <!-- Médico -->
  <div class="section-title">Profesional solicitante</div>
  <div class="info-grid">
    <div class="info-row"><span>Nombre</span>{escape(med_nombre)}</div>
    <div class="info-row"><span>Especialidad</span>{escape(esp_label)}</div>
    <div class="info-row"><span>Matrícula</span>{mat_label}</div>
    <div class="info-row"><span>Fecha de emisión</span>{fecha_emision_larga}</div>
  </div>

  <!-- Paciente -->
  <div class="section-title">Datos del paciente</div>
  <div class="info-grid">
    <div class="info-row"><span>Apellido y nombre</span>{paciente_nombre}</div>
    <div class="info-row"><span>Documento</span>{paciente_documento}</div>
    <div class="info-row"><span>Obra social</span>{obra_label}</div>
  </div>

  <!-- Diagnóstico -->
  <div class="section-title">Diagnóstico {cie10_badge}</div>
  <div class="diag-box">{escape(diagnostico)}</div>
  {indicaciones_html}

  <!-- Estudios / Derivaciones -->
  <div class="section-title">{escape(tipo_label)} ({len(estudios)} ítem{'s' if len(estudios)!=1 else ''})</div>
  <div class="estudios-box">
    {estudios_html}
  </div>

  <!-- Pie: firma + barcode + QR -->
  <div class="footer-sig">
    <div class="sig-block">
      {firma_bloque}
      <div class="sig-label">Firma y sello del profesional</div>
      <div class="sig-name">{escape(med_nombre)}</div>
      <div class="sig-mat">Mat. {mat_label} · {escape(esp_label)}</div>
    </div>
    <div class="sig-block">
      {barcode_html}
      <div class="sig-label" style="margin-top:8px;">Verificación</div>
      <img src="{qr_url}" alt="QR verificación" style="width:80px;height:80px;margin:4px auto;display:block;" />
      <div style="font-size:9px;color:var(--muted);">Escanear para verificar</div>
    </div>
  </div>

  <div class="legend">
    El profesional certifica que la información contenida en este documento es verídica.
    Documento generado digitalmente por DocYa · docya.com.ar · CUIR: {escape(cuir or '—')}
  </div>

</div>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/ordenes/verificar/{uuid_orden}", response_class=HTMLResponse)
def verificar_orden(uuid_orden: str, db=Depends(get_db)):
    """Verificación pública de una orden médica (sin auth). Accesible desde el QR."""
    _ensure_recetario_ordenes_schema(db)
    cur = db.cursor()
    cur.execute("""
        SELECT o.uuid, o.cuir, o.tipo_orden, o.estado, o.diagnostico, o.prioridad, o.creado_en,
               p.nombre, p.apellido,
               m.full_name, m.matricula, m.especialidad, m.tipo
        FROM recetario_ordenes o
        JOIN recetario_pacientes p ON p.id = o.paciente_id
        JOIN medicos             m ON m.id = o.medico_id
        WHERE o.uuid = %s
    """, (uuid_orden,))
    row = cur.fetchone()
    if not row:
        return HTMLResponse(_html_no_encontrada(uuid_orden), status_code=404)

    uuid_val, cuir, tipo_orden, estado, diagnostico, prioridad, creado_en, \
        pac_nombre, pac_apellido, med_nombre, matricula, especialidad, tipo_med = row

    tipo_label = ORDEN_TIPOS.get(tipo_orden, "Orden médica")
    colores    = ORDEN_COLORES.get(tipo_orden, ORDEN_COLORES["laboratorio"])
    color      = colores["color"]
    color_light = colores["light"]
    icon_map   = {"laboratorio": "🧪", "imagenes": "🩻", "derivacion": "👨‍⚕️"}
    icono      = icon_map.get(tipo_orden, "📋")
    es_valida  = estado == "valida"
    fecha_str  = creado_en.strftime("%d/%m/%Y %H:%M") if creado_en else "—"
    esp_label  = (especialidad or tipo_med or "Médico/a").title()

    estado_color = color if es_valida else "#dc2626"
    estado_bg    = color_light if es_valida else "#fef2f2"
    estado_text  = "✓ ORDEN VÁLIDA" if es_valida else "✗ ORDEN ANULADA"

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verificación de orden — DocYa</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0;}}
body{{font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;color:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}}
.card{{background:#fff;border-radius:20px;box-shadow:0 8px 32px rgba(0,0,0,0.12);max-width:480px;width:100%;overflow:hidden;}}
.top{{background:{color};padding:28px 28px 20px;text-align:center;}}
.top .icon{{font-size:2.5rem;margin-bottom:8px;}}
.top h1{{color:#fff;font-size:1.1rem;font-weight:700;letter-spacing:.05em;}}
.top p{{color:rgba(255,255,255,0.8);font-size:0.82rem;margin-top:4px;}}
.estado{{margin:20px 24px 0;padding:12px 16px;border-radius:10px;background:{estado_bg};border:1.5px solid {estado_color};text-align:center;font-weight:700;font-size:0.95rem;color:{estado_color};letter-spacing:.05em;}}
.body{{padding:24px;}}
.row{{display:flex;flex-direction:column;gap:4px;margin-bottom:16px;}}
.row span{{font-size:0.7rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b;}}
.row strong{{font-size:0.95rem;color:#0f172a;}}
.cuir{{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-family:monospace;font-size:0.8rem;color:#475569;word-break:break-all;margin-bottom:16px;}}
.footer{{text-align:center;padding:16px 24px 24px;border-top:1px solid #f1f5f9;font-size:0.75rem;color:#94a3b8;}}
.logo{{font-weight:700;color:{color};}}
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <div class="icon">{icono}</div>
    <h1>{escape(tipo_label)}</h1>
    <p>Verificación de documento — DocYa</p>
  </div>

  <div class="estado">{estado_text}</div>

  <div class="body">
    <div class="row"><span>Paciente</span><strong>{escape(pac_apellido)}, {escape(pac_nombre)}</strong></div>
    <div class="row"><span>Profesional</span><strong>{escape(med_nombre)}</strong></div>
    <div class="row"><span>Especialidad</span><strong>{escape(esp_label)}</strong></div>
    <div class="row"><span>Matrícula</span><strong>{escape(matricula or '—')}</strong></div>
    <div class="row"><span>Fecha de emisión</span><strong>{fecha_str}</strong></div>
    <div class="row"><span>Prioridad</span><strong>{escape(prioridad)}</strong></div>
    <div class="row"><span>Diagnóstico</span><strong>{escape(diagnostico or '—')}</strong></div>
    <div class="row"><span>CUIR</span></div>
    <div class="cuir">{escape(cuir or '—')}</div>
  </div>

  <div class="footer">
    Documento emitido digitalmente por <span class="logo">DocYa</span> · docya.com.ar
  </div>
</div>
</body>
</html>"""
    return HTMLResponse(content=html)


def _html_no_encontrada(uuid_receta: str):
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>No encontrado — DocYa</title>
<style>
  body {{ font-family: Arial; background:#030b12; color:#fff;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }}
  .card {{ background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
           border-radius:20px; padding:40px; text-align:center; max-width:420px;
           border-top:3px solid #dc2626; }}
  h2 {{ color:#dc2626; }} p {{ color:#94a3b8; font-size:0.9rem; margin-top:10px; }}
  code {{ font-size:0.75rem; color:#475569; word-break:break-all; }}
</style>
</head>
<body>
<div class="card">
  <div style="font-size:3rem">🔍</div>
  <h2>Documento no encontrado</h2>
  <p>No existe ningún documento con el identificador:</p>
  <code>{uuid_receta}</code>
</div>
</body>
</html>"""
