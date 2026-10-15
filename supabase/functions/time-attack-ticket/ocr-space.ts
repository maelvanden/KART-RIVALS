// Lecture du texte d'un ticket par OCR.space (offre gratuite : 25 000 images / mois, 1 Mo max par image).
const API_URL = 'https://api.ocr.space/parse/image';

type OcrSpaceResponse = {
  ParsedResults?: { ParsedText?: string }[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
};

/** Texte brut du ticket, ligne par ligne. Lève une erreur si le service ne répond pas. */
export async function readTicketText(image: Blob, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', image, image.type === 'image/png' ? 'ticket.png' : 'ticket.jpg');
  form.append('OCREngine', '2'); // meilleur moteur pour les chiffres et les tickets
  form.append('isTable', 'true'); // garde les lignes du ticket (nom et temps sur la même ligne)
  form.append('scale', 'true');
  form.append('detectOrientation', 'true');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { apikey: apiKey },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OCR.space HTTP ${response.status}`);
  const result = (await response.json()) as OcrSpaceResponse;
  if (result.IsErroredOnProcessing) {
    throw new Error(`OCR.space : ${[result.ErrorMessage].flat().join(' ')}`);
  }
  return (result.ParsedResults ?? []).map((r) => r.ParsedText ?? '').join('\n');
}
