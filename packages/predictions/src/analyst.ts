import { z } from "zod";
import type { Evidence } from "./index";

const Forecast = z.object({
  statement: z.string().min(30).max(500),
  probability: z.number().int().min(5).max(95),
  rationale: z.string().min(50).max(1500),
  counterargument: z.string().min(30).max(800),
  resolutionCriteria: z.string().min(30).max(800),
  category: z.enum(["politics", "diplomacy", "economy", "conflict", "policy", "world"]),
  scope: z.enum(["turkey", "world", "mixed"]),
  evidenceIds: z.array(z.string()).min(2).max(8),
});

export type AnalystForecast = z.infer<typeof Forecast>;

const schema = {
  type: "OBJECT",
  required: ["statement", "probability", "rationale", "counterargument", "resolutionCriteria", "category", "scope", "evidenceIds"],
  properties: {
    statement: { type: "STRING" },
    probability: { type: "INTEGER", minimum: 5, maximum: 95 },
    rationale: { type: "STRING" },
    counterargument: { type: "STRING" },
    resolutionCriteria: { type: "STRING" },
    category: { type: "STRING", enum: ["politics", "diplomacy", "economy", "conflict", "policy", "world"] },
    scope: { type: "STRING", enum: ["turkey", "world", "mixed"] },
    evidenceIds: { type: "ARRAY", minItems: 2, maxItems: 8, items: { type: "STRING" } },
  },
};

export async function analyzeEvidence(evidence: Evidence[]): Promise<AnalystForecast | null> {
  const provider = process.env.AI_PROVIDER;
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.AI_MODEL;
  if (provider !== "gemini" || !key || !model) return null;

  const prompt = `Sen NEXT24 adlı bağımsız bir düşünce kuruluşunun kıdemli tahmin analistisin. Aşağıdaki son 24 saatlik kanıtlardan, önümüzdeki 24 saat içinde gerçekleşecek TEK bir gerçek dünya olayı veya aktör kararı tahmin et. Haber, manşet, ilgi, gündem veya haber kapsamı hakkında tahmin üretme. Tahmin falsifiye edilebilir, açık, tarafsız ve Türkçe olmalı. Aktörlerin teşviklerini, kısıtlarını ve baz oranlarını değerlendir. En az iki bağımsız kaynağı kullan. Kanıt yetersizse bile abartma; olasılığı düşür. evidenceIds alanında yalnızca verilen kanıtların id değerlerini kullan.\n\nKANITLAR:\n${JSON.stringify(evidence.slice(0, 40))}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Forecast AI ${response.status}: ${(await response.text()).slice(0, 500)}`);

  const body = (await response.json()) as any;
  const text = body.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("");
  if (!text) {
    const reason = body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Forecast AI returned no structured output (${reason})`);
  }

  const parsed = Forecast.parse(JSON.parse(text));
  if (/haber|manşet|gündem|coverage|headline|reported|reporting/i.test(parsed.statement)) throw new Error("Forecast AI produced a media-coverage forecast");
  const known = new Set(evidence.map((item) => item.id));
  if (parsed.evidenceIds.some((id) => !known.has(id))) throw new Error("Forecast AI cited unknown evidence");
  return parsed;
}
