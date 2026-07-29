import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Painel de Marketing — Bunker Vistos                                */
/*  Lê a aba MARKETING publicada no Google Sheets (CSV) e recalcula.   */
/*  O Sheets continua sendo o banco de dados. Metas ficam locais.      */
/* ------------------------------------------------------------------ */

const URL_KEY   = "bunker_mkt_url_v1";
const CACHE_KEY = "bunker_mkt_cache_v1";
const METAS_KEY = "bunker_marketing_metas_v1";
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const METAS_PADRAO = { roiMin: 100, cplMax: 40, invMensal: null };

// Armazenamento local do navegador (metas, último link e cache dos dados).
// Substitui o storage do artefato do Claude — aqui roda em site hospedado.
const store = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? { value: v } : null; } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch (_) {} },
};

/* --------------------------- helpers ------------------------------ */
const isNum = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(v);
const nn = (v) => (isNum(v) ? Number(v) : null);
const sum = (rows, k) => rows.reduce((a, r) => a + (nn(r[k]) ?? 0), 0);

const brl = (v) => (!isNum(v) ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const num = (v) => (!isNum(v) ? "—" : Number(v).toLocaleString("pt-BR"));
const pct = (v) => (!isNum(v) ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

// converte texto pt-BR ("R$ 1.225,00", "10,2%", "205") em número
function parseBR(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).replace(/R\$|%|\s|x|\u00a0/gi, "").trim();
  if (t === "" || t === "-") return null;
  const temPonto = t.includes("."), temVirg = t.includes(",");
  if (temPonto && temVirg) t = t.replace(/\./g, "").replace(",", ".");
  else if (temVirg) t = t.replace(",", ".");
  const v = Number(t);
  return Number.isNaN(v) ? null : v;
}

// parser de CSV (trata aspas, vírgulas e quebras dentro de campo)
function parseCSV(text) {
  const linhas = []; let campo = "", linha = [], dentroAspas = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (dentroAspas) {
      if (c === '"') { if (text[i + 1] === '"') { campo += '"'; i++; } else dentroAspas = false; }
      else campo += c;
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === ",") { linha.push(campo); campo = ""; }
      else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
      else if (c === "\r") { /* ignora */ }
      else campo += c;
    }
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

// localiza a tabela mensal dentro do CSV bagunçado da aba MARKETING
function extrairMeses(linhas) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  let head = -1, col = {};
  for (let i = 0; i < linhas.length; i++) {
    const cells = linhas[i].map(norm);
    const cMes = cells.indexOf("mês");
    const cAno = cells.indexOf("ano");
    if (cMes !== -1 && cAno !== -1 && cells.some((x) => x.startsWith("investimento"))) {
      head = i;
      col = {
        mes: cMes, ano: cAno,
        inv: cells.findIndex((x) => x.startsWith("investimento")),
        leads: cells.indexOf("leads"),
        vendas: cells.findIndex((x) => x.startsWith("vendas")),
        receita: cells.findIndex((x) => x.startsWith("receita")),
      };
      break;
    }
  }
  if (head === -1) return [];
  const out = [];
  const mesesLC = MESES.map((m) => m.toLowerCase());
  for (let i = head + 1; i < linhas.length; i++) {
    const row = linhas[i];
    const mesRaw = String(row[col.mes] || "").trim();
    const idx = mesesLC.indexOf(mesRaw.toLowerCase());
    if (idx === -1) continue;                         // pula TOTAL, vazias e bloco de gráficos
    const ano = parseBR(row[col.ano]);
    if (!ano || ano < 2000) continue;
    out.push({
      id: `${mesRaw}-${ano}`,
      mes: MESES[idx], ano,
      investimento: parseBR(row[col.inv]),
      leads: parseBR(row[col.leads]),
      vendas: parseBR(row[col.vendas]),
      receita: parseBR(row[col.receita]),
    });
  }
  return out;
}

function metrics(r) {
  const inv = nn(r.investimento), le = nn(r.leads), ve = nn(r.vendas), rc = nn(r.receita);
  return {
    cpl: le ? inv / le : null, cac: ve ? inv / ve : null, conv: le ? ve / le : null,
    roi: inv ? (rc - inv) / inv : null, roas: inv ? rc / inv : null,
    lucro: inv !== null && rc !== null ? rc - inv : null,
    inv, le, ve, rc, completo: inv !== null && le !== null && ve !== null && rc !== null,
  };
}
function checaMetas(m, metas) {
  const roiFail = metas.roiMin != null && m.roi != null && m.roi * 100 < metas.roiMin;
  const cplFail = metas.cplMax != null && m.cpl != null && m.cpl > metas.cplMax;
  const orcFail = metas.invMensal != null && m.inv != null && m.inv > metas.invMensal;
  return { roiFail, cplFail, orcFail, algumaFalha: roiFail || cplFail || orcFail };
}
function aggregate(rows) {
  const inv = sum(rows, "investimento"), le = sum(rows, "leads"), ve = sum(rows, "vendas"), rc = sum(rows, "receita");
  return {
    investimento: inv, leads: le, vendas: ve, receita: rc,
    cpl: le ? inv / le : null, cac: ve ? inv / ve : null, conv: le ? ve / le : null,
    roi: inv ? (rc - inv) / inv : null, roas: inv ? rc / inv : null, lucro: rc - inv,
  };
}
const ordena = (a, b) => a.ano - b.ano || MESES.indexOf(a.mes) - MESES.indexOf(b.mes);

/* normaliza a URL colada: aceita link de "Publicar na web" ou o link normal da planilha */
function normalizaURL(u) {
  const s = (u || "").trim();
  if (!s) return "";
  if (s.includes("output=csv") || s.includes("tqx=out:csv")) return s;
  // link comum: https://docs.google.com/spreadsheets/d/<id>/edit#gid=<gid>
  const mId = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const mGid = s.match(/[#&?]gid=([0-9]+)/);
  if (mId) {
    const gid = mGid ? mGid[1] : "0";
    return `https://docs.google.com/spreadsheets/d/${mId[1]}/gviz/tq?tqx=out:csv&gid=${gid}`;
  }
  return s;
}

/* --------------------------- componente --------------------------- */
export default function PainelMarketing() {
  const [url, setUrl] = useState("");
  const [rascunhoUrl, setRascunhoUrl] = useState("");
  const [rows, setRows] = useState([]);
  const [metas, setMetas] = useState(METAS_PADRAO);
  const [filtroAno, setFiltroAno] = useState("todos");
  const [estado, setEstado] = useState("init"); // init | carregando | ok | erro | semurl
  const [erro, setErro] = useState("");
  const [sync, setSync] = useState(null);

  // carrega config salva
  useEffect(() => {
    (async () => {
      let u = "";
      try { const r = await store.get(URL_KEY); if (r?.value) u = JSON.parse(r.value); } catch (_) {}
      try { const r = await store.get(METAS_KEY); if (r?.value) setMetas({ ...METAS_PADRAO, ...JSON.parse(r.value) }); } catch (_) {}
      let cache = null;
      try { const r = await store.get(CACHE_KEY); if (r?.value) cache = JSON.parse(r.value); } catch (_) {}
      if (cache?.rows) { setRows(cache.rows); setSync(cache.sync); }
      if (u) { setUrl(u); setRascunhoUrl(u); buscar(u, !cache); }
      else setEstado(cache?.rows ? "ok" : "semurl");
    })();
  }, []);

  const salvar = (k, v) => { try { store.set(k, JSON.stringify(v)); } catch (_) {} };

  const buscar = useCallback(async (u, mostraLoading = true) => {
    if (!u) return;
    if (mostraLoading) setEstado("carregando");
    setErro("");
    try {
      const resp = await fetch(u);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const texto = await resp.text();
      const meses = extrairMeses(parseCSV(texto));
      if (!meses.length) throw new Error("Não encontrei a tabela mensal (procuro as colunas Mês, Ano, Investimento, Leads…). Confira se publicou a aba MARKETING.");
      const carimbo = new Date().toISOString();
      setRows(meses); setSync(carimbo); setEstado("ok");
      salvar(CACHE_KEY, { rows: meses, sync: carimbo });
    } catch (e) {
      setErro(String(e.message || e));
      setEstado(rows.length ? "ok" : "erro");
    }
  }, [rows.length]);

  const conectar = () => {
    const u = normalizaURL(rascunhoUrl);
    setUrl(u); salvar(URL_KEY, u); buscar(u, true);
  };
  const atualizaMeta = (campo, valor) => {
    setMetas((prev) => { const nova = { ...prev, [campo]: valor === "" ? null : Number(valor) }; salvar(METAS_KEY, nova); return nova; });
  };

  const anos = useMemo(() => [...new Set(rows.map((r) => r.ano))].sort(), [rows]);
  const ordenadas = useMemo(() => [...rows].sort(ordena), [rows]);
  const filtradas = useMemo(
    () => (filtroAno === "todos" ? ordenadas : ordenadas.filter((r) => r.ano === Number(filtroAno))),
    [ordenadas, filtroAno]
  );
  const kpi = useMemo(() => aggregate(filtradas), [filtradas]);
  const foraDaMeta = useMemo(() => filtradas.map((r) => {
    const c = checaMetas(metrics(r), metas); const motivos = [];
    if (c.roiFail) motivos.push("ROI"); if (c.cplFail) motivos.push("CPL"); if (c.orcFail) motivos.push("orçamento");
    return c.algumaFalha ? { rotulo: `${r.mes}/${String(r.ano).slice(2)}`, motivos } : null;
  }).filter(Boolean), [filtradas, metas]);
  const chartData = useMemo(() => filtradas.map((r) => {
    const m = metrics(r);
    return { nome: `${r.mes}/${String(r.ano).slice(2)}`, Investimento: nn(r.investimento) ?? 0, Receita: nn(r.receita) ?? 0, CPL: m.cpl, ROI: m.roi !== null ? m.roi * 100 : null };
  }), [filtradas]);

  const roiOk = metas.roiMin == null || kpi.roi == null || kpi.roi * 100 >= metas.roiMin;
  const cplOk = metas.cplMax == null || kpi.cpl == null || kpi.cpl <= metas.cplMax;

  /* ---------- tela de conexão (sem URL ainda) ---------- */
  if (estado === "semurl" || estado === "init") {
    return (
      <Shell>
        <ConexaoCard rascunho={rascunhoUrl} setRascunho={setRascunhoUrl} onConectar={conectar} erro={erro} carregando={false} />
      </Shell>
    );
  }

  return (
    <Shell
      direita={
        <div className="flex items-center gap-2">
          {sync && <span className="text-xs" style={{ color: "#8FA6C4" }}>Sincronizado {new Date(sync).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={() => buscar(url, true)} className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: "#0E3A5F", color: "#CFE3F5" }}>
            {estado === "carregando" ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      }
    >
      {/* aviso de erro (mantém dados do cache) */}
      {erro && (
        <div className="mb-4 rounded-lg px-4 py-2.5 text-sm" style={{ background: "#FDECEC", border: "1px solid #F5B5B5", color: "#B42318" }}>
          Não consegui atualizar: {erro} {rows.length ? "Mostrando os últimos dados sincronizados." : ""}
        </div>
      )}

      {/* filtro de ano */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-xs font-medium" style={{ color: "#64748B" }}>Período:</span>
        {["todos", ...anos].map((a) => (
          <button key={a} onClick={() => setFiltroAno(a === "todos" ? "todos" : a)} className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: String(filtroAno) === String(a) ? "#0B2545" : "#FFFFFF", color: String(filtroAno) === String(a) ? "#FFFFFF" : "#334155", border: "1px solid #E2E8F0" }}>
            {a === "todos" ? "Acumulado" : a}
          </button>
        ))}
        <button onClick={() => setEstado("semurl")} className="text-xs ml-auto" style={{ color: "#94A3B8" }}>trocar planilha</button>
      </div>

      {/* Banner de alertas */}
      <div className="mb-5 rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ background: foraDaMeta.length ? "#FEF3E2" : "#E9F7EF", border: `1px solid ${foraDaMeta.length ? "#F6C98A" : "#A7E0C0"}` }}>
        <span className="text-lg leading-none mt-0.5">{foraDaMeta.length ? "⚠️" : "✅"}</span>
        <div className="text-sm" style={{ color: "#334155" }}>
          {foraDaMeta.length === 0 ? <span>Todos os meses do período estão <strong>dentro das metas</strong>.</span> : (
            <><strong>{foraDaMeta.length} {foraDaMeta.length === 1 ? "mês fora da meta" : "meses fora da meta"}:</strong>{" "}
              {foraDaMeta.map((f, i) => (<span key={f.rotulo}>{f.rotulo} <span style={{ color: "#B45309" }}>({f.motivos.join(", ")})</span>{i < foraDaMeta.length - 1 ? "; " : ""}</span>))}
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi rotulo="Investimento" valor={brl(kpi.investimento)} />
        <Kpi rotulo="Leads" valor={num(kpi.leads)} />
        <Kpi rotulo="Vendas (TP)" valor={num(kpi.vendas)} />
        <Kpi rotulo="Receita (TP)" valor={brl(kpi.receita)} />
      </section>
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi rotulo="CPL médio" valor={brl(kpi.cpl)} pequeno meta={metas.cplMax != null ? `meta ≤ ${brl(metas.cplMax)}` : null} ok={cplOk} />
        <Kpi rotulo="CAC médio" valor={brl(kpi.cac)} pequeno />
        <Kpi rotulo="Conversão" valor={pct(kpi.conv)} pequeno />
        <Kpi rotulo="ROI" valor={pct(kpi.roi)} pequeno destaque={kpi.roi} meta={metas.roiMin != null ? `meta ≥ ${metas.roiMin}%` : null} ok={roiOk} />
        <Kpi rotulo="Lucro bruto" valor={brl(kpi.lucro)} pequeno destaque={kpi.lucro} />
      </section>

      {/* Metas */}
      <Painel titulo="Metas">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CampoMeta rotulo="ROI mínimo" sufixo="%" valor={metas.roiMin} onChange={(v) => atualizaMeta("roiMin", v)} ajuda="Abaixo disso o mês é sinalizado." />
          <CampoMeta rotulo="CPL máximo" prefixo="R$" valor={metas.cplMax} onChange={(v) => atualizaMeta("cplMax", v)} ajuda="Custo por lead aceitável." />
          <CampoMeta rotulo="Orçamento mensal" prefixo="R$" valor={metas.invMensal} onChange={(v) => atualizaMeta("invMensal", v)} ajuda="Opcional. Alerta se o investimento passar." />
        </div>
      </Painel>

      {/* Gráficos */}
      <div className="grid md:grid-cols-2 gap-4 my-4">
        <Painel titulo="Investimento vs. Receita">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
              <XAxis dataKey="nome" tick={{ fontSize: 11, fill: "#64748B" }} interval={0} angle={-35} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => brl(v)} labelStyle={{ color: "#0B2545" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Investimento" fill="#94A3B8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Receita" fill="#2563EB" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Painel>
        <Painel titulo="CPL e ROI por mês">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
              <XAxis dataKey="nome" tick={{ fontSize: 11, fill: "#64748B" }} interval={0} angle={-35} textAnchor="end" height={50} />
              <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(v) => `R$${v}`} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(v) => `${v}%`} />
              <Tooltip labelStyle={{ color: "#0B2545" }} formatter={(v, nome) => (nome === "CPL" ? brl(v) : `${Math.round(v)}%`)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine yAxisId="r" y={0} stroke="#CBD5E1" />
              {metas.roiMin != null && <ReferenceLine yAxisId="r" y={metas.roiMin} stroke="#059669" strokeDasharray="4 4" />}
              {metas.cplMax != null && <ReferenceLine yAxisId="l" y={metas.cplMax} stroke="#DC2626" strokeDasharray="4 4" />}
              <Line yAxisId="l" type="monotone" dataKey="CPL" stroke="#0B2545" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Line yAxisId="r" type="monotone" dataKey="ROI" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Painel>
      </div>

      {/* Tabela (somente leitura — vem da planilha) */}
      <Painel titulo="Dados por mês" acao={<span className="text-xs" style={{ color: "#94A3B8" }}>lido da planilha · edite no Sheets</span>}>
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-sm border-collapse min-w-[820px]">
            <thead>
              <tr style={{ color: "#64748B" }} className="text-left text-xs">
                {["Mês","Ano","Investimento","Leads","Vendas","Receita","CPL","CAC","Conv.","ROI","Meta"].map((h, i) => (
                  <th key={h} className={`py-2 px-2 font-medium ${i >= 2 && i <= 9 ? "text-right" : i === 10 ? "text-center" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r) => {
                const m = metrics(r); const c = checaMetas(m, metas);
                const roiCor = m.roi === null ? "#94A3B8" : m.roi < 0 ? "#DC2626" : c.roiFail ? "#D97706" : "#059669";
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #EDF1F7", background: !m.completo ? "#FFFBEB" : "transparent" }}>
                    <td className="px-2 py-1.5 font-medium text-slate-800">{r.mes}</td>
                    <td className="px-2 py-1.5 text-slate-600">{r.ano}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: c.orcFail ? "#DC2626" : "#1E293B", fontWeight: c.orcFail ? 600 : 400 }}>{brl(r.investimento)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{num(r.leads)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{num(r.vendas)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{brl(r.receita)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: c.cplFail ? "#DC2626" : "#475569", fontWeight: c.cplFail ? 600 : 400 }}>{m.cpl === null ? "—" : brl(m.cpl)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{m.cac === null ? "—" : brl(m.cac)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{pct(m.conv)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: roiCor }}>{pct(m.roi)}</td>
                    <td className="px-2 py-1.5 text-center">
                      {m.roi === null && m.cpl === null ? <span className="text-slate-300">—</span>
                        : c.algumaFalha ? <span style={{ color: "#D97706" }}>▲</span> : <span style={{ color: "#059669" }}>✓</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: "#94A3B8" }}>
          Fundo amarelo = dado faltando na planilha. ▲ = fora de alguma meta, ✓ = dentro. Para corrigir, edite no Sheets e clique em Atualizar.
        </p>
      </Painel>
    </Shell>
  );
}

/* --------------------------- layout / subcomponentes -------------- */
function Shell({ children, direita }) {
  return (
    <div className="min-h-screen w-full" style={{ background: "#F4F6FB", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ background: "#0B2545" }} className="px-6 py-5 md:px-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-white text-lg md:text-xl font-semibold tracking-tight">Bunker · Marketing</div>
            <div className="text-xs mt-0.5" style={{ color: "#8FA6C4" }}>Site · lê a planilha publicada e recalcula os indicadores</div>
          </div>
          {direita}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 md:px-10 py-6 md:py-8">{children}</main>
    </div>
  );
}

function ConexaoCard({ rascunho, setRascunho, onConectar, erro }) {
  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl p-6" style={{ border: "1px solid #E7ECF3" }}>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Conectar sua planilha</h2>
        <p className="text-sm mb-4" style={{ color: "#64748B" }}>
          Publique a aba <strong>MARKETING</strong> em <em>Arquivo → Compartilhar → Publicar na Web → CSV</em> e cole o link aqui.
          Também aceito o link normal da planilha (com o gid da aba).
        </p>
        <input value={rascunho} onChange={(e) => setRascunho(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&output=csv"
          className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: "1px solid #CBD5E1", color: "#1E293B" }} />
        {erro && <div className="text-xs mt-2" style={{ color: "#B42318" }}>{erro}</div>}
        <button onClick={onConectar} className="mt-4 text-sm font-semibold px-4 py-2.5 rounded-lg text-white" style={{ background: "#2563EB" }}>Conectar e carregar</button>
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, pequeno, destaque, meta, ok }) {
  const cor = destaque === undefined || destaque === null ? "#0B2545" : destaque >= 0 ? "#059669" : "#DC2626";
  return (
    <div className="bg-white rounded-xl px-4 py-3" style={{ border: "1px solid #E7ECF3" }}>
      <div className="text-xs" style={{ color: "#64748B" }}>{rotulo}</div>
      <div className={pequeno ? "text-base font-semibold mt-1" : "text-xl font-bold mt-1"} style={{ color: cor }}>{valor}</div>
      {meta && <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: ok ? "#059669" : "#D97706" }}><span>{ok ? "✓" : "▲"}</span><span>{meta}</span></div>}
    </div>
  );
}
function Painel({ titulo, acao, children }) {
  return (
    <div className="bg-white rounded-xl p-4 md:p-5" style={{ border: "1px solid #E7ECF3" }}>
      <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>{acao}</div>
      {children}
    </div>
  );
}
function CampoMeta({ rotulo, valor, onChange, prefixo, sufixo, ajuda }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "#F8FAFC", border: "1px solid #E7ECF3" }}>
      <div className="text-xs font-medium text-slate-700 mb-1">{rotulo}</div>
      <div className="flex items-center gap-1">
        {prefixo && <span className="text-slate-400 text-sm">{prefixo}</span>}
        <input type="number" inputMode="decimal" value={valor === null || valor === undefined ? "" : valor} onChange={(e) => onChange(e.target.value)} placeholder="—"
          className="w-24 bg-transparent outline-none text-slate-900 font-semibold tabular-nums" />
        {sufixo && <span className="text-slate-400 text-sm">{sufixo}</span>}
      </div>
      {ajuda && <div className="text-[11px] mt-1" style={{ color: "#94A3B8" }}>{ajuda}</div>}
    </div>
  );
}
