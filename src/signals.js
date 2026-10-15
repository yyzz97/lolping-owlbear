export const SIGNALS = [
  { id: 'retreat', name: '撤退', label: '撤退', color: '#f12c55', message: '发出信号，请撤退！' },
  { id: 'push', name: '推进', label: '推进', color: '#16ce86', message: '想要向前推进' },
  { id: 'omw', name: '正在路上', label: '正在路上', color: '#22b9e9', message: '正在路上' },
  { id: 'allin', name: '全力进攻', label: '全力进攻', color: '#d8c79a', message: '发出信号，请全力进攻！' },
  { id: 'assist', name: '协助我', label: '协助我', color: '#16ce86', message: '正在请求协助' },
  { id: 'needvision', name: '需要视野', label: '需要视野', color: '#16ce86', message: '正在请求视野' },
  { id: 'missing', name: '敌人消失', label: '敌人消失', color: '#f6ba00', message: '示意敌人已不见踪迹' },
  { id: 'enemyvision', name: '敌方视野', label: '敌方视野', color: '#f12c55', message: '示意敌方在这有视野' },
];

export const DEFAULT_SIGNAL = { id: 'caution', name: '谨慎行事', label: '谨慎行事', color: '#f6ba00', message: '发出信号，请谨慎行事！' };

const LEGACY_SIGNAL_IDS = Object.freeze({ danger: 'retreat', bait: 'enemyvision', hold: 'needvision' });

export const signalById = id => id === DEFAULT_SIGNAL.id ? DEFAULT_SIGNAL : SIGNALS.find(signal => signal.id === id)
  ?? SIGNALS.find(signal => signal.id === LEGACY_SIGNAL_IDS[id]);
