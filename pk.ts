export interface PkEvent<T> {
  type: string;
  signing_token: string;
  system_id: string;
  id?: string;
  data: T;
}

export interface PkSwitch {
    id: string;
    timestamp: Date | string;
    members: string[];
}

export class WebHook {
  static FALLBACK = '';

  protected _token: string;

  constructor(token: string) {
    this._token = token;
  }

  static dispatch(event?: string) {
    return function (target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
      target.constructor._hooks ??= {};
      target.constructor._hooks[event ?? ''] = descriptor.value!;
    };
  }

  async handle(req: Request, _info: Deno.ServeHandlerInfo<Deno.Addr>) {
    try {
      const event = await req.json() as PkEvent<any>;
      if (this._token !== event.signing_token) {
        return new Response('Unauthorized', { status: 401 });
      }
      const type = (event.type in this.constructor._hooks) ? event.type : '';
      console.log(`Handle event`, event);
      return await this.constructor._hooks[type].call(this, event);
    } catch (e) {
      console.error(e);
      return new Response('Bad request', { status: 400 });
    }
  }
}
