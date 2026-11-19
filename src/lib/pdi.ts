// Técnicas clássicas de Processamento Digital de Imagens executadas no navegador.
export type PdiResult = {
  largura: number; altura: number;
  bordas: string; mascara: string; cinza: string;
  histograma: { r: number[]; g: number[]; b: number[] };
  coresDominantes: string[];
  percentualFruta: number;
  limiarOtsu: number;
};

export async function processar(file: File): Promise<{ pdi: PdiResult; dataUrl: string }> {
  const bmp = await createImageBitmap(file);
  const max = 512;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!; ctx.drawImage(bmp, 0, 0, w, h);
  const dataUrl = cv.toDataURL("image/jpeg", 0.85);
  const src = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const S = (i: number) => src[i] ?? 0;
  const gray = new Float32Array(n);
  const G = (i: number) => gray[i] ?? 0;
  const hr: number[] = new Array(32).fill(0), hg: number[] = new Array(32).fill(0), hb: number[] = new Array(32).fill(0);
  const hist: number[] = new Array(256).fill(0);
  const H = (t: number) => hist[t] ?? 0;
  const buckets = new Map<string, number>();
  const mask = new Uint8Array(n);
  let frutaPx = 0;
  for (let i = 0; i < n; i++) {
    const r = S(i * 4), g = S(i * 4 + 1), b = S(i * 4 + 2);
    const y = 0.299 * r + 0.587 * g + 0.114 * b; // luminância ITU-R BT.601
    gray[i] = y; hist[y | 0] = H(y | 0) + 1;
    hr[r >> 3] = (hr[r >> 3] ?? 0) + 1; hg[g >> 3] = (hg[g >> 3] ?? 0) + 1; hb[b >> 3] = (hb[b >> 3] ?? 0) + 1;
    const k = `${r >> 5},${g >> 5},${b >> 5}`; buckets.set(k, (buckets.get(k) ?? 0) + 1);
    // Segmentação HSV: saturação alta = provável fruta
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat > 0.35 && mx > 50) { mask[i] = 1; frutaPx++; }
  }
  // Otsu
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * H(t);
  let sumB = 0, wB = 0, best = 0, limiar = 0;
  for (let t = 0; t < 256; t++) {
    wB += H(t); if (!wB) continue; const wF = n - wB; if (!wF) break;
    sumB += t * H(t); const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; limiar = t; }
  }
  // Sobel
  const out = ctx.createImageData(w, h), mk = ctx.createImageData(w, h), gr = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let m = 0;
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
      const p = (dx: number, dy: number) => G((y + dy) * w + x + dx);
      const gx = -p(-1,-1) - 2*p(-1,0) - p(-1,1) + p(1,-1) + 2*p(1,0) + p(1,1);
      const gy = -p(-1,-1) - 2*p(0,-1) - p(1,-1) + p(-1,1) + 2*p(0,1) + p(1,1);
      m = Math.min(255, Math.hypot(gx, gy));
    }
    out.data.set([m, m, m, 255], i * 4);
    const g = G(i); gr.data.set([g, g, g, 255], i * 4);
    if (mask[i]) mk.data.set([S(i*4), S(i*4+1), S(i*4+2), 255], i * 4);
    else mk.data.set([0, 0, 0, 255], i * 4);
  }
  const toUrl = (d: ImageData) => { ctx.putImageData(d, 0, 0); return cv.toDataURL("image/png"); };
  const bordas = toUrl(out), mascara = toUrl(mk), cinza = toUrl(gr);
  const coresDominantes = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => {
    const [r, g, b] = k.split(",").map((v) => (+v << 5) + 16); return `rgb(${r}, ${g}, ${b})`;
  });
  return { dataUrl, pdi: { largura: bmp.width, altura: bmp.height, bordas, mascara, cinza, histograma: { r: hr, g: hg, b: hb }, coresDominantes, percentualFruta: Math.round((frutaPx / n) * 100), limiarOtsu: limiar } };
}
