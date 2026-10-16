import OBR, { buildBillboard, buildLabel } from '@owlbear-rodeo/sdk';
import { registerExtension } from './extension.js';
import { uiAssetsFor, preloadImages } from './ui-assets.js';
import packageJson from '../package.json';

const wheelIcon = new URL('./wheel-tool.png', document.baseURI).href;
const asset = file => ({
  audioUrl: new URL(`./assets/${file}_SFX.ogg`, document.baseURI).href,
});

const signalAssets = Object.freeze({
  retreat: asset('Retreat_ping'),
  enemyvision: asset('Enemy_Vision_ping'),
  omw: asset('On_My_Way_ping'),
  allin: asset('All_In_ping'),
  assist: asset('Assist_Me_ping'),
  needvision: asset('Need_Vision_ping'),
  missing: asset('Enemy_Missing_ping'),
  push: asset('Push_ping'),
  caution: asset('Caution_ping'),
});

const uiAssets = uiAssetsFor(document.baseURI);
void preloadImages(uiAssets);
registerExtension(OBR, { buildBillboard, buildLabel, signalAssets, wheelIcon, uiAssets, version: packageJson.version });
