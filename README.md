# lolPing Signal Wheel for Owlbear Rodeo 2

This is a standalone Owlbear Rodeo 2 extension built with `@owlbear-rodeo/sdk`. It registers an Owlbear toolbar tool with `OBR.tool.create` and `OBR.tool.createMode`, then sends room pings through Owlbear's broadcast API. It is not a Foundry VTT module or a Foundry adapter.

## Use

1. In Owlbear Rodeo, add this production manifest URL: <https://yyzz97.github.io/lolping-owlbear/manifest.json>. For development, run `npm run dev` and add the local Vite URL's `/manifest.json`.
2. In the room, open the Extensions menu and enable **lolPing · Signal Wheel for Owlbear Rodeo**.
3. Select the extension's tool in the room toolbar.
4. On the map, hold the left mouse button to open the wheel, drag toward one of eight signals, then release to send it. Releasing in the center sends the default **Caution** ping; press **Esc** to cancel.
5. Everyone in the same room with the extension enabled sees the same scene-point ping, the sender name, and the signal name. Signals stack when they overlap and fade after three seconds.

The wheel uses a compact center disc, thin gold radial guides, gray transparent gradients for idle sectors and blue gradients for the selected sector. The center preview renders above the disc, with an Esc keycap and Back hint below it. The supplied PNG signal icons use centered Owlbear billboards sized in CSS pixels, and switching assets updates their image grid as well as their dimensions. The wheel geometry and item positions compensate for the current viewport scale; billboards and label text retain their native screen size. A sent ping shows its signal icon above a softly glowing oval ring with a short sender/signal label on a transparent background. The signal is anchored to the point where the gesture began. The supplied OGG cues are played locally; Web Audio remains a fallback when a browser blocks or cannot load a cue. Bait uses the supplied `Bait_ping_SFX.ogg`.

## Develop

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
npm run check
npm test
npm run build
```

Use the Vite URL for local extension development. `npm run build` writes the Owlbear manifest, background page, and assets to `dist/`; the build step converts manifest resource paths to the hosted GitHub Pages URLs.

The wheel's inner and outer radii are 85 and 170 CSS pixels (1:2), including the center selection boundary and sector artwork. The transparent UI artwork is committed in `public/ui/`. Regenerate it with `python scripts/generate-ui-assets.py` on Windows with Pillow installed; Python and Pillow are not required to build or run the extension.

## Two-client acceptance

Install the same manifest in two clients in one room. Give the clients different map zoom and pan positions, then send each of the eight signals: Retreat, Bait, On My Way, All In, Assist Me, Hold, Enemy Missing, and Push. Both clients should see each marker on the same scene point with the sender and signal name; a second signal can overlap it, and both disappear after three seconds. Release in the wheel center to send Caution; press **Esc** to cancel. Switch scenes and verify old markers disappear and new signals do not cross into the other scene.

The unit tests use a mock Owlbear API. They do not replace this live, two-client check.

## Notes

- Room messages are ephemeral and are not saved as permanent scene items.
- Scene identity is stored in this extension's scene metadata so signals from one scene are ignored in another. If scene metadata cannot be written, the extension hashes the shared scene item IDs as a fallback.
- The Owlbear implementation includes the user-provided modified PNG and OGG assets in `public/assets/`; these are separate from the original FVTT reference project and are used only by this player-made extension.
- Inspired by the signal categories and radial interaction in [DMHPJ/fvtt-lolping](https://github.com/DMHPJ/fvtt-lolping).
