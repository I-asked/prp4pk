import { PkEvent, PkSwitch, WebHook } from './pk.ts';

export class Prp4pkWebHook extends WebHook {

  private _callback: ((member: PkSwitch) => void);

  constructor(switchCb: ((member: PkSwitch) => void), webhookToken: string) {
    super(webhookToken);

    this._callback = switchCb;
  }

  @WebHook.dispatch('CREATE_SWITCH')
  async createSwitch(event: PkEvent<PkSwitch>) {
    this._callback(event.data);
    return new Response('OK');
  }

  @WebHook.dispatch('PING')
  async ping(_event: PkEvent<null>) {
    return new Response('PONG');
  }

  @WebHook.dispatch(WebHook.FALLBACK)
  async fallback(_event: PkEvent<any>) {
    return new Response('Bad request', { status: 400 });
  }
}