// The shapes of stickers and accounts, shared by the sticker UI and the lazily loaded client
// (client.ts) without the UI importing the client module for its types.
export type Stamp = { anchor: string; x: number; y: number; kind: number; angle: number; createdAt: number };
export type PlacedStamp = Stamp & { id: string; owner: string; slot: string; avatar?: string };
// A signed-in visitor: the Firebase UID and the Gravatar hash shown on their stickers.
export type Account = { uid: string; avatar: string };
// A change to the visitor's stickers on one page.
export type Change = { id: string; path: string } & (
  | { type: 'add'; stamp: PlacedStamp }
  | { type: 'remove'; target: PlacedStamp }
  | { type: 'move'; target: PlacedStamp; stamp: PlacedStamp }
);
// A change waiting to be saved, with the account it was made with (`uid`); it is never saved
// for another one.
export type Operation = Change & { uid: string };
// Your record on a page as saved: your stickers, and the one a place or move wrote.
export type SavedRecord = { owner: string; stamps: PlacedStamp[]; placed?: PlacedStamp };
