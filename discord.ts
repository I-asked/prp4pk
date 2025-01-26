import { PKAPI, Member } from "npm:pkapi.js";
import { PkSwitch } from "./pk.ts";

const NO_FRONT_TEXT = '(No one is fronting)';

enum PresenceType {
  LISTENING_TO = 2,
}

export class DiscordClient {
  private static readonly DEFAULT_DISCORD_GATEWAY_URL =
    'wss://gateway.discord.gg/?v=10&encoding=json';
  private static readonly DEFAULT_APPLICATION_ID = '1163661006719963158';
  private static readonly DEFAULT_EXTERNAL_ASSETS = '1163671691000557591';

  private static readonly ACTIVITY_TIMEOUT = 60000;

  private _pkApi: PKAPI;

  private gatewayUrl?: string;
  private applicationId?: string;
  private headers: { [header: string]: string };
  private lastSwitch: PkSwitch | null = null;
  private seq: number | null = null;
  private keepAliveTimer: number | null = null;
  private activityTimer: number | null = null;
  private wSock: WebSocket | null = null;
  private waitForConnect: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private heartBeatInterval = 0;
  public token: string;

  private wSockTextReceived = async (event: MessageEvent) => {
    try {
      if (!event.data) return;
      const jsonData = JSON.parse(event.data);
      if (!jsonData) return;

      this.seq = jsonData.s;
      switch (jsonData.op) {
        case 0:
          if (jsonData.t == 'READY') {
            this.resolveConnect?.();
            this.activityTimer = setInterval(() => {
              if (this.lastSwitch) this.switch(this.lastSwitch);
            }, DiscordClient.ACTIVITY_TIMEOUT) as number;
          }
          break;
        case 1:
          await this.sendKeepAlive();
          break;
        case 9:
          await this.reconnect();
          break;
        case 10:
          await this.sendKeepAlive();
          this.heartBeatInterval = jsonData.d.heartbeat_interval;
          this.keepAliveTimer = setInterval(
            () => this.sendKeepAlive(),
            this.heartBeatInterval,
          ) as number;
          break;
      }
    } catch (error) {
      console.error('Error in wSockTextReceived', error);
    }
  };

  private wSockDisconnected = async (_event: Event) => {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer!);
      this.keepAliveTimer = null;
    }
    if (this.activityTimer !== null) {
      clearInterval(this.activityTimer!);
      this.keepAliveTimer = null;
    }
    await this.reconnect();
  };

  private async getExternalAsset(url: string): Promise<string> {
    try {
      const extAssReq = { urls: [url] };
      const headers = {
        ...this.headers,
        'Content-Type': 'application/json',
      };

      const resp = await fetch(
        `https://discord.com/api/v9/applications/${this.applicationId ?? DiscordClient.DEFAULT_APPLICATION_ID}/external-assets`,
        {
          method: 'POST',
          body: JSON.stringify(extAssReq),
          headers: headers,
        },
      );
      const responseString = await resp.text();
      const jsonResponse = JSON.parse(responseString);
      if (jsonResponse) {
        return jsonResponse[0].external_asset_path;
      }
    } catch (error) {
      console.error('Error in getExternalAsset', error);
    }
    return DiscordClient.DEFAULT_EXTERNAL_ASSETS;
  }

  private async connect() {
    this.wSock = new WebSocket(this.gatewayUrl ?? DiscordClient.DEFAULT_DISCORD_GATEWAY_URL);
    await new Promise((res) => {
      this.wSock!.addEventListener('open', res, { once: true });
    });
    this.wSock.onmessage = this.wSockTextReceived;
    this.wSock.onclose = this.wSockDisconnected;
  }

  private async reconnect() {
    this.waitForConnect = new Promise<void>((resolve) => {
      this.resolveConnect = resolve;
    });

    while (true) {
      try {
        try {
          if (this.wSock) {
            this.wSock.close();
            this.wSock = null;
          }
        } catch (e) {
          console.debug(e);
        }

        await this.connect();
        await this.sendLogin();

        if (this.lastSwitch) {
          this.switch(this.lastSwitch);
        }
        break;
      } catch (e) {
        console.error('failed to connect', e);
        continue;
      }
    }
  }

  constructor(token: string, pkToken: string, { gatewayUrl, applicationId }: { gatewayUrl?: string, applicationId?: string }) {
    this._pkApi = new PKAPI({token: pkToken, user_agent: 'Prp4pk/1.0'});

    this.token = token;

    this.gatewayUrl = gatewayUrl;
    this.applicationId = applicationId;

    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9036 Chrome/108.0.5359.215 Electron/22.3.26 Safari/537.36',
      'Origin': 'https://discord.com/',
      'Referer': 'https://discord.com/',
      'Authorization': this.token,
    };

    this.reconnect();
  }

  private async sendLogin() {
    const gatewayOp = {
      op: 2,
      d: {
        token: this.token,
        capabilities: 16381,
        properties: {
          os: 'Windows',
          browser: 'Discord Client',
          release_channel: 'stable',
          client_version: '1.0.9035',
          os_version: '10.0.19045',
          os_arch: 'x64',
          app_arch: 'ia32',
          system_locale: 'en-G',
          browser_user_agent: 'ia32',
          browser_version: '22.3.26',
          client_build_number: 274388,
          native_build_number: 44780,
          client_event_source: null,
        },
      },
    };

    if (this.wSock) {
      await this.wSock.send(JSON.stringify(gatewayOp));
    }
  }

  private async sendKeepAlive() {
    const gatewayOp = {
      op: 1,
      d: this.seq,
    };

    if (this.wSock) {
      await this.wSock.send(JSON.stringify(gatewayOp));
    }
  }

  async switch(pkSwitch: PkSwitch) {
    if (this.waitForConnect)
      await this.waitForConnect;

    const firstFronter: Member | null = pkSwitch.members.length ? await this._pkApi.getMember({member: pkSwitch.members[0]}) : null;

    const gatewayOp = {
      op: 3,
      d: {
        status: 'online',
        since: 0,
        activities: [
          {
            state: firstFronter?.pronouns,
            details: (firstFronter?.display_name ?? firstFronter?.name) ?? NO_FRONT_TEXT,
            timestamps: pkSwitch.timestamp
              ? { start: Number(pkSwitch.timestamp), end: null }
              : null,
            assets: {
              large_image:
                firstFronter?.avatar_url
                  ? `mp:${await this.getExternalAsset(
                    firstFronter.avatar_url,
                  )}`
                  : DiscordClient.DEFAULT_EXTERNAL_ASSETS,
              large_text: firstFronter ? (firstFronter.pronouns ? `${firstFronter.display_name ?? firstFronter.name} - ${firstFronter.pronouns}` : (firstFronter.display_name ?? firstFronter.name)) : NO_FRONT_TEXT,
              small_image: firstFronter?.avatar_url
                ? DiscordClient.DEFAULT_EXTERNAL_ASSETS
                : null,
            },
            name: `${firstFronter?.display_name ?? firstFronter?.name ?? 'No one'} is fronting`,
            application_id: this.applicationId ?? DiscordClient.DEFAULT_APPLICATION_ID,
            type: PresenceType.LISTENING_TO,
          },
        ],
        afk: false,
        broadcast: null,
      },
    };

    this.lastSwitch = pkSwitch;

    if (this.wSock) {
      await this.wSock.send(JSON.stringify(gatewayOp));
    }
  }
}