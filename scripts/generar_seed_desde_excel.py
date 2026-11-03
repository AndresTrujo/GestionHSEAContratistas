"""
Genera el seed de organización (empleados TFS, cargos, cursos, capacitaciones) a partir de Capacitacion_Master_v5.xlsx.

  python scripts/generar_seed_desde_excel.py [ruta_excel] [ruta_salida]

Por omisión lee ./Capacitacion_Master_v5.xlsx y escribe src/lib/data/memoria/seed_organizacion.nuevo.json
(NO sobrescribe seed_organizacion.json: revisa el resumen y reemplaza el archivo a mano).
Mismo formato que consume scripts/cargar_seed.ts. Requiere openpyxl.
"""
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl

EXCEL_SOURCE = "Capacitacion_Master_v5.xlsx"
SIN_SUBDEPARTAMENTO = "Sin subdepartamento"
FIRST_ADMIN = 204692
SUPERVISOR_HSEA_POSITION = re.compile(
    r"^(SUPERVISOR HSE|GERENTE HSE|RESPONSABLE DE SSPA|SUPERVISOR EN SEGURIDAD INDUSTRIAL)", re.IGNORECASE
)
AREA_REASON = "Responsable de área en el Excel"
LINE_REASON = "Responsable de línea de mando en el Excel"


def rows_of(wb, name):
    rows = wb[name].iter_rows(values_only=True)
    header = next(rows)
    return [dict(zip(header, r)) for r in rows if any(v is not None for v in r)]


def iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    return str(value)[:10]


def text(value):
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def integer(value):
    return None if value is None or value == "" else int(value)


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "Capacitacion_Master_v5.xlsx")
    target = Path(sys.argv[2] if len(sys.argv) > 2 else "src/lib/data/memoria/seed_organizacion.nuevo.json")
    wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
    warnings = []

    lines = rows_of(wb, "Linea_De_Mando")
    departments = rows_of(wb, "Departamentos")
    subs_all = rows_of(wb, "SubDepartamentos")
    real_subs = [s for s in subs_all if text(s["SubDepartamento"]) != SIN_SUBDEPARTAMENTO]
    sub_ids = {s["IdSubDepartamento"] for s in real_subs}

    seed = {
        "lineas_mando": [{"id": r["IdLineaDeMando"], "nombre": text(r["LineaDeMando"])} for r in lines],
        "departamentos": [
            {"id": r["IdDepartamento"], "linea_mando_id": r["IdLineaDeMando"], "nombre": text(r["Departamento"])}
            for r in departments
        ],
        "subdepartamentos": [
            {"id": r["IdSubDepartamento"], "departamento_id": r["IdDepartamento"], "nombre": text(r["SubDepartamento"])}
            for r in real_subs
        ],
    }

    # Empleados (activos y dados de baja; el filtro por activo lo hace la carga).
    employees = []
    for r in rows_of(wb, "Empleados"):
        gender = text(r["Genero"])
        sub_id = integer(r["IdSubDepartamento"])
        employees.append(
            {
                "no_empleado": int(r["NoEmpleado"]),
                "primer_nombre": text(r["PrimerNombre"]),
                "segundo_nombre": text(r["SegundoNombre"]),
                "apellido_paterno": text(r["ApellidoPaterno"]),
                "apellido_materno": text(r["ApellidoMaterno"]),
                "genero": gender.upper() if gender and gender.upper() in ("MASCULINO", "FEMENINO") else None,
                "fecha_ingreso": iso(r["FechaIngreso"]),
                "fecha_baja": iso(r["FechaBaja"]),
                "activo": text(r["Activo"]) is not None and text(r["Activo"]).upper().startswith("S"),
                "puesto": text(r["Puesto"]),
                "linea_mando_id": integer(r["IdLineaDeMando"]),
                "departamento_id": integer(r["IdDepartamento"]),
                "subdepartamento_id": sub_id if sub_id in sub_ids else None,
                "jefe_no_empleado": integer(r["NoEmpleadoJefeDirecto"]),
            }
        )
    seed["empleados"] = employees
    by_number = {e["no_empleado"]: e for e in employees}
    if len(by_number) != len(employees):
        raise SystemExit("Hay números de empleado duplicados en la hoja Empleados")

    # Cargos de área: responsable de línea (GERENTE) y de departamento/subdepartamento (ENCARGADO).
    posts = []
    suggestions = []

    def add_post(position, responsible, area, role, scope, reason_code):
        number = integer(responsible)
        if number is None:
            return
        holder = by_number.get(number)
        if holder is None:
            warnings.append(f"Responsable {number} ({reason_code}) no está en la hoja Empleados: cargo omitido")
            return
        posts.append(
            {
                "no_empleado": number,
                "cargo": position,
                **{k: v for k, v in area.items()},
                "vigente_desde": holder["fecha_ingreso"],
                "vigente_hasta": holder["fecha_baja"],
                "motivo": f"Importado de {EXCEL_SOURCE} (columna NoEmpleadoResponsable)",
            }
        )
        if holder["activo"]:
            suggestions.append(
                {
                    "no_empleado": number,
                    "rol": role,
                    "alcance": scope,
                    **area,
                    "motivo": LINE_REASON if position == "GERENTE" else AREA_REASON,
                }
            )

    for r in lines:
        add_post("GERENTE", r["NoEmpleadoResponsable"], {"linea_mando_id": r["IdLineaDeMando"]},
                 "GERENTE_AREA", "LINEA_MANDO", f"línea {r['IdLineaDeMando']}")
    for r in departments:
        add_post("ENCARGADO", r["NoEmpleadoResponsable"], {"departamento_id": r["IdDepartamento"]},
                 "ENCARGADO_AREA", "DEPARTAMENTO", f"departamento {r['IdDepartamento']}")
    for r in real_subs:
        add_post("ENCARGADO", r["NoEmpleadoResponsable"], {"subdepartamento_id": r["IdSubDepartamento"]},
                 "ENCARGADO_AREA", "SUBDEPARTAMENTO", f"subdepartamento {r['IdSubDepartamento']}")
    seed["cargos_area"] = posts

    # Reglas de departamento RH: se resuelven por nombre contra el catálogo.
    line_id = {text(r["LineaDeMando"]): r["IdLineaDeMando"] for r in lines}
    dept_id = {text(r["Departamento"]): r["IdDepartamento"] for r in departments}
    sub_id_by_name = {(s["IdDepartamento"], text(s["SubDepartamento"])): s["IdSubDepartamento"] for s in real_subs}
    rules = []
    for r in rows_of(wb, "Reglas_Departamentos_RH"):
        department = dept_id.get(text(r["Departamento"]))
        rule_line = line_id.get(text(r["LineaDeMando"]))
        if department is None or rule_line is None:
            warnings.append(f"Regla RH '{r['DepartamentoRH']}' no resuelve línea/departamento: omitida")
            continue
        rules.append(
            {
                "departamento_rh": text(r["DepartamentoRH_Normalizado"]) or text(r["DepartamentoRH"]),
                "linea_mando_id": rule_line,
                "departamento_id": department,
                "subdepartamento_id": sub_id_by_name.get((department, text(r["SubDepartamento"]))),
                "origen": text(r["Origen"]),
            }
        )
    seed["reglas_departamentos_rh"] = rules

    courses = [
        {"id_curso": text(r["IDCurso"]), "nombre": text(r["Curso"]), "horas": float(r["Horas"] or 0), "palabras_clave": text(r["PalabrasClave"])}
        for r in rows_of(wb, "Cursos")
    ]
    seed["cursos"] = courses
    course_ids = {c["id_curso"] for c in courses}

    trainings = []
    skipped = 0
    for r in rows_of(wb, "Capacitaciones"):
        number = integer(r["NoEmpleado"])
        course = text(r["IDCurso"])
        if number not in by_number or course not in course_ids or r["Fecha"] is None:
            skipped += 1
            continue
        trainings.append(
            {"id": int(r["IdCapacitacion"]), "no_empleado": number, "id_curso": course,
             "fecha": iso(r["Fecha"]), "estado_id": int(r["EstadoID"]), "fuente": EXCEL_SOURCE}
        )
    # IdCapacitacion es llave primaria en la BD: si el Excel repite un id en filas distintas, ambas son
    # capacitaciones reales, así que la repetida recibe un id nuevo (máximo + 1) y se avisa.
    next_id = max((t["id"] for t in trainings), default=0) + 1
    seen_ids = set()
    for t in trainings:
        if t["id"] in seen_ids:
            warnings.append(
                f"Capacitación con IdCapacitacion {t['id']} repetido (empleado {t['no_empleado']}, {t['id_curso']}, "
                f"{t['fecha']}): se le asignó el id {next_id}; corrige el Excel"
            )
            t["id"] = next_id
            next_id += 1
        seen_ids.add(t["id"])
    seed["capacitaciones"] = trainings

    # Sugerencias de roles (no se cargan solas): supervisores HSEA por puesto + administrador inicial + cargos.
    hsea = [
        {"no_empleado": e["no_empleado"], "rol": "SUPERVISOR_HSEA", "alcance": "GLOBAL", "motivo": f"Puesto: {e['puesto']}"}
        for e in employees
        if e["activo"] and e["puesto"] and SUPERVISOR_HSEA_POSITION.match(e["puesto"])
    ]
    admin = []
    if by_number.get(FIRST_ADMIN, {}).get("activo"):
        admin = [{"no_empleado": FIRST_ADMIN, "rol": "ADMIN_HSEA", "alcance": "GLOBAL",
                  "motivo": "Arranque: Gerente HSE como primer administrador de roles"}]
    seed["sugerencias_empleado_roles"] = hsea + admin + suggestions

    # Validaciones de integridad (las mismas FK que exige la BD).
    for e in employees:
        if e["jefe_no_empleado"] is not None and e["jefe_no_empleado"] not in by_number:
            warnings.append(f"Empleado {e['no_empleado']}: jefe {e['jefe_no_empleado']} no está en el seed (quedará sin jefe)")
        if e["fecha_baja"] and e["activo"]:
            warnings.append(f"Empleado {e['no_empleado']}: activo pero con fecha de baja")
        if not e["fecha_baja"] and not e["activo"]:
            warnings.append(f"Empleado {e['no_empleado']}: inactivo sin fecha de baja")

    target.write_text(json.dumps(seed, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    active = sum(1 for e in employees if e["activo"])
    print(f"Escrito: {target}")
    print(f"Líneas {len(seed['lineas_mando'])} | Deptos {len(seed['departamentos'])} | Subdeptos {len(seed['subdepartamentos'])}")
    print(f"Empleados {len(employees)} ({active} activos, {len(employees) - active} bajas)")
    print(f"Cargos de área {len(posts)} | Reglas RH {len(rules)} | Cursos {len(courses)}")
    print(f"Capacitaciones {len(trainings)} ({skipped} omitidas) | Sugerencias de rol {len(seed['sugerencias_empleado_roles'])}")
    print(f"Avisos: {len(warnings)}")
    for w in warnings:
        print("  -", w)


if __name__ == "__main__":
    main()
