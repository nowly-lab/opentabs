import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';

export interface ChatworkRoom {
  room_id: number;
  name: string;
  unread_num: number;
  mention_num: number;
  selected: boolean;
  last_update_time: number | null;
}

export interface ChatworkMessage {
  message_id: string;
  account_id: number;
  account_name: string;
  body: string;
  send_time: number;
  room_id: number;
}

interface GatewayStatus {
  success?: boolean;
  message?: string;
}

interface GatewayResponse<T> {
  status?: GatewayStatus;
  result?: T;
}

interface RawGatewayChat {
  id?: string | number;
  mid?: string | number;
  aid?: string | number;
  msg?: string;
  tm?: string | number;
}

interface LoadChatResult {
  chat_list?: RawGatewayChat[] | Record<string, RawGatewayChat>;
  contact_dat?: Record<string, { name?: string }>;
}

interface SendChatResult {
  chat_id?: string | number;
  id?: string | number;
  message_id?: string | number;
}

const getStringGlobal = (name: string): string => {
  const value = getPageGlobal(name);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const getAuth = (): { myid: string; token: string; clientVersion: string } => {
  const myid = getStringGlobal('myid') || getStringGlobal('MYID');
  const token = getStringGlobal('ACCESS_TOKEN') || getStringGlobal('access_token');
  const clientVersion = getStringGlobal('client_ver') || getStringGlobal('CLIENT_VER') || '1.0';
  if (!myid || !token) {
    throw ToolError.auth(
      'ChatWork web auth globals were not found. Open ChatWork in Chrome and wait for it to finish loading.',
    );
  }
  return { myid, token, clientVersion };
};

export const isChatworkGatewayReady = (): boolean => {
  if (!/(\.|^)chatwork\.com$/i.test(window.location.hostname)) return false;
  try {
    const auth = getAuth();
    return auth.myid.length > 0 && auth.token.length > 0;
  } catch {
    return false;
  }
};

const toGatewayUrl = (cmd: string, params: Record<string, string | number | boolean | undefined> = {}): string => {
  const { myid, token, clientVersion } = getAuth();
  const url = new URL('/gateway.php', window.location.origin);
  url.searchParams.set('cmd', cmd);
  url.searchParams.set('myid', myid);
  url.searchParams.set('_v', clientVersion);
  url.searchParams.set('_av', '5');
  url.searchParams.set('_ma', '');
  url.searchParams.set('_im', '');
  url.searchParams.set('ln', 'ja');
  url.searchParams.set('_t', token);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const assertGatewaySuccess = <T>(cmd: string, data: GatewayResponse<T>): T => {
  if (data.status && data.status.success === false) {
    throw ToolError.internal(`ChatWork gateway ${cmd} failed: ${data.status.message ?? 'unknown error'}`);
  }
  return (data.result ?? {}) as T;
};

const gatewayPost = async <T>(
  cmd: string,
  pdata: Record<string, unknown>,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> => {
  const body = new URLSearchParams();
  body.set('pdata', JSON.stringify({ ...pdata, _: Date.now() }));
  const response = await fetch(toGatewayUrl(cmd, params), {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw ToolError.internal(`ChatWork gateway ${cmd} returned HTTP ${response.status}`);
  return assertGatewaySuccess(cmd, (await response.json()) as GatewayResponse<T>);
};

const textOf = (element: Element | null | undefined): string => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const parseInteger = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const normalized = value.replace(/[^\d]/g, '');
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getCurrentRoomId = (): number | null => {
  const match = window.location.href.match(/#!rid(\d+)/) ?? window.location.hash.match(/rid(\d+)/);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
};

const roomIdFromElement = (element: Element): number | null => {
  const value =
    element.getAttribute('data-rid') ??
    element.getAttribute('data-room-id') ??
    element.getAttribute('data-roomid') ??
    element.getAttribute('rel') ??
    element.id ??
    '';
  const match =
    value.match(/(\d{4,})/) ??
    element
      .querySelector('a[href*="rid"]')
      ?.getAttribute('href')
      ?.match(/rid(\d+)/);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
};

const unreadCountFromElement = (element: Element): number => {
  const badge = element.querySelector('[class*="unread"], [class*="Unread"], [aria-label*="未読"], [title*="未読"]');
  return parseInteger(textOf(badge) || badge?.getAttribute('aria-label') || badge?.getAttribute('title')) ?? 0;
};

export const listUnreadRoomsFromDom = (limit: number): ChatworkRoom[] => {
  const elements = Array.from(
    new Set([
      ...Array.from(document.querySelectorAll<HTMLElement>('#_roomListItems li, #_roomListArea li')),
      ...Array.from(document.querySelectorAll<HTMLElement>('[data-rid], [data-room-id], [data-roomid]')),
      ...Array.from(document.querySelectorAll<HTMLElement>('a[href*="rid"]')),
    ]),
  );
  const rooms = new Map<number, ChatworkRoom>();
  for (const element of elements) {
    const roomId = roomIdFromElement(element);
    if (!roomId || rooms.has(roomId)) continue;
    const unreadNum = unreadCountFromElement(element);
    if (unreadNum <= 0) continue;
    rooms.set(roomId, {
      room_id: roomId,
      name:
        textOf(element)
          .replace(/\b\d+\b$/, '')
          .trim() || `rid${roomId}`,
      unread_num: unreadNum,
      mention_num: /to|mention|自分|あなた/i.test(element.className.toString() + textOf(element)) ? unreadNum : 0,
      selected: getCurrentRoomId() === roomId,
      last_update_time: null,
    });
  }
  return [...rooms.values()].slice(0, limit);
};

const normalizeChatList = (chatList: LoadChatResult['chat_list']): RawGatewayChat[] => {
  if (Array.isArray(chatList)) return chatList;
  if (chatList && typeof chatList === 'object') return Object.values(chatList);
  return [];
};

export const loadMessages = async (roomId: number, limit: number, force: boolean): Promise<ChatworkMessage[]> => {
  const result = await gatewayPost<LoadChatResult>('load_chat', {
    desc: 1,
    room_id: roomId,
    unread_num: force ? 0 : 1,
    last_chat_id: 0,
    first_chat_id: 0,
    file: 1,
    task: 1,
    limit_num: limit,
  });
  const contacts = result.contact_dat ?? {};
  return normalizeChatList(result.chat_list)
    .map(chat => {
      const accountId = Number(chat.aid ?? 0);
      return {
        message_id: String(chat.id ?? chat.mid ?? ''),
        account_id: accountId,
        account_name: contacts[String(accountId)]?.name ?? '',
        body: chat.msg ?? '',
        send_time: Number(chat.tm ?? 0),
        room_id: roomId,
      };
    })
    .filter(message => message.message_id || message.body)
    .slice(-limit);
};

export const buildReplyBody = (roomId: number, message: ChatworkMessage, replyText: string): string => {
  // ChatWork accepts the rp tag by account/message IDs; gateway history may omit the display name.
  const displayName = message.account_name || `aid:${message.account_id}`;
  return `[rp aid=${message.account_id} to=${roomId}-${message.message_id}] ${displayName}\n${replyText}`;
};

export const postMessage = async (roomId: number, body: string): Promise<string> => {
  const result = await gatewayPost<SendChatResult>('send_chat', {
    room_id: roomId,
    msg: body,
  });
  return String(result.chat_id ?? result.message_id ?? result.id ?? '');
};

export const inspectGatewayContext = (): Record<string, string | number | boolean | null> => {
  let authReady = false;
  try {
    authReady = isChatworkGatewayReady();
  } catch {
    authReady = false;
  }
  return {
    authReady,
    myid: getStringGlobal('myid') || getStringGlobal('MYID') || null,
    hasAccessToken: Boolean(getStringGlobal('ACCESS_TOKEN') || getStringGlobal('access_token')),
    clientVersion: getStringGlobal('client_ver') || getStringGlobal('CLIENT_VER') || null,
    currentRoomId: getCurrentRoomId(),
    origin: window.location.origin,
  };
};
