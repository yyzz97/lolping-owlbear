export const SIGNALS = [
  { id: 'danger', name: '危险', icon: '⚠', color: '#ff5064' },
  { id: 'push', name: '推进', icon: '➤', color: '#52d58b' },
  { id: 'omw', name: '正在路上', icon: '➜', color: '#55a9ff' },
  { id: 'allin', name: '开战', icon: '⚔', color: '#f5c85c' },
  { id: 'assist', name: '请求协助', icon: '✚', color: '#6bd878' },
  { id: 'needvision', name: '需要视野', icon: '◉', color: '#8bcbff' },
  { id: 'missing', name: '敌人消失', icon: '?', color: '#e9ce63' },
  { id: 'enemyvision', name: '敌方有视野', icon: '◈', color: '#f17886' },
];

export const signalById = id => SIGNALS.find(signal => signal.id === id);
