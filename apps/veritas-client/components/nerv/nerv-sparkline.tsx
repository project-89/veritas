export interface NervSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showEndDot?: boolean;
}

export function NervSparkline({
  data,
  width = 80,
  height = 20,
  color = '#00FF41',
  showEndDot = false,
}: NervSparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      role="img"
      aria-label="Trend sparkline"
    >
      <title>Trend sparkline</title>
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showEndDot && last && <circle cx={last.x} cy={last.y} r={2} fill={color} />}
    </svg>
  );
}
