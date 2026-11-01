// The shapes of stickers and accounts, shared by the sticker UI and the lazily loaded client
// (src/stamps-client.ts) without the UI importing the client module for its types.
export type Stamp = { anchor: string; x: number; y: number; kind: number; angle: number; createdAt: number };
export type PlacedStamp = Stamp & { id: string; owner: string; slot: string; avatar?: string };
// A signed-in visitor: the Firebase UID and the Gravatar hash shown on their stickers.
export type Account = { uid: string; avatar: string };
// A change to the visitor's stickers on one page, waiting to be saved.
// `retry`: sent again after a failure whose request may still have been saved.
export type Operation = { id: string; path: string; retry?: boolean } & (
  | { type: 'add'; stamp: PlacedStamp }
  | { type: 'remove'; target: PlacedStamp }
  | { type: 'move'; target: PlacedStamp; stamp: PlacedStamp }
);
