import OBR, { buildLabel, buildPath } from '@owlbear-rodeo/sdk';
import { registerExtension } from './extension.js';

const wheelIcon = new URL('./wheel.svg', document.baseURI).href;

registerExtension(OBR, { buildLabel, buildPath, wheelIcon });
