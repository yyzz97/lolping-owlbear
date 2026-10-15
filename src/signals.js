export const SIGNALS = [
  { id: 'retreat', name: '撤退', label: 'RETREAT', color: '#f12c55' },
  { id: 'bait', name: '诱饵', label: 'BAIT', color: '#d8c79a' },
  { id: 'omw', name: '正在路上', label: 'ON MY WAY', color: '#22b9e9' },
  { id: 'allin', name: '开战', label: 'ALL IN', color: '#d8c79a' },
  { id: 'assist', name: '请求协助', label: 'ASSIST ME', color: '#16ce86' },
  { id: 'hold', name: '防守', label: 'HOLD', color: '#d8c79a' },
  { id: 'missing', name: '敌人消失', label: 'ENEMY MISSING', color: '#f6ba00' },
  { id: 'push', name: '推进', label: 'PUSH', color: '#16ce86' },
];

export const DEFAULT_SIGNAL = { id: 'caution', name: '注意', label: 'CAUTION', color: '#f6ba00' };

const LEGACY_SIGNAL_IDS = Object.freeze({ danger: 'retreat', needvision: 'hold', enemyvision: 'bait' });

export const signalById = id => SIGNALS.find(signal => signal.id === id)
  ?? SIGNALS.find(signal => signal.id === LEGACY_SIGNAL_IDS[id]);
