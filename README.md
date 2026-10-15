# lolPing Signal Wheel for Owlbear Rodeo 2

This is a standalone Owlbear Rodeo 2 extension built with `@owlbear-rodeo/sdk`. It registers an Owlbear toolbar tool with `OBR.tool.create` and `OBR.tool.createMode`, then sends room pings through Owlbear's broadcast API. It is not a Foundry VTT module or a Foundry adapter.

## Use

1. In Owlbear Rodeo, add this production manifest URL: <https://yyzz97.github.io/lolping-owlbear/manifest.json>. For development, run `npm run dev` and add the local Vite URL's `/manifest.json`.
2. In the room, open the Extensions menu and enable **LOL Ping Wheel**.
3. The normal gesture does not require manually selecting the extension tool: hold **G** and the left mouse button on the map, drag toward one of eight signals, then release the left button to send it. Owlbear temporarily routes the map gesture through the extension and restores the previously active tool when **G** is released. Releasing in the center sends **谨慎行事**; release **G** or press **Esc** to cancel. Selecting the toolbar tool remains available for users who prefer it.
4. Everyone in the same room with the extension enabled sees the same scene-point ping and a Chinese sender message. Signals stack when they overlap and remain visible for two seconds. A player can send at most four signals in five seconds; the fifth attempt starts a twelve-second cooldown.

The wheel uses a compact center disc, thin gold radial guides, black transparent idle sectors with visible gold boundaries and blue selected sectors. The four cardinal sectors are darker through the diagonal edge and extend about 20% farther before fading quickly; diagonal sectors stay flatter and more transparent. From 12 o'clock clockwise the signals are 撤退、推进、正在路上、全力进攻、协助我、需要视野、敌人消失、敌方视野. Each wheel state is assembled from a static base, a selection overlay, and a center overlay, so changing the highlighted signal never removes and recreates the wheel. The selected outer icon is redrawn above the blue selection layer. The center has a low-saturation deep-green-to-black disc, a thin deep-gold outer rim, and a thicker pale-gold inner rim. Each ping uses a hosted PNG for its icon and glowing oval, with an Owlbear native label for the sender message. Labels have a transparent background and no pointer; no data or blob image URLs are generated. The label and icon share the original scene anchor and leave view-scale limits unset for Owlbear's screen-space zoom compensation. The wheel is 472 CSS pixels wide. The wheel tool itself has the Owlbear G shortcut: holding G activates the mode temporarily, and releasing G restores the prior tool. Wheel images are preloaded, and pointer bursts are coalesced to the latest position so slow host replies do not accumulate stale moves; release still uses the latest viewport scale and position. Signals stay anchored to the original scene point. The supplied OGG cues play locally; Web Audio remains a fallback when a browser blocks or cannot load a cue.

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

The wheel's center radius is 85 CSS pixels; diagonal artwork reaches 180 pixels and cardinal artwork reaches 195 pixels. Outer icons are 42 pixels, and center previews are 32 pixels. The transparent UI artwork is committed in `public/ui/`. Regenerate it with `python scripts/generate-ui-assets.py` on Windows with Pillow installed; Python and Pillow are not required to build or run the extension. With the Vite server running, `/tests/render-fixture.html` previews all wheel states and the browser's actual PNG/text composition.

## Two-client acceptance

Install the same manifest in two clients in one room. Give the clients different map zoom and pan positions, then hold **G** plus the left mouse button and send each of the eight signals in clockwise order: 撤退、推进、正在路上、全力进攻、协助我、需要视野、敌人消失、敌方视野. Both clients should see each marker on the same scene point with the Chinese sender message; a second signal can overlap it, and both disappear after two seconds. Release in the wheel center to send 谨慎行事; release **G** or press **Esc** to cancel. Switch scenes and verify old markers disappear and new signals do not cross into the other scene.

The unit tests use a mock Owlbear API. They do not replace this live, two-client check.

Check minimum and maximum map zoom, then zoom again while a wheel is open and while a ping is visible. The entire wheel must retain its shape and size, and ping labels must stay below their rings. Check `ENEMY MISSING` is complete, and compare clients whose scenes use different grid DPI values.

## Notes

- Room messages are ephemeral and are not saved as permanent scene items.
- Scene identity is stored in this extension's scene metadata so signals from one scene are ignored in another. If scene metadata cannot be written, the extension hashes the shared scene item IDs as a fallback.
- The Owlbear implementation includes the user-provided modified PNG and OGG assets in `public/assets/`; these are separate from the original FVTT reference project and are used only by this player-made extension.
- Inspired by the signal categories and radial interaction in [DMHPJ/fvtt-lolping](https://github.com/DMHPJ/fvtt-lolping).
