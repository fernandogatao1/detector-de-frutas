import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { detectFruits, type Deteccao } from "@/lib/detect.functions";
import { processar, type PdiResult } from "@/lib/pdi";

const MAX_IMAGENS = 5;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Detector de Frutas versão F.F" },
      { name: "description", content: "Envie até 5 imagens e descubra quais frutas aparecem, com técnicas de Processamento Digital de Imagens." },
      { property: "og:title", content: "Detector de Frutas versão F.F" },
      { property: "og:description", content: "Detecção e identificação de frutas com computação gráfica e PDI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Item = { id: string; nome: string; dataUrl?: string; pdi?: PdiResult; ia?: Deteccao; status: "processando" | "pronto" | "erro" };

const ETAPAS = [
  ["Amostragem e redimensionamento", "A imagem é reamostrada (interpolação bilinear) para no máximo 512 px, mantendo a proporção."],
  ["Conversão para tons de cinza", "Luminância Y = 0,299R + 0,587G + 0,114B (padrão ITU-R BT.601)."],
  ["Histograma RGB", "Distribuição de intensidades por canal, usada para caracterizar a cor da fruta."],
  ["Limiarização de Otsu", "Encontra automaticamente o limiar que maximiza a variância entre fundo e objeto."],
  ["Segmentação no espaço HSV", "Pixels com saturação alta são isolados como prováveis regiões de fruta (máscara)."],
  ["Detecção de bordas (Sobel)", "Convolução com kernels 3×3 calcula o gradiente e revela o contorno e a forma."],
  ["Quantização de cores", "Agrupa as cores em 512 faixas e extrai as 5 cores dominantes."],
  ["Classificação por rede neural", "Uma rede de visão (CNN/Transformer) compara forma, cor e textura com classes do Fruits Image Dataset."],
] as const;

function Index() {
  const [itens, setItens] = useState<Item[]>([]);
  const [aviso, setAviso] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const detectar = useServerFn(detectFruits);

  async function adicionar(files: FileList | File[]) {
    setAviso("");
    const lista = Array.from(files);
    const imagens = lista.filter((f) => f.type.startsWith("image/"));
    if (imagens.length < lista.length) setAviso("Apenas arquivos de imagem são aceitos. Os demais foram ignorados.");
    const vagas = MAX_IMAGENS - itens.length;
    if (vagas <= 0) return setAviso(`Limite de ${MAX_IMAGENS} imagens atingido. Remova alguma para continuar.`);
    if (imagens.length > vagas) setAviso(`Limite de ${MAX_IMAGENS} imagens: apenas ${vagas} foram adicionadas.`);
    for (const f of imagens.slice(0, vagas)) {
      const id = crypto.randomUUID();
      setItens((p) => [...p, { id, nome: f.name, status: "processando" }]);
      try {
        const { dataUrl, pdi } = await processar(f);
        setItens((p) => p.map((i) => (i.id === id ? { ...i, dataUrl, pdi } : i)));
        const ia = await detectar({ data: { image: dataUrl } });
        setItens((p) => p.map((i) => (i.id === id ? { ...i, ia, status: ia.erro ? "erro" : "pronto" } : i)));
      } catch {
        setItens((p) => p.map((i) => (i.id === id ? { ...i, status: "erro", ia: { frutas: [], resumo: "", erro: "Falha ao processar a imagem." } } : i)));
      }
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Processamento Digital de Imagens</p>
        <h1 className="mt-3 text-5xl font-extrabold leading-none text-primary md:text-7xl">
          Detector de Frutas <span className="text-accent">v.F.F</span>
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Envie até {MAX_IMAGENS} imagens. Cada uma passa por um pipeline de computação gráfica — tons de cinza, histograma, Otsu, segmentação HSV e Sobel — antes da classificação final.
        </p>
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${arrastando ? "border-accent bg-secondary" : "border-border bg-card hover:border-accent"}`}
      >
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) adicionar(e.target.files); e.target.value = ""; }} />
        <p className="font-display text-2xl text-primary">Arraste suas imagens aqui</p>
        <p className="mt-2 text-sm text-muted-foreground">ou clique para escolher · somente imagens · {itens.length}/{MAX_IMAGENS}</p>
      </div>
      {aviso && <p className="mt-3 rounded-lg bg-secondary px-4 py-2 text-sm text-secondary-foreground">{aviso}</p>}

      <section className="mt-10 space-y-8">
        {itens.map((it) => (
          <article key={it.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="truncate font-mono text-sm">{it.nome}</span>
              <button onClick={() => setItens((p) => p.filter((i) => i.id !== it.id))} className="text-sm text-muted-foreground hover:text-destructive">Remover</button>
            </div>
            <div className="grid gap-6 p-5 md:grid-cols-[1fr_1.2fr]">
              <div className="space-y-3">
                {it.dataUrl ? <img src={it.dataUrl} alt={it.nome} className="w-full rounded-xl" /> : <div className="aspect-square animate-pulse rounded-xl bg-muted" />}
                {it.pdi && (
                  <div className="grid grid-cols-3 gap-2">
                    {([["Cinza", it.pdi.cinza], ["Máscara HSV", it.pdi.mascara], ["Bordas Sobel", it.pdi.bordas]] as const).map(([t, u]) => (
                      <figure key={t}><img src={u} alt={t} className="rounded-lg" /><figcaption className="mt-1 text-center font-mono text-[10px] text-muted-foreground">{t}</figcaption></figure>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-primary">O que foi identificado</h2>
                {it.status === "processando" && <p className="mt-3 animate-pulse text-muted-foreground">Analisando a imagem…</p>}
                {it.ia?.erro && <p className="mt-3 text-destructive">{it.ia.erro}</p>}
                {it.ia && !it.ia.erro && (
                  <>
                    <p className="mt-2 text-muted-foreground">{it.ia.resumo}</p>
                    <ul className="mt-4 space-y-3">
                      {it.ia.frutas.map((f, k) => (
                        <li key={k} className="rounded-xl bg-secondary p-4">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-display text-xl font-bold">{f.nome} <span className="text-base font-normal text-muted-foreground">×{f.quantidade}</span></span>
                            <span className="font-mono text-sm text-accent">{f.confianca}%</span>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${f.confianca}%` }} /></div>
                          <p className="mt-2 text-sm text-muted-foreground">Cor: {f.cor} · {f.caracteristicas}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {it.pdi && <Medidas pdi={it.pdi} />}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-14 rounded-2xl bg-primary p-8 text-primary-foreground">
        <h2 className="text-3xl font-bold">Como a identificação funciona</h2>
        <p className="mt-2 opacity-80">Métodos de computação gráfica e PDI aplicados a cada imagem, nesta ordem:</p>
        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          {ETAPAS.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="font-mono text-accent">{String(i + 1).padStart(2, "0")}</span>
              <div><p className="font-bold">{t}</p><p className="text-sm opacity-80">{d}</p></div>
            </li>
          ))}
        </ol>
      </section>
      <footer className="mt-10 text-center font-mono text-xs text-muted-foreground">Detector de Frutas versão F.F · Fernando Fernandes</footer>
    </main>
  );
}

function Medidas({ pdi }: { pdi: PdiResult }) {
  const max = Math.max(...pdi.histograma.r, ...pdi.histograma.g, ...pdi.histograma.b);
  const canais = [["r", "bg-chart-1"], ["g", "bg-chart-2"], ["b", "bg-chart-3"]] as const;
  return (
    <div className="mt-6 space-y-4 border-t border-border pt-4">
      <h3 className="text-lg font-bold text-primary">Processos aplicados</h3>
      <dl className="grid grid-cols-3 gap-3 font-mono text-xs">
        <div><dt className="text-muted-foreground">Resolução</dt><dd>{pdi.largura}×{pdi.altura}</dd></div>
        <div><dt className="text-muted-foreground">Limiar Otsu</dt><dd>{pdi.limiarOtsu}</dd></div>
        <div><dt className="text-muted-foreground">Área segmentada</dt><dd>{pdi.percentualFruta}%</dd></div>
      </dl>
      <div>
        <p className="mb-1 font-mono text-xs text-muted-foreground">Histograma RGB</p>
        <div className="flex h-16 items-end gap-px">
          {pdi.histograma.r.map((_, i) => (
            <div key={i} className="flex h-full flex-1 items-end gap-px">
              {canais.map(([c, cls]) => <div key={c} className={`flex-1 ${cls} opacity-80`} style={{ height: `${((pdi.histograma[c][i] ?? 0) / max) * 100}%` }} />)}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 font-mono text-xs text-muted-foreground">Cores dominantes (quantização)</p>
        <div className="flex gap-2">{pdi.coresDominantes.map((c) => <span key={c} title={c} className="h-8 w-8 rounded-md border border-border" style={{ background: c }} />)}</div>
      </div>
    </div>
  );
}
