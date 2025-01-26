import { PkSwitch } from './pk.ts';
import { Prp4pkWebHook } from './hook.ts';

if (import.meta.main) {
  const signing = Deno.env.get('PRP_PK_SIGNING_TOKEN'); 
  if (!signing) {
    throw new Error('PRP_PK_SIGNING_TOKEN unset in env');
  }

  const worker = new Worker(new URL('./presence.ts', import.meta.url).href, {type: 'module'});
  worker.onerror = (event: ErrorEvent) => {
    throw event.error;
  };
  const wh = new Prp4pkWebHook((sw: PkSwitch) => {
    worker.postMessage(sw);
  }, signing);
  await Deno.serve((req, info) => wh.handle(req, info));
}