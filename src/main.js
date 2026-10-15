import OBR, { buildBillboard } from '@owlbear-rodeo/sdk';
import { registerExtension } from './extension.js';
import { uiAssetsFor } from './ui-assets.js';
import { renderPingLabel } from './render-ping.js';
import packageJson from '../package.json';

const wheelIcon = new URL('./wheel.svg', document.baseURI).href;
const asset = file => ({
  audioUrl: new URL(`./assets/${file}_SFX.ogg`, document.baseURI).href,
});

const signalAssets = Object.freeze({
  retreat: asset('Retreat_ping'),
  bait: asset('Bait_ping'),
  omw: asset('On_My_Way_ping'),
  allin: asset('All_In_ping'),
  assist: asset('Assist_Me_ping'),
  hold: asset('Hold_ping'),
  missing: asset('Enemy_Missing_ping'),
  push: asset('Push_ping'),
  caution: asset('Caution_ping'),
});

registerExtension(OBR, { buildBillboard, signalAssets, wheelIcon, uiAssets: uiAssetsFor(document.baseURI), renderPingLabel, version: packageJson.version });
