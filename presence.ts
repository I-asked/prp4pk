import { PkSwitch } from './pk.ts';
import { DiscordClient } from "./discord.ts";

const token = Deno.env.get('DISCORD_TOKEN');
if (!token) {
  throw new Error('DISCORD_TOKEN unset in env');
}

const pkToken = Deno.env.get('PK_API_TOKEN');
if (!pkToken) {
  throw new Error('PK_API_TOKEN unset in env');
}

const client = new DiscordClient(token, pkToken, {});

addEventListener('message', async (event: MessageEvent<PkSwitch>) => {
  await client.switch(event.data);
});