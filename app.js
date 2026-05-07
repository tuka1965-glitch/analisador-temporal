const state = {
  rows: [],
  headers: [],
  filteredGroups: new Set(),
  filteredUfs: new Set(),
  filteredIndicators: new Set(),
};

const likelyFields = {
  date: ["data_referencia", "data referencia", "mes de data referencia", "mes data referencia", "date", "data"],
  value: ["total_vitima", "total vitima", "total vitima", "total", "valor"],
  uf: ["uf", "estado", "sigla uf", "unidade federativa"],
  indicator: ["evento", "indicador", "tipo indicador", "crime", "natureza"],
  group: ["evento", "uf", "municipio"],
};

const els = {
  fileInput: document.getElementById("fileInput"),
  dateField: document.getElementById("dateField"),
  valueField: document.getElementById("valueField"),
  dateFormat: document.getElementById("dateFormat"),
  ufField: document.getElementById("ufField"),
  indicatorField: document.getElementById("indicatorField"),
  groupField: document.getElementById("groupField"),
  periodField: document.getElementById("periodField"),
  movingAverage: document.getElementById("movingAverage"),
  analyzeButton: document.getElementById("analyzeButton"),
  rowCount: document.getElementById("rowCount"),
  totalValue: document.getElementById("totalValue"),
  trendValue: document.getElementById("trendValue"),
  anomalyCount: document.getElementById("anomalyCount"),
  skippedRows: document.getElementById("skippedRows"),
  warningBox: document.getElementById("warningBox"),
  analysisText: document.getElementById("analysisText"),
  copyAnalysis: document.getElementById("copyAnalysis"),
  preStart: document.getElementById("preStart"),
  preEnd: document.getElementById("preEnd"),
  postStart: document.getElementById("postStart"),
  postEnd: document.getElementById("postEnd"),
  territorialThreshold: document.getElementById("territorialThreshold"),
  fallingUfCount: document.getElementById("fallingUfCount"),
  medianUfChange: document.getElementById("medianUfChange"),
  nationalChange: document.getElementById("nationalChange"),
  generalizationLabel: document.getElementById("generalizationLabel"),
  territorialText: document.getElementById("territorialText"),
  territorialBody: document.getElementById("territorialBody"),
  copyTerritorial: document.getElementById("copyTerritorial"),
  chart: document.getElementById("chart"),
  chartSubtitle: document.getElementById("chartSubtitle"),
  ufFilters: document.getElementById("ufFilters"),
  indicatorFilters: document.getElementById("indicatorFilters"),
  filters: document.getElementById("filters"),
  selectAllUfs: document.getElementById("selectAllUfs"),
  selectAllIndicators: document.getElementById("selectAllIndicators"),
  selectAllGroups: document.getElementById("selectAllGroups"),
  summaryBody: document.getElementById("summaryBody"),
};

els.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.name.toLowerCase().endsWith(".twbx")) {
    showTwbxNotice(file.name);
    return;
  }
  const text = await file.text();
  const parsed = parseCsv(text);
  state.headers = parsed.headers;
  state.rows = parsed.rows;
  state.filteredGroups.clear();
  state.filteredUfs.clear();
  state.filteredIndicators.clear();
  populateControls();
  buildAllFilters();
  els.analyzeButton.disabled = false;
  analyze();
});

for (const element of [els.dateField, els.valueField, els.dateFormat, els.periodField, els.movingAverage]) {
  element.addEventListener("change", analyze);
}
for (const element of [els.preStart, els.preEnd, els.postStart, els.postEnd, els.territorialThreshold]) {
  element.addEventListener("change", analyze);
}
els.ufField.addEventListener("change", () => resetDimensionFilter(state.filteredUfs, els.ufFilters, buildUfFilters));
els.indicatorField.addEventListener("change", () =>
  resetDimensionFilter(state.filteredIndicators, els.indicatorFilters, buildIndicatorFilters),
);
els.groupField.addEventListener("change", () => resetDimensionFilter(state.filteredGroups, els.filters, buildGroupFilters));
els.analyzeButton.addEventListener("click", analyze);
els.selectAllUfs.addEventListener("click", () => clearFilterSet(state.filteredUfs, buildUfFilters));
els.selectAllIndicators.addEventListener("click", () => clearFilterSet(state.filteredIndicators, buildIndicatorFilters));
els.selectAllGroups.addEventListener("click", () => clearFilterSet(state.filteredGroups, buildGroupFilters));
els.copyAnalysis.addEventListener("click", async () => {
  const text = els.analysisText.innerText.trim();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  els.copyAnalysis.textContent = "Copiado";
  setTimeout(() => {
    els.copyAnalysis.textContent = "Copiar";
  }, 1200);
});
els.copyTerritorial.addEventListener("click", async () => {
  const text = els.territorialText.innerText.trim();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  els.copyTerritorial.textContent = "Copiado";
  setTimeout(() => {
    els.copyTerritorial.textContent = "Copiar";
  }, 1200);
});

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let current = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      current.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      current.push(field.trim());
      if (current.some(Boolean)) rows.push(current);
      current = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || current.length) {
    current.push(field.trim());
    rows.push(current);
  }

  const headers = rows.shift().map(cleanHeader);
  return {
    headers,
    rows: rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))),
  };
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find(Boolean) || "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function cleanHeader(value) {
  return value.replace(/^\uFEFF/, "").trim();
}

function populateControls() {
  fillSelect(els.dateField, state.headers);
  fillSelect(els.valueField, state.headers);
  fillSelect(els.ufField, ["(nenhum)", ...state.headers]);
  fillSelect(els.indicatorField, ["(nenhum)", ...state.headers]);
  fillSelect(els.groupField, ["(sem comparacao)", ...state.headers]);
  selectLikely(els.dateField, likelyFields.date, (value) => Boolean(parseDate(value, "auto")));
  selectLikely(els.valueField, likelyFields.value, (value) => Number.isFinite(parseNumber(value)));
  selectLikely(els.ufField, likelyFields.uf);
  selectLikely(els.indicatorField, likelyFields.indicator);
  selectLikely(els.groupField, likelyFields.group);
  if (els.groupField.value === els.indicatorField.value || els.groupField.value === els.ufField.value) {
    els.groupField.value = "(sem comparacao)";
  }
}

function fillSelect(select, options) {
  select.innerHTML = "";
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option;
    node.textContent = option;
    select.appendChild(node);
  }
}

function selectLikely(select, candidates, validator) {
  const options = Array.from(select.options);
  const match = options.find((option) => candidates.includes(normalizeHeaderForMatch(option.value)));
  if (match) select.value = match.value;
  else if (validator) select.value = inferField(validator) || select.value;
}

function inferField(validator) {
  let best = "";
  let bestScore = -1;
  for (const header of state.headers) {
    let score = 0;
    for (const row of state.rows.slice(0, 50)) {
      if (validator(row[header])) score += 1;
    }
    if (score > bestScore) {
      best = header;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : "";
}

function normalizeHeaderForMatch(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function showTwbxNotice(fileName) {
  state.rows = [];
  state.headers = [];
  els.analyzeButton.disabled = true;
  els.warningBox.hidden = false;
  els.warningBox.textContent = `${fileName} e um pacote Tableau com extrato .hyper. Este app de navegador nao consegue ler as linhas do Hyper diretamente; exporte a fonte de dados ou uma crosstab completa para CSV com as colunas uf, evento, data_referencia e total/total_vitima.`;
  els.analysisText.textContent = "Carregue um CSV exportado do Tableau para gerar a leitura por UF e indicador.";
  els.copyAnalysis.disabled = true;
}

function resetDimensionFilter(filterSet, container, builder) {
  filterSet.clear();
  container.innerHTML = "";
  builder();
  analyze();
}

function clearFilterSet(filterSet, builder) {
  filterSet.clear();
  builder();
  analyze();
}

function buildAllFilters() {
  buildUfFilters();
  buildIndicatorFilters();
  buildGroupFilters();
}

function buildUfFilters() {
  buildDimensionFilter({
    field: els.ufField.value,
    container: els.ufFilters,
    filtered: state.filteredUfs,
    selectAllButton: els.selectAllUfs,
    maxValues: 40,
  });
}

function buildIndicatorFilters() {
  buildDimensionFilter({
    field: els.indicatorField.value,
    container: els.indicatorFilters,
    filtered: state.filteredIndicators,
    selectAllButton: els.selectAllIndicators,
    maxValues: 80,
  });
}

function buildGroupFilters() {
  buildDimensionFilter({
    field: els.groupField.value,
    container: els.filters,
    filtered: state.filteredGroups,
    selectAllButton: els.selectAllGroups,
    maxValues: 80,
    emptyValue: "(sem comparacao)",
  });
}

function buildDimensionFilter({ field, container, filtered, selectAllButton, maxValues, emptyValue = "(nenhum)" }) {
  container.innerHTML = "";
  selectAllButton.disabled = true;
  if (!field || field === emptyValue || field === "(nenhum)") return;

  const counts = new Map();
  for (const row of state.rows) {
    const key = row[field] || "(vazio)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const values = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxValues);

  for (const [value, count] of values) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !filtered.has(value);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) filtered.delete(value);
      else filtered.add(value);
      analyze();
    });
    label.append(checkbox, `${value} (${count})`);
    container.appendChild(label);
  }
  selectAllButton.disabled = values.length === 0;
}

function analyze() {
  if (!state.rows.length) return;
  if (!els.ufFilters.children.length && els.ufField.value !== "(nenhum)") buildUfFilters();
  if (!els.indicatorFilters.children.length && els.indicatorField.value !== "(nenhum)") buildIndicatorFilters();
  if (!els.filters.children.length && els.groupField.value !== "(sem comparacao)") buildGroupFilters();

  const dateField = els.dateField.value;
  const valueField = els.valueField.value;
  const ufField = els.ufField.value;
  const indicatorField = els.indicatorField.value;
  const groupField = els.groupField.value;
  const period = els.periodField.value;
  const windowSize = Math.max(1, Number(els.movingAverage.value) || 1);

  const buckets = new Map();
  let usedRows = 0;
  let skippedRows = 0;
  const badDateSamples = new Set();
  const badValueSamples = new Set();

  for (const row of state.rows) {
    const uf = ufField === "(nenhum)" ? "" : row[ufField] || "(vazio)";
    const indicator = indicatorField === "(nenhum)" ? "" : row[indicatorField] || "(vazio)";
    const group = groupField === "(sem comparacao)" ? "" : row[groupField] || "(vazio)";
    if (uf && state.filteredUfs.has(uf)) continue;
    if (indicator && state.filteredIndicators.has(indicator)) continue;
    if (group && state.filteredGroups.has(group)) continue;

    const date = parseDate(row[dateField], els.dateFormat.value);
    const value = parseNumber(row[valueField]);
    if (!date || !Number.isFinite(value)) {
      skippedRows += 1;
      if (!date && badDateSamples.size < 3) badDateSamples.add(row[dateField]);
      if (!Number.isFinite(value) && badValueSamples.size < 3) badValueSamples.add(row[valueField]);
      continue;
    }

    const key = periodKey(date, period);
    buckets.set(key, (buckets.get(key) || 0) + value);
    usedRows += 1;
  }

  const series = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));

  addMovingAverage(series, windowSize);
  addChangeAndAnomalies(series);
  updateMetrics(series, usedRows, skippedRows);
  updateWarnings(series, skippedRows, badDateSamples, badValueSamples);
  drawChart(series);
  renderTable(series);
  renderNarrative(series, { dateField, valueField, ufField, indicatorField, groupField, period });
  renderTerritorialGeneralization({ dateField, valueField, ufField, indicatorField, groupField });
}

function parseDate(value, format = "auto") {
  if (!value) return null;
  const trimmed = String(value).trim();
  const normalized = normalizeDateText(trimmed);

  if (format === "excel" || (/^\d{5,6}(\.0+)?$/.test(normalized) && format === "auto")) {
    return excelSerialDate(Number(normalized));
  }

  let match = normalized.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3] || 1));

  match = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = normalizeYear(Number(match[3]));
    if (format === "mdy") return validDate(year, first, second);
    if (format === "dmy") return validDate(year, second, first);
    if (first > 12) return validDate(year, second, first);
    if (second > 12) return validDate(year, first, second);
    return validDate(year, second, first);
  }

  match = normalized.match(/^(\d{1,2})[-/](\d{4})$/);
  if (match) return validDate(Number(match[2]), Number(match[1]), 1);

  match = normalized.match(/^(\d{4})[-/](\d{1,2})$/);
  if (match) return validDate(Number(match[1]), Number(match[2]), 1);

  match = normalized.match(/^([a-z]+)[\s/-]+(\d{4})$/);
  if (match && monthNames[match[1]] != null) return validDate(Number(match[2]), monthNames[match[1]] + 1, 1);

  match = normalized.match(/^(\d{4})[\s/-]+([a-z]+)$/);
  if (match && monthNames[match[2]] != null) return validDate(Number(match[1]), monthNames[match[2]] + 1, 1);

  return null;
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  let cleaned = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[^\d,.\-]/g, "");

  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma > -1 && dot > -1) {
    cleaned = comma > dot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (comma > -1) {
    cleaned = cleaned.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  } else if (dot > -1) {
    const decimals = cleaned.length - dot - 1;
    if (decimals === 3 && cleaned.split(".").length === 2) cleaned = cleaned.replace(".", "");
  }
  return Number(cleaned);
}

const monthNames = {
  janeiro: 0,
  jan: 0,
  fevereiro: 1,
  fev: 1,
  marco: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  maio: 4,
  mai: 4,
  junho: 5,
  jun: 5,
  julho: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  setembro: 8,
  set: 8,
  outubro: 9,
  out: 9,
  novembro: 10,
  nov: 10,
  dezembro: 11,
  dez: 11,
};

function normalizeDateText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+de\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validDate(year, month, day) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function normalizeYear(year) {
  return year < 100 ? 2000 + year : year;
}

function excelSerialDate(serial) {
  if (!Number.isFinite(serial)) return null;
  const date = new Date(Date.UTC(1899, 11, 30));
  date.setUTCDate(date.getUTCDate() + Math.floor(serial));
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function periodKey(date, period) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (period === "year") return String(year);
  if (period === "quarter") return `${year}-T${Math.ceil(month / 3)}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMovingAverage(series, size) {
  for (let index = 0; index < series.length; index += 1) {
    const start = Math.max(0, index - size + 1);
    const slice = series.slice(start, index + 1);
    series[index].movingAverage = slice.reduce((sum, point) => sum + point.value, 0) / slice.length;
  }
}

function addChangeAndAnomalies(series) {
  const values = series.map((point) => point.value);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1);
  const sd = Math.sqrt(variance);

  for (let index = 0; index < series.length; index += 1) {
    const prev = series[index - 1]?.value;
    series[index].change = prev ? (series[index].value - prev) / prev : 0;
    series[index].anomaly = sd > 0 && Math.abs(series[index].value - mean) / sd >= 2;
  }
}

function updateMetrics(series, usedRows, skippedRows) {
  const total = series.reduce((sum, point) => sum + point.value, 0);
  const slope = linearSlope(series.map((point, index) => [index, point.value]));
  const anomalies = series.filter((point) => point.anomaly).length;

  els.rowCount.textContent = usedRows.toLocaleString("pt-BR");
  els.totalValue.textContent = formatNumber(total);
  els.trendValue.textContent = slope > 0 ? `Alta (${formatNumber(slope)}/periodo)` : slope < 0 ? `Queda (${formatNumber(slope)}/periodo)` : "Estavel";
  els.trendValue.className = slope > 0 ? "up" : slope < 0 ? "down" : "flat";
  els.anomalyCount.textContent = anomalies.toLocaleString("pt-BR");
  els.skippedRows.textContent = skippedRows.toLocaleString("pt-BR");
  els.chartSubtitle.textContent = `${series.length} periodos analisados`;
}

function updateWarnings(series, skippedRows, badDateSamples, badValueSamples) {
  const messages = [];
  if (skippedRows > 0) {
    messages.push(`${skippedRows.toLocaleString("pt-BR")} linhas foram ignoradas por data ou valor invalido.`);
  }
  if (badDateSamples.size) {
    messages.push(`Amostras de data nao lidas: ${Array.from(badDateSamples).join(", ")}.`);
  }
  if (badValueSamples.size) {
    messages.push(`Amostras de valor nao lidas: ${Array.from(badValueSamples).join(", ")}.`);
  }
  if (series.length && hasGaps(series)) {
    messages.push("Ha meses sem registros na serie. Se esses meses deveriam aparecer, verifique o formato da data ou exporte a tabela de dados completa, nao apenas a crosstab agregada.");
  }
  els.warningBox.hidden = messages.length === 0;
  els.warningBox.textContent = messages.join(" ");
}

function hasGaps(series) {
  if (els.periodField.value !== "month" || series.length < 2) return false;
  for (let index = 1; index < series.length; index += 1) {
    const [previousYear, previousMonth] = series[index - 1].key.split("-").map(Number);
    const [year, month] = series[index].key.split("-").map(Number);
    const distance = (year - previousYear) * 12 + (month - previousMonth);
    if (distance > 1) return true;
  }
  return false;
}

function linearSlope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const sumX = points.reduce((sum, point) => sum + point[0], 0);
  const sumY = points.reduce((sum, point) => sum + point[1], 0);
  const sumXY = points.reduce((sum, point) => sum + point[0] * point[1], 0);
  const sumXX = points.reduce((sum, point) => sum + point[0] ** 2, 0);
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX ** 2);
}

function drawChart(series) {
  const svg = els.chart;
  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 410;
  const pad = { top: 20, right: 24, bottom: 46, left: 70 };
  const values = series.flatMap((point) => [point.value, point.movingAverage]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const xStep = series.length > 1 ? (width - pad.left - pad.right) / (series.length - 1) : 0;
  const y = (value) => height - pad.bottom - ((value - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const x = (index) => pad.left + index * xStep;
  const path = (field) => series.map((point, index) => `${index ? "L" : "M"} ${x(index)} ${y(point[field])}`).join(" ");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="#cfd8d5" />
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="#cfd8d5" />
    <text x="${pad.left - 8}" y="${y(max) + 4}" text-anchor="end" font-size="12" fill="#647075">${formatNumber(max)}</text>
    <text x="${pad.left - 8}" y="${y(min) + 4}" text-anchor="end" font-size="12" fill="#647075">${formatNumber(min)}</text>
    <path d="${path("value")}" fill="none" stroke="#2563eb" stroke-width="3" />
    <path d="${path("movingAverage")}" fill="none" stroke="#0f766e" stroke-width="3" stroke-dasharray="7 5" />
    ${series
      .map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="${point.anomaly ? 5 : 3}" fill="${point.anomaly ? "#b42318" : "#2563eb"}"><title>${point.key}: ${formatNumber(point.value)}</title></circle>`)
      .join("")}
    <text x="${pad.left}" y="${height - 14}" font-size="12" fill="#647075">${series[0]?.key || ""}</text>
    <text x="${width - pad.right}" y="${height - 14}" text-anchor="end" font-size="12" fill="#647075">${series.at(-1)?.key || ""}</text>
  `;
}

function renderTable(series) {
  els.summaryBody.innerHTML = "";
  for (const point of series) {
    const tr = document.createElement("tr");
    const direction = point.change > 0 ? "up" : point.change < 0 ? "down" : "flat";
    tr.innerHTML = `
      <td>${point.key}</td>
      <td>${formatNumber(point.value)}</td>
      <td>${formatNumber(point.movingAverage)}</td>
      <td class="${direction}">${formatPercent(point.change)}</td>
      <td>${point.anomaly ? "Anomalia" : "Normal"}</td>
    `;
    els.summaryBody.appendChild(tr);
  }
}

function renderNarrative(series, context) {
  if (!series.length) {
    els.analysisText.textContent = "Nao ha pontos validos suficientes para analisar a serie.";
    els.copyAnalysis.disabled = true;
    return;
  }

  const total = series.reduce((sum, point) => sum + point.value, 0);
  const first = series[0];
  const last = series.at(-1);
  const peak = maxBy(series, (point) => point.value);
  const trough = minBy(series, (point) => point.value);
  const slope = linearSlope(series.map((point, index) => [index, point.value]));
  const overallChange = first.value ? (last.value - first.value) / first.value : 0;
  const average = total / series.length;
  const volatility = coefficientOfVariation(series.map((point) => point.value));
  const abrupt = abruptChanges(series).slice(0, 4);
  const seasonal = seasonalitySummary(series, context.period);
  const anomalies = series.filter((point) => point.anomaly);
  const direction = slope > average * 0.01 ? "alta" : slope < -average * 0.01 ? "queda" : "estabilidade";
  const intensity =
    Math.abs(overallChange) >= 0.5 ? "forte" : Math.abs(overallChange) >= 0.15 ? "moderada" : "suave";
  const anomalyText = anomalies.length
    ? `Pelo criterio estatistico simples de dois desvios-padrao, ${anomalies.length} ponto(s) tambem foram marcados como anomalia: ${anomalies
        .map((point) => point.key)
        .slice(0, 6)
        .join(", ")}.`
    : "Nenhum ponto ultrapassou o criterio simples de anomalia por dois desvios-padrao, mas as variacoes percentuais ainda ajudam a localizar rupturas operacionais ou mudancas de cobertura da base.";
  const abruptText = abrupt.length
    ? `As quebras mais abruptas aparecem em ${abrupt.map((item) => `${item.key} (${formatPercent(item.change)} frente ao periodo anterior)`).join(", ")}. ${anomalyText}`
    : `A serie nao apresenta quebras abruptas expressivas entre periodos consecutivos. ${anomalyText}`;

  const paragraphs = [
    `A serie historica de ${context.valueField}${activeFilterSummary(context)} cobre ${series.length} periodos, de ${first.key} a ${last.key}, somando ${formatNumber(total)} no intervalo. O primeiro periodo registra ${formatNumber(first.value)} e o ultimo ${formatNumber(last.value)}, o que representa uma variacao acumulada de ${formatPercent(overallChange)}. Pela inclinacao estimada da reta de tendencia, a leitura geral e de ${direction} ${intensity}, com mudanca media aproximada de ${formatNumber(slope)} por periodo.`,
    `O maior valor observado ocorre em ${peak.key}, com ${formatNumber(peak.value)}, enquanto o menor aparece em ${trough.key}, com ${formatNumber(trough.value)}. A media da serie e ${formatNumber(average)} por periodo. A volatilidade relativa e ${formatPercent(volatility)}, ${volatility >= 0.25 ? "indicando oscilacao relevante em torno da media" : volatility >= 0.12 ? "sugerindo variacao moderada" : "sugerindo uma serie relativamente regular"}.`,
    seasonal,
    abruptText,
    `Como leitura substantiva, vale tratar picos e quedas abruptas como pistas, nao como conclusoes finais. Em dados criminais, mudancas desse tipo podem refletir alteracao real da violencia, sazonalidade, revisao metodologica, atraso de registro, mudanca de cobertura territorial ou diferencas na forma de consolidacao do indicador. O proximo passo analitico recomendado e cruzar esses pontos com filtros por UF, municipio e tipo de evento, quando a base completa estiver disponivel.`,
  ];

  els.analysisText.innerHTML = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
  els.copyAnalysis.disabled = false;
}

function renderTerritorialGeneralization(context) {
  if (!state.rows.length || !context.ufField || context.ufField === "(nenhum)") {
    resetTerritorialPanel("Carregue um CSV com coluna de UF para avaliar se a tendencia e generalizada ou concentrada.");
    return;
  }

  const preStart = Number(els.preStart.value);
  const preEnd = Number(els.preEnd.value);
  const postStart = Number(els.postStart.value);
  const postEnd = Number(els.postEnd.value);
  const threshold = Math.max(0, Number(els.territorialThreshold.value) || 0) / 100;

  if (!preStart || !preEnd || !postStart || !postEnd || preStart > preEnd || postStart > postEnd) {
    resetTerritorialPanel("Defina janelas pre e pos validas para comparar a mudanca por UF.");
    return;
  }

  const byUf = new Map();
  let nationalPre = 0;
  let nationalPost = 0;
  let preRows = 0;
  let postRows = 0;

  for (const row of state.rows) {
    const date = parseDate(row[context.dateField], els.dateFormat.value);
    const value = parseNumber(row[context.valueField]);
    if (!date || !Number.isFinite(value)) continue;

    const uf = row[context.ufField] || "(vazio)";
    const indicator =
      context.indicatorField && context.indicatorField !== "(nenhum)" ? row[context.indicatorField] || "(vazio)" : "";
    const group = context.groupField && context.groupField !== "(sem comparacao)" ? row[context.groupField] || "(vazio)" : "";
    if (state.filteredUfs.has(uf)) continue;
    if (indicator && state.filteredIndicators.has(indicator)) continue;
    if (group && state.filteredGroups.has(group)) continue;

    const year = date.getFullYear();
    const bucket = byUf.get(uf) || { uf, pre: 0, post: 0, prePeriods: new Set(), postPeriods: new Set() };
    if (year >= preStart && year <= preEnd) {
      bucket.pre += value;
      bucket.prePeriods.add(periodKey(date, "month"));
      nationalPre += value;
      preRows += 1;
    } else if (year >= postStart && year <= postEnd) {
      bucket.post += value;
      bucket.postPeriods.add(periodKey(date, "month"));
      nationalPost += value;
      postRows += 1;
    }
    byUf.set(uf, bucket);
  }

  const ufResults = Array.from(byUf.values())
    .map((item) => {
      const preAverage = item.prePeriods.size ? item.pre / item.prePeriods.size : 0;
      const postAverage = item.postPeriods.size ? item.post / item.postPeriods.size : 0;
      const change = preAverage ? (postAverage - preAverage) / preAverage : null;
      return {
        uf: item.uf,
        preAverage,
        postAverage,
        change,
        className: classifyChange(change, threshold),
      };
    })
    .filter((item) => item.change !== null && item.preAverage > 0 && item.postAverage > 0)
    .sort((a, b) => a.change - b.change);

  if (!ufResults.length || !preRows || !postRows) {
    resetTerritorialPanel("Nao ha dados suficientes nas janelas pre e pos para comparar as UFs selecionadas.");
    return;
  }

  const falling = ufResults.filter((item) => item.change < -threshold);
  const rising = ufResults.filter((item) => item.change > threshold);
  const stable = ufResults.length - falling.length - rising.length;
  const medianChange = median(ufResults.map((item) => item.change));
  const nationalChangeValue = nationalPre ? (nationalPost / postWindowMonths(postStart, postEnd) - nationalPre / postWindowMonths(preStart, preEnd)) / (nationalPre / postWindowMonths(preStart, preEnd)) : 0;
  const diagnosis = generalizationDiagnosis(falling.length, rising.length, stable, ufResults.length, medianChange, nationalChangeValue, threshold);

  els.fallingUfCount.textContent = `${falling.length}/${ufResults.length}`;
  els.medianUfChange.textContent = formatPercent(medianChange);
  els.medianUfChange.className = medianChange < -threshold ? "down" : medianChange > threshold ? "up" : "flat";
  els.nationalChange.textContent = formatPercent(nationalChangeValue);
  els.nationalChange.className = nationalChangeValue < -threshold ? "down" : nationalChangeValue > threshold ? "up" : "flat";
  els.generalizationLabel.textContent = diagnosis.label;
  els.generalizationLabel.className = diagnosis.className;

  renderTerritorialTable(ufResults);
  renderTerritorialText({
    ufResults,
    falling,
    rising,
    stable,
    medianChange,
    nationalChangeValue,
    diagnosis,
    threshold,
    preStart,
    preEnd,
    postStart,
    postEnd,
    context,
  });
}

function resetTerritorialPanel(message) {
  els.fallingUfCount.textContent = "0";
  els.medianUfChange.textContent = "-";
  els.nationalChange.textContent = "-";
  els.generalizationLabel.textContent = "-";
  els.territorialText.textContent = message;
  els.territorialBody.innerHTML = '<tr><td colspan="5">Sem dados territoriais ainda.</td></tr>';
  els.copyTerritorial.disabled = true;
}

function classifyChange(change, threshold) {
  if (change === null || !Number.isFinite(change)) return "sem dado";
  if (change <= -threshold * 2) return "queda forte";
  if (change < -threshold) return "queda moderada";
  if (change >= threshold * 2) return "aumento forte";
  if (change > threshold) return "aumento moderado";
  return "estavel";
}

function generalizationDiagnosis(falling, rising, stable, total, medianChange, nationalChangeValue, threshold) {
  const shareFalling = falling / total;
  const shareRising = rising / total;
  if (nationalChangeValue < -threshold && medianChange < -threshold && shareFalling >= 0.7) {
    return { label: "queda generalizada", className: "down" };
  }
  if (nationalChangeValue < -threshold && shareFalling >= 0.5) {
    return { label: "queda ampla, mas desigual", className: "down" };
  }
  if (nationalChangeValue < -threshold && medianChange >= -threshold) {
    return { label: "queda concentrada", className: "flat" };
  }
  if (nationalChangeValue > threshold && medianChange > threshold && shareRising >= 0.7) {
    return { label: "aumento generalizado", className: "up" };
  }
  if (Math.abs(nationalChangeValue) <= threshold && stable / total >= 0.5) {
    return { label: "estabilidade ampla", className: "flat" };
  }
  if (shareFalling >= 0.4 && shareRising >= 0.4) {
    return { label: "padrao divergente", className: "flat" };
  }
  return { label: "mudanca heterogenea", className: "flat" };
}

function renderTerritorialTable(results) {
  els.territorialBody.innerHTML = "";
  for (const item of results) {
    const direction = item.change < 0 ? "down" : item.change > 0 ? "up" : "flat";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.uf}</td>
      <td>${formatNumber(item.preAverage)}</td>
      <td>${formatNumber(item.postAverage)}</td>
      <td class="${direction}">${formatPercent(item.change)}</td>
      <td>${item.className}</td>
    `;
    els.territorialBody.appendChild(tr);
  }
}

function renderTerritorialText(details) {
  const {
    ufResults,
    falling,
    rising,
    stable,
    medianChange,
    nationalChangeValue,
    diagnosis,
    threshold,
    preStart,
    preEnd,
    postStart,
    postEnd,
    context,
  } = details;
  const strongestFalls = falling.slice(0, 5).map((item) => `${item.uf} (${formatPercent(item.change)})`);
  const strongestRises = rising
    .slice()
    .sort((a, b) => b.change - a.change)
    .slice(0, 5)
    .map((item) => `${item.uf} (${formatPercent(item.change)})`);
  const selectedIndicators = selectedFilterLabel(context.indicatorField, state.filteredIndicators);
  const scopeText = selectedIndicators ? ` para o indicador ${selectedIndicators}` : "";
  const paragraphs = [
    `A comparacao territorial${scopeText} usa ${preStart}-${preEnd} como periodo pre e ${postStart}-${postEnd} como periodo pos. Considerando um limiar de relevancia de ${formatPercent(threshold)}, ${falling.length} de ${ufResults.length} UFs apresentam queda, ${rising.length} apresentam aumento e ${stable} ficam em faixa de estabilidade. A variacao mediana das UFs e ${formatPercent(medianChange)}, enquanto o Brasil agregado varia ${formatPercent(nationalChangeValue)}.`,
    `O diagnostico automatico e: ${diagnosis.label}. Essa classificacao compara tres sinais: a direcao do agregado nacional, a mediana estadual e a proporcao de UFs que se movem na mesma direcao. Quando o agregado cai mas a mediana estadual nao acompanha, a queda tende a estar concentrada em poucas UFs de maior peso. Quando ambos caem e a maioria das UFs tambem cai, a evidencia favorece uma queda territorialmente generalizada.`,
    `${strongestFalls.length ? `As quedas mais fortes aparecem em ${strongestFalls.join(", ")}.` : "Nenhuma UF supera o limiar de queda relevante."} ${strongestRises.length ? `Na direcao oposta, os maiores aumentos aparecem em ${strongestRises.join(", ")}.` : "Nenhuma UF supera o limiar de aumento relevante."}`,
  ];
  els.territorialText.innerHTML = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
  els.copyTerritorial.disabled = false;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function postWindowMonths(startYear, endYear) {
  return Math.max(1, (endYear - startYear + 1) * 12);
}

function activeFilterSummary(context) {
  const parts = [];
  const ufLabel = selectedFilterLabel(context.ufField, state.filteredUfs);
  const indicatorLabel = selectedFilterLabel(context.indicatorField, state.filteredIndicators);
  if (ufLabel) parts.push(`UF: ${ufLabel}`);
  if (indicatorLabel) parts.push(`indicador: ${indicatorLabel}`);
  return parts.length ? ` (${parts.join("; ")})` : "";
}

function selectedFilterLabel(field, filtered) {
  if (!field || field === "(nenhum)") return "";
  const values = uniqueValues(field);
  const selected = values.filter((value) => !filtered.has(value));
  if (!selected.length || selected.length === values.length) return "todos";
  if (selected.length <= 4) return selected.join(", ");
  return `${selected.length} selecionados`;
}

function uniqueValues(field) {
  return Array.from(new Set(state.rows.map((row) => row[field] || "(vazio)"))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function abruptChanges(series) {
  return series
    .filter((point, index) => index > 0 && Number.isFinite(point.change))
    .map((point) => ({ key: point.key, change: point.change, magnitude: Math.abs(point.change) }))
    .sort((a, b) => b.magnitude - a.magnitude);
}

function seasonalitySummary(series, period) {
  if (period !== "month") {
    return "A avaliacao de sazonalidade fica limitada porque a serie nao esta em frequencia mensal. Para identificar meses sistematicamente mais altos ou baixos, use o periodo mensal.";
  }

  const byMonth = Array.from({ length: 12 }, () => []);
  for (const point of series) {
    const month = Number(point.key.slice(5, 7));
    if (month >= 1 && month <= 12) byMonth[month - 1].push(point.value);
  }

  const monthStats = byMonth
    .map((values, index) => ({
      index,
      name: monthLabels[index],
      count: values.length,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    }))
    .filter((item) => item.count >= 2);

  if (monthStats.length < 6) {
    return "Ainda ha poucos meses repetidos para uma leitura sazonal confiavel. Com mais anos na serie, o app consegue comparar o comportamento medio de cada mes.";
  }

  const highest = monthStats.slice().sort((a, b) => b.average - a.average).slice(0, 3);
  const lowest = monthStats.slice().sort((a, b) => a.average - b.average).slice(0, 3);
  const spread = highest[0].average && lowest[0].average ? (highest[0].average - lowest[0].average) / lowest[0].average : 0;

  return `Na sazonalidade mensal, os meses com media historica mais alta sao ${highest.map((item) => `${item.name} (${formatNumber(item.average)})`).join(", ")}. As menores medias aparecem em ${lowest.map((item) => `${item.name} (${formatNumber(item.average)})`).join(", ")}. A distancia entre o mes medio mais alto e o mais baixo e de ${formatPercent(spread)}, ${spread >= 0.2 ? "um sinal de sazonalidade expressiva" : spread >= 0.1 ? "um sinal de sazonalidade moderada" : "um sinal de sazonalidade fraca"}.`;
}

function coefficientOfVariation(values) {
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  if (!average) return 0;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(values.length, 1);
  return Math.sqrt(variance) / average;
}

function maxBy(values, iteratee) {
  return values.reduce((best, item) => (iteratee(item) > iteratee(best) ? item : best), values[0]);
}

function minBy(values, iteratee) {
  return values.reduce((best, item) => (iteratee(item) < iteratee(best) ? item : best), values[0]);
}

const monthLabels = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function formatNumber(value) {
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatPercent(value) {
  return Number(value).toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1 });
}
