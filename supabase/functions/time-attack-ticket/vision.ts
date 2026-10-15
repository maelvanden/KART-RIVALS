// Lecture du ticket de chronométrage par Claude (vision + sortie structurée).
import Anthropic from 'npm:@anthropic-ai/sdk@0.134.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod';
import { z } from 'npm:zod@4.6.7';

const TicketReading = z.object({
  is_timing_ticket: z.boolean().describe('true si la photo montre un ticket / une feuille de résultats de karting'),
  session_date: z
    .string()
    .nullable()
    .describe('Date de la session imprimée sur le ticket, au format YYYY-MM-DD ; null si absente ou illisible'),
  session_time: z
    .string()
    .nullable()
    .describe('Heure de la session imprimée sur le ticket, au format HH:MM ou HH:MM:SS (24 h) ; null si absente ou illisible'),
  best_lap_ms: z
    .number()
    .int()
    .nullable()
    .describe('Meilleur tour du pilote en millisecondes ; null si illisible'),
});

export type TicketReading = z.infer<typeof TicketReading>;

const PROMPT = `Tu lis la photo d'un ticket de chronométrage de karting (feuille imprimée remise après une session).
Extrais uniquement ce qui est imprimé, sans rien deviner :
- session_date / session_time : la date et l'heure de la SESSION (heure de départ de la manche), pas l'heure d'impression si les deux figurent. Si seule l'heure d'impression existe, prends-la.
- best_lap_ms : le meilleur tour (best lap / meilleur tour) en millisecondes.
Si une valeur est absente, coupée, floue ou ambiguë, renvoie null pour ce champ.
Si la photo n'est pas un ticket de chronométrage de karting, mets is_timing_ticket à false.`;

const client = new Anthropic(); // ANTHROPIC_API_KEY (secret de l'Edge Function)

export async function readTicket(image: Uint8Array, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<TicketReading | null> {
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 2048,
    // Si le modèle décline par erreur, l'API relance la requête sur le modèle de repli par défaut.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(TicketReading) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: toBase64(image) } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') return null;
  return response.parsed_output ?? null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
