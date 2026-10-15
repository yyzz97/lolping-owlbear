export const WHEEL = Object.freeze({ innerRadius: 85, outerRadius: 170, renderOuterRadius: 180, iconRadius: 128, iconSize: 42 });

export function pickSlice(dx, dy, deadZone = WHEEL.innerRadius) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < deadZone) return -1;
  const degrees = (Math.atan2(dy, dx) * 180 / Math.PI + 112.5 + 360) % 360;
  return Math.floor(degrees / 45) % 8;
}

export function sectorCommands(index, innerRadius = WHEEL.innerRadius, outerRadius = WHEEL.outerRadius) {
  const center = -90 + index * 45;
  const start = center - 22.5;
  const end = center + 22.5;
  const point = (radius, angle) => [radius * Math.cos(angle * Math.PI / 180), radius * Math.sin(angle * Math.PI / 180)];
  const steps = 8;
  const commands = [];
  const first = point(innerRadius, start);
  commands.push([0, first[0], first[1]]);
  const edge = point(outerRadius, start);
  commands.push([1, edge[0], edge[1]]);
  for (let step = 1; step <= steps; step++) {
    const [x, y] = point(outerRadius, start + (end - start) * step / steps);
    commands.push([1, x, y]);
  }
  const innerEnd = point(innerRadius, end);
  commands.push([1, innerEnd[0], innerEnd[1]]);
  for (let step = steps - 1; step >= 0; step--) {
    const [x, y] = point(innerRadius, start + (end - start) * step / steps);
    commands.push([1, x, y]);
  }
  commands.push([5]);
  return commands;
}

export function circleCommands(radius, segments = 48) {
  const commands = [[0, radius, 0]];
  for (let index = 1; index < segments; index++) {
    const angle = index * Math.PI * 2 / segments;
    commands.push([1, radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  commands.push([5]);
  return commands;
}

export function spokeCommands(innerRadius = WHEEL.innerRadius, outerRadius = WHEEL.outerRadius) {
  const commands = [];
  for (let index = 0; index < 8; index++) {
    const angle = (-112.5 + index * 45) * Math.PI / 180;
    commands.push(
      [0, innerRadius * Math.cos(angle), innerRadius * Math.sin(angle)],
      [1, outerRadius * Math.cos(angle), outerRadius * Math.sin(angle)],
    );
  }
  return commands;
}
