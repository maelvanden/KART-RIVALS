const { DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN } = process.env;

if (![DISCORD_APPLICATION_ID, DISCORD_GUILD_ID].every((id) => /^\d{17,20}$/.test(id ?? '')) || !DISCORD_BOT_TOKEN) {
  console.error('Renseigne DISCORD_APPLICATION_ID, DISCORD_GUILD_ID et DISCORD_BOT_TOKEN.');
  process.exit(1);
}

const url = 'https://discord.com/api/v10/applications/' + DISCORD_APPLICATION_ID +
  '/guilds/' + DISCORD_GUILD_ID + '/commands';

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bot ' + DISCORD_BOT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'records',
      description: 'Voir les dix meilleurs tours validés sur un circuit Kart Rivals',
      type: 1,
      options: [{
        name: 'circuit',
        description: 'Tape le nom du circuit ou sa ville',
        type: 3,
        required: true,
        autocomplete: true,
      }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error('Discord HTTP ' + response.status);
  console.log('Commande /records enregistrée sur le serveur de test.');
} catch (error) {
  console.error('Impossible d’enregistrer /records.', error.message);
  process.exitCode = 1;
}
