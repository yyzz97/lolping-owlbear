import OBR, { buildBillboard, buildLabel, buildPath } from '@owlbear-rodeo/sdk';
import { registerExtension } from './extension.js';

const wheelIcon = new URL('./wheel.svg', document.baseURI).href;
const asset = (file, width = 256) => ({
  width,
  height: width,
  imageUrl: new URL(`./assets/${file}.png`, document.baseURI).href,
  audioUrl: new URL(`./assets/${file}_SFX.ogg`, document.baseURI).href,
});

const signalAssets = Object.freeze({
  retreat: asset('Retreat_ping'),
  bait: asset('Bait_ping', 128),
  omw: asset('On_My_Way_ping'),
  allin: asset('All_In_ping'),
  assist: asset('Assist_Me_ping'),
  hold: asset('Hold_ping'),
  missing: asset('Enemy_Missing_ping'),
  push: asset('Push_ping'),
  caution: asset('Caution_ping'),
});

registerExtension(OBR, { buildBillboard, buildLabel, buildPath, signalAssets, wheelIcon });
