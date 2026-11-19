import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";

export type Fruta = { nome: string; quantidade: number; confianca: number; cor: string; caracteristicas: string };
export type Deteccao = { frutas: Fruta[]; resumo: string; erro?: string };

export const detectFruits = createServerFn({ method: "POST" })
  .inputValidator((d: { image: string }) => {
    if (typeof d?.image !== "string" || !d.image.startsWith("data:image/")) throw new Error("Imagem inválida");
    if (d.image.length > 8_000_000) throw new Error("Imagem muito grande");
    return d;
  })
  .handler(async ({ data }): Promise<Deteccao> => {
    try {
      // 1. Lê a chave do .env e inicializa o cliente do Google
      const apiKey = process.env['GEMINI_API_KEY'];
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY não encontrada. Verifique o .env e reinicie o servidor.");
      }

      const ai = new GoogleGenAI({ apiKey: apiKey });

      const prompt = 'Você é um sistema de visão computacional treinado no Fruits Image Dataset. Identifique todas as frutas na imagem. Responda SOMENTE em JSON: {"frutas":[{"nome":"nome em português","quantidade":n,"confianca":0-100,"cor":"cor predominante","caracteristicas":"forma, textura e cor observadas"}],"resumo":"frase curta em português"}. Se não houver frutas, retorne frutas vazio e explique no resumo.';

      // 2. Prepara a imagem com validações para o TypeScript
      const parts = data.image.split(',');
      // O ?? "" garante que se o split falhar, enviamos uma string vazia em vez de undefined
      const base64Image = parts[1] ?? ""; 
      const mimeType = data.image.split(';')[0]?.split(':')[1] ?? "image/jpeg";

      // 3. Chama a API do Gemini
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash", 
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image,
            },
          },
          { text: prompt },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      // 4. Processa a resposta
      const text = response.text ?? "{}";
      const parsed = JSON.parse(text) as Deteccao;
      
      return { frutas: parsed.frutas ?? [], resumo: parsed.resumo ?? "" };
    } catch (e: any) {
      console.error(e);
      
      let msg = "Não foi possível analisar esta imagem.";
      if (e?.message?.includes("GEMINI_API_KEY")) msg = e.message;
      if (e?.status === 400) msg = "Requisição inválida. Verifique a chave e o formato da imagem.";
      if (e?.status === 429) msg = "Limite de requisições do Gemini atingido. Tente novamente em instantes.";
      
      return { frutas: [], resumo: "", erro: msg };
    }
  });