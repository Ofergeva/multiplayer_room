# Description

- A webapp multiplayer game that is essentially a chat room.
- A top-down view. Small sprites.
- When a player navigates to the url (localhost:5173 in dev) they need to input their handle. Prevent 2 handles in the same room.
- A Player can press any point on the canvas and the sprite will walk to it.
- If a player presses on another sprite (another player), walk up to them and face them.
- At the bottom of the canvas there should be a text input field.
- When the player hits "send" (use a lucide.dev icon) the message appears as a speech bubble emitted from their sprite. Everyone in the room can see it.
- If the player is facing another sprite, only that player can see the message (private message)
- there should be a button to leave the room.

## Tech Stack

1. Node.js + express (or something lighter)
2. Typescript
3. React
4. Vite
