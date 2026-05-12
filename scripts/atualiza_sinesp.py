from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin

import pandas as pd
import requests


PAGE_URL = (
    "https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/"
    "estatistica/dados-nacionais-1/"
    "base-de-dados-e-notas-metodologicas-dos-gestores-estaduais-sinesp-vde-2022-e-2023"
)
DOWNLOAD_RE = re.compile(r'href="([^"]*bancovde-(\d{4})\.xlsx/@@download/file[^"]*)"', re.I)
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; analisador-temporal-sinesp/1.0; +https://github.com/tuka1965-glitch/analisador-temporal)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
}
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
LIKELY_COLUMNS = {
    "uf",
    "municipio",
    "evento",
    "data_referencia",
    "total_vitima",
    "total",
    "feminino",
    "masculino",
}
DATE_COLUMNS = ["data_referencia", "mes_de_data_referencia", "mes_data_referencia", "data", "mes"]
UF_COLUMNS = ["uf", "sigla_uf", "estado", "unidade_federativa"]
EVENT_COLUMNS = ["evento", "indicador", "natureza", "tipo_indicador", "crime"]
VALUE_COLUMNS = ["total_vitima", "total", "feminino", "masculino", "nao_informado"]


def normalize_column(value: object) -> str:
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text or "coluna"


def unique_columns(columns: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result: list[str] = []
    for column in columns:
        count = seen.get(column, 0)
        seen[column] = count + 1
        result.append(column if count == 0 else f"{column}_{count + 1}")
    return result


def get_with_retries(url: str, timeout: int, attempts: int = 6) -> requests.Response:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(url, headers=HTTP_HEADERS, timeout=timeout)
            if response.status_code not in RETRY_STATUS_CODES:
                response.raise_for_status()
                return response
            last_error = requests.HTTPError(
                f"{response.status_code} Server Error for url: {url}",
                response=response,
            )
        except requests.RequestException as error:
            last_error = error

        if attempt < attempts:
            wait_seconds = min(90, 8 * attempt)
            print(f"Tentativa {attempt}/{attempts} falhou para {url}. Nova tentativa em {wait_seconds}s.")
            time.sleep(wait_seconds)

    if isinstance(last_error, requests.HTTPError) and last_error.response is not None:
        last_error.response.raise_for_status()
    raise RuntimeError(f"Falha ao baixar {url}") from last_error


def discover_downloads() -> dict[int, str]:
    response = get_with_retries(PAGE_URL, timeout=60)
    downloads: dict[int, str] = {}
    for href, year_text in DOWNLOAD_RE.findall(response.text):
        year = int(year_text)
        downloads[year] = urljoin(PAGE_URL, unquote(href))
    return dict(sorted(downloads.items()))


def header_score(columns: list[str], row_count: int) -> int:
    normalized = set(columns)
    score = sum(100 for column in normalized if column in LIKELY_COLUMNS)
    if "data_referencia" in normalized or "mes" in normalized or "ano" in normalized:
        score += 100
    if "uf" in normalized or "estado" in normalized:
        score += 100
    return score + min(row_count, 1000)


def first_existing(columns: pd.Index, candidates: list[str]) -> str:
    for candidate in candidates:
        if candidate in columns:
            return candidate
    return ""


def normalize_number_series(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce").fillna(0)
    text = series.fillna("").astype(str).str.strip()
    text = text.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    return pd.to_numeric(text, errors="coerce").fillna(0)


def make_analysis_table(df: pd.DataFrame) -> pd.DataFrame:
    date_field = first_existing(df.columns, DATE_COLUMNS)
    uf_field = first_existing(df.columns, UF_COLUMNS)
    event_field = first_existing(df.columns, EVENT_COLUMNS)
    value_fields = [column for column in VALUE_COLUMNS if column in df.columns]

    if not date_field or not uf_field or not event_field or not value_fields:
        missing = []
        if not date_field:
            missing.append("data")
        if not uf_field:
            missing.append("uf")
        if not event_field:
            missing.append("evento")
        if not value_fields:
            missing.append("valor")
        raise ValueError(f"Colunas obrigatorias ausentes para agregacao: {', '.join(missing)}")

    result = pd.DataFrame(
        {
            "data_referencia": df[date_field],
            "uf": df[uf_field].fillna("").astype(str).str.strip(),
            "evento": df[event_field].fillna("").astype(str).str.strip(),
        }
    )
    parsed_dates = pd.to_datetime(result["data_referencia"], errors="coerce", dayfirst=True)
    result["data_referencia"] = parsed_dates.dt.strftime("%Y-%m-%d").fillna(
        result["data_referencia"].fillna("").astype(str).str.strip()
    )

    for value_field in value_fields:
        result[value_field] = normalize_number_series(df[value_field])

    result = result[(result["data_referencia"] != "") & (result["uf"] != "") & (result["evento"] != "")]
    grouped = (
        result.groupby(["data_referencia", "uf", "evento"], as_index=False)[value_fields]
        .sum()
        .sort_values(["data_referencia", "uf", "evento"])
    )
    return grouped


def read_best_table(xlsx_path: Path) -> pd.DataFrame:
    book = pd.read_excel(xlsx_path, sheet_name=None, header=None, dtype=object, engine="openpyxl")
    best_df: pd.DataFrame | None = None
    best_score = -1

    for raw in book.values():
        raw = raw.dropna(how="all").dropna(axis=1, how="all")
        if raw.empty:
            continue
        max_header_row = min(12, len(raw))
        for header_row in range(max_header_row):
            columns = unique_columns([normalize_column(value) for value in raw.iloc[header_row].tolist()])
            if len(set(columns)) <= 1:
                continue
            df = raw.iloc[header_row + 1 :].copy()
            df.columns = columns
            df = df.dropna(how="all")
            score = header_score(columns, len(df))
            if score > best_score:
                best_score = score
                best_df = df

    if best_df is None or best_df.empty:
        raise ValueError(f"Nenhuma tabela encontrada em {xlsx_path.name}")

    best_df = best_df.dropna(how="all").copy()
    for column in best_df.columns:
        if pd.api.types.is_datetime64_any_dtype(best_df[column]):
            best_df[column] = best_df[column].dt.strftime("%Y-%m-%d")
    return best_df


def parse_years(value: str | None, available: list[int]) -> list[int]:
    if not value or value.lower() == "all":
        return available
    selected: set[int] = set()
    for part in value.split(","):
        part = part.strip()
        if "-" in part:
            start, end = [int(item.strip()) for item in part.split("-", 1)]
            selected.update(range(start, end + 1))
        elif part:
            selected.add(int(part))
    return [year for year in available if year in selected]


def update_data(output_dir: Path, years_arg: str | None, keep_xlsx: bool) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = output_dir / "_fonte_xlsx"
    cache_dir.mkdir(parents=True, exist_ok=True)

    downloads = discover_downloads()
    years = parse_years(years_arg, list(downloads))
    if not years:
        raise ValueError("Nenhum ano selecionado entre os arquivos disponiveis.")

    manifest_files = []
    all_frames = []
    for year in years:
        source_url = downloads[year]
        xlsx_path = cache_dir / f"bancovde-{year}.xlsx"
        csv_path = output_dir / f"sinesp_vde_{year}.csv"

        print(f"Baixando {year}: {source_url}")
        response = get_with_retries(source_url, timeout=180)
        xlsx_path.write_bytes(response.content)

        raw_df = read_best_table(xlsx_path)
        df = make_analysis_table(raw_df)
        df.insert(0, "ano_arquivo", year)
        df.to_csv(csv_path, index=False, encoding="utf-8-sig")
        all_frames.append(df)
        manifest_files.append(
            {
                "year": year,
                "path": f"data/{csv_path.name}",
                "rows": int(len(df)),
                "source": source_url,
            }
        )

        if not keep_xlsx:
            xlsx_path.unlink(missing_ok=True)

    combined = pd.concat(all_frames, ignore_index=True)
    combined_path = output_dir / "sinesp_vde.csv"
    combined.to_csv(combined_path, index=False, encoding="utf-8-sig")

    manifest = {
        "source_page": PAGE_URL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "rows": int(len(combined)),
        "files": manifest_files,
    }
    (output_dir / "sinesp_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if not keep_xlsx:
        try:
            cache_dir.rmdir()
        except OSError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Atualiza a base SINESP VDE oficial em CSV.")
    parser.add_argument("--output-dir", default="data", type=Path)
    parser.add_argument("--years", default=None, help="Ex.: all, 2024,2025,2026 ou 2015-2026.")
    parser.add_argument("--keep-xlsx", action="store_true", help="Mantem os XLSX baixados em data/_fonte_xlsx.")
    args = parser.parse_args()
    update_data(args.output_dir, args.years, args.keep_xlsx)


if __name__ == "__main__":
    main()
